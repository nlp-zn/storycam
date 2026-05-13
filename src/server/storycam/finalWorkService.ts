import type { SupabaseClient } from "@supabase/supabase-js";
import { finalWorkSchema, generatedClipSchema } from "@/features/storycam/domain/artifactSchemas";
import type { FinalWork } from "@/features/storycam/domain/artifacts";
import type {
  FfmpegComposerInput,
  FfmpegComposerOutput
} from "@/lib/providers/finalWork/ffmpegComposer";
import { createFfmpegFinalWorkComposer } from "@/lib/providers/finalWork/ffmpegComposer";
import { hashLogIdentifier } from "@/lib/privacy/redact";
import type { FinalWorkComposer } from "@/lib/providers/types";
import type { Database, GenerationJobRow, Json, MediaAssetRow, StoryCamArtifactRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";
import { writeGeneratedStoryCamMedia, type WriteGeneratedStoryCamMediaResult } from "./generatedMediaService";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import {
  assertStoryCamPrivateBucket,
  createStoryCamSignedUrl,
  downloadStoryCamObject,
  storyCamGeneratedBucket,
  storyCamSignedUrlTtlSeconds
} from "./mediaStore";
import { StoryCamSessionRepository } from "./sessionRepository";

export type ComposeFinalWorkInput = {
  clips: FfmpegComposerInput["clips"];
  inputArtifactVersions?: Record<string, number>;
  sessionId: string;
  stitchSuggestionId?: string;
  userId: string;
};

export type ComposeFinalWorkOutput = {
  artifact: FinalWorkArtifactRef;
  finalWork: FinalWork;
  media: WriteGeneratedStoryCamMediaResult;
};

export type FinalWorkPreviewUrl = {
  signedUrl: string;
  signedUrlExpiresIn: number;
};

export type FinalWorkJobOutput = {
  jobId: string;
  outputArtifactId?: string;
  providerName: string;
  status: GenerationJobRow["status"];
};

export type StoryCamArtifactRef = {
  id: string;
  state: StoryCamArtifactRow["state"];
  type: StoryCamArtifactRow["type"];
  version: number;
};

export type FinalWorkArtifactRef = StoryCamArtifactRef;

export type StitchSuggestionRequestBody = {
  generatedClipArtifactIds?: unknown;
  sessionId?: unknown;
};

export type FinalWorkRequestBody = {
  idempotencyKey?: unknown;
  sessionId?: unknown;
  stitchSuggestionArtifactId?: unknown;
};

export type StitchSuggestionData = {
  generatedClipArtifactIds: string[];
  generatedClipIds: string[];
  id: string;
  recommendation: string;
  sessionId: string;
  state: "ready";
  version: number;
};

export class FinalWorkRequestError extends Error {
  constructor(readonly code: "generated_clip_not_confirmed" | "invalid_input" | "session_not_found" | "stitch_suggestion_not_found") {
    super(`StoryCam final work request error: ${code}`);
    this.name = "FinalWorkRequestError";
  }
}

export async function createStitchSuggestion(client: SupabaseClient<Database>, userId: string, body: StitchSuggestionRequestBody) {
  const input = parseStitchSuggestionRequest(body);
  const session = await new StoryCamSessionRepository(client).findById(userId, input.sessionId);

  if (!session) {
    throw new FinalWorkRequestError("session_not_found");
  }

  const artifacts = new StoryCamArtifactRepository(client);
  const generatedClipArtifacts = await loadReadyGeneratedClipArtifacts(artifacts, userId, session.id, input.generatedClipArtifactIds);
  const data = {
    generatedClipArtifactIds: generatedClipArtifacts.map((row) => row.id),
    generatedClipIds: generatedClipArtifacts.map((row) => generatedClipSchema.parse(row.data_json).id),
    id: "stitch-suggestion-1",
    recommendation: "Render the ready 15 second clip as one private final work.",
    sessionId: session.id,
    state: "ready",
    version: 1
  } satisfies StitchSuggestionData;
  const artifact = await artifacts.createVersion(userId, {
    dataJson: data,
    dependsOnJson: Object.fromEntries(generatedClipArtifacts.map((row) => [row.id, row.version])),
    sessionId: session.id,
    state: "ready",
    type: "stitch_suggestion",
    version: data.version
  });

  return {
    ok: true,
    value: {
      stitchSuggestion: toArtifactRef(requireArtifactRow(artifact))
    }
  } as const;
}

export async function createFinalWorkFromSuggestion(
  client: SupabaseClient<Database>,
  userId: string,
  body: FinalWorkRequestBody,
  composer: FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput> = createFfmpegFinalWorkComposer()
) {
  const input = parseFinalWorkRequest(body);
  const session = await new StoryCamSessionRepository(client).findById(userId, input.sessionId);

  if (!session) {
    throw new FinalWorkRequestError("session_not_found");
  }

  const artifacts = new StoryCamArtifactRepository(client);
  const rows = (await artifacts.listBySession(userId, { sessionId: session.id })) ?? [];
  const stitchSuggestion = rows.find(
    (row) => row.id === input.stitchSuggestionArtifactId && row.type === "stitch_suggestion" && row.state === "ready"
  );

  if (!stitchSuggestion) {
    throw new FinalWorkRequestError("stitch_suggestion_not_found");
  }

  const suggestionData = parseStitchSuggestionData(stitchSuggestion.data_json);
  const generatedClipArtifacts = await loadReadyGeneratedClipArtifacts(
    artifacts,
    userId,
    session.id,
    suggestionData.generatedClipArtifactIds
  );
  const mediaRows = (await new StoryCamMediaAssetRepository(client).listBySession(userId, session.id)) ?? [];
  const clips = await Promise.all(
    generatedClipArtifacts.map(async (artifact) => {
      const generatedClip = generatedClipSchema.parse(artifact.data_json);
      const media = requireMediaAsset(mediaRows, generatedClip.mediaAssetId);

      assertStoryCamPrivateBucket(media.storage_bucket);

      return {
        bytes: await downloadStoryCamObject(client, media.storage_bucket, media.storage_path),
        durationSeconds: generatedClip.durationSeconds,
        generatedClipId: generatedClip.id
      };
    })
  );

  return composeAndStoreFinalWork(client, composer, {
    clips,
    inputArtifactVersions: Object.fromEntries([
      [stitchSuggestion.id, stitchSuggestion.version],
      ...generatedClipArtifacts.map((row) => [row.id, row.version] as const)
    ]),
    sessionId: session.id,
    stitchSuggestionId: stitchSuggestion.id,
    userId
  });
}

export async function createFinalWorkJobFromSuggestion(
  client: SupabaseClient<Database>,
  userId: string,
  body: FinalWorkRequestBody,
  generationMode: GenerationJobRow["generation_mode"]
): Promise<FinalWorkJobOutput> {
  const input = parseFinalWorkRequest(body);
  const { generatedClipArtifacts, session, stitchSuggestion } = await loadFinalWorkArtifacts(client, userId, input);
  const idempotencyKeyHash = hashLogIdentifier(
    [
      "storycam-final-work",
      input.sessionId,
      generatedClipArtifacts.map((row) => row.id).sort().join(","),
      input.idempotencyKey
    ].join(":")
  );
  const jobs = new StoryCamGenerationJobRepository(client);
  const existingJob = await jobs.findActiveByIdempotencyKey(userId, idempotencyKeyHash);

  if (existingJob) {
    return toFinalWorkJobOutput(existingJob);
  }

  const job = await jobs.create(userId, {
    generationMode,
    idempotencyKeyHash,
    inputArtifactVersionsJson: Object.fromEntries([
      [stitchSuggestion.id, stitchSuggestion.version],
      ...generatedClipArtifacts.map((row) => [row.id, row.version] as const)
    ]),
    maxAttempts: 1,
    providerKind: "stitch",
    providerName: "ffmpeg",
    sessionId: session.id,
    status: "queued",
    type: "final_work"
  });

  if (!job) {
    throw new Error("StoryCam final work job creation failed.");
  }

  return toFinalWorkJobOutput(job);
}

export async function completeFinalWorkJob(
  client: SupabaseClient<Database>,
  job: GenerationJobRow,
  composer: FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput> = createFfmpegFinalWorkComposer()
) {
  const jobs = new StoryCamGenerationJobRepository(client);

  if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled" || job.status === "expired") {
    return job;
  }

  if (job.status === "cancel_requested" || job.tombstoned_at) {
    return (await jobs.markCanceled(job.user_id, job.id)) ?? job;
  }

  try {
    const input = await loadFinalWorkCompositionInput(client, job);
    const result = await composeAndStoreFinalWork(client, composer, input);

    if (!result.ok) {
      return (
        (await jobs.markFailed(job.user_id, job.id, {
          errorCode: result.errorCode,
          providerErrorCategory: result.providerErrorCategory,
          providerHttpStatus: result.providerHttpStatus,
          redactedError: result.redactedError
        })) ?? job
      );
    }

    return (await jobs.markSucceeded(job.user_id, job.id, { outputArtifactId: result.value.artifact.id })) ?? job;
  } catch {
    return (
      (await jobs.markFailed(job.user_id, job.id, {
        errorCode: "FINAL_WORK_JOB_FAILED",
        redactedError: "Final work generation failed."
      })) ?? job
    );
  }
}

export async function composeAndStoreFinalWork(
  client: SupabaseClient<Database>,
  composer: FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput>,
  input: ComposeFinalWorkInput
) {
  const composed = await composer.compose({ clips: input.clips });

  if (!composed.ok) {
    return composed;
  }

  const media = await writeGeneratedStoryCamMedia(client, {
    bytes: composed.value.bytes,
    kind: "final_work",
    mimeType: "video/mp4",
    sessionId: input.sessionId,
    source: "composer",
    userId: input.userId
  });
  const finalWork = finalWorkSchema.parse({
    durationSeconds: composed.value.durationSeconds,
    generatedClipIds: input.clips.map((clip) => clip.generatedClipId),
    id: "final-work-1",
    mediaAssetId: media.id,
    previewStatus: "ready",
    sessionId: input.sessionId,
    state: "ready",
    ...(input.stitchSuggestionId ? { stitchSuggestionId: input.stitchSuggestionId } : {}),
    version: 1
  });
  const artifact = await new StoryCamArtifactRepository(client).createVersion(input.userId, {
    dataJson: finalWork,
    dependsOnJson: input.inputArtifactVersions ?? {},
    sessionId: input.sessionId,
    state: "ready",
    type: "final_work",
    version: 1
  });

  if (!artifact) {
    throw new Error("StoryCam final work failed to create artifact metadata.");
  }

  return {
    ok: true,
    providerKind: composed.providerKind,
    providerName: composed.providerName,
    value: {
      artifact: toArtifactRef(artifact),
      finalWork,
      media
    }
  } as const;
}

export async function createPrivateFinalWorkPreviewUrl(
  client: SupabaseClient<Database>,
  input: {
    expiresIn?: number;
    media: WriteGeneratedStoryCamMediaResult;
  }
): Promise<FinalWorkPreviewUrl> {
  const signedUrlExpiresIn = input.expiresIn ?? storyCamSignedUrlTtlSeconds;

  return {
    signedUrl: await createStoryCamSignedUrl(client, storyCamGeneratedBucket, input.media.path, signedUrlExpiresIn),
    signedUrlExpiresIn
  };
}

function parseStitchSuggestionRequest(body: StitchSuggestionRequestBody) {
  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : "";

  if (!sessionId || !Array.isArray(body.generatedClipArtifactIds) || body.generatedClipArtifactIds.length < 1) {
    throw new FinalWorkRequestError("invalid_input");
  }

  if (body.generatedClipArtifactIds.length > 3 || body.generatedClipArtifactIds.some((id) => typeof id !== "string" || !id)) {
    throw new FinalWorkRequestError("invalid_input");
  }

  return {
    generatedClipArtifactIds: body.generatedClipArtifactIds,
    sessionId
  };
}

function parseFinalWorkRequest(body: FinalWorkRequestBody) {
  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : "";
  const stitchSuggestionArtifactId =
    typeof body.stitchSuggestionArtifactId === "string" && body.stitchSuggestionArtifactId ? body.stitchSuggestionArtifactId : "";

  if (!sessionId || !stitchSuggestionArtifactId || typeof body.idempotencyKey !== "string" || !body.idempotencyKey) {
    throw new FinalWorkRequestError("invalid_input");
  }

  return {
    idempotencyKey: body.idempotencyKey,
    sessionId,
    stitchSuggestionArtifactId
  };
}

async function loadFinalWorkArtifacts(
  client: SupabaseClient<Database>,
  userId: string,
  input: ReturnType<typeof parseFinalWorkRequest>
) {
  const session = await new StoryCamSessionRepository(client).findById(userId, input.sessionId);

  if (!session) {
    throw new FinalWorkRequestError("session_not_found");
  }

  const artifacts = new StoryCamArtifactRepository(client);
  const rows = (await artifacts.listBySession(userId, { sessionId: session.id })) ?? [];
  const stitchSuggestion = rows.find(
    (row) => row.id === input.stitchSuggestionArtifactId && row.type === "stitch_suggestion" && row.state === "ready"
  );

  if (!stitchSuggestion) {
    throw new FinalWorkRequestError("stitch_suggestion_not_found");
  }

  const suggestionData = parseStitchSuggestionData(stitchSuggestion.data_json);
  const generatedClipArtifacts = await loadReadyGeneratedClipArtifacts(
    artifacts,
    userId,
    session.id,
    suggestionData.generatedClipArtifactIds
  );

  return { generatedClipArtifacts, session, stitchSuggestion };
}

async function loadFinalWorkCompositionInput(
  client: SupabaseClient<Database>,
  job: GenerationJobRow
): Promise<ComposeFinalWorkInput> {
  const artifacts = new StoryCamArtifactRepository(client);
  const rows = (await artifacts.listBySession(job.user_id, { sessionId: job.session_id })) ?? [];
  const versionMap = job.input_artifact_versions_json && typeof job.input_artifact_versions_json === "object"
    ? (job.input_artifact_versions_json as Record<string, unknown>)
    : {};
  const stitchSuggestion = rows.find(
    (row) => row.type === "stitch_suggestion" && row.state === "ready" && typeof versionMap[row.id] === "number"
  );

  if (!stitchSuggestion) {
    throw new FinalWorkRequestError("stitch_suggestion_not_found");
  }

  const suggestionData = parseStitchSuggestionData(stitchSuggestion.data_json);
  const generatedClipArtifacts = await loadReadyGeneratedClipArtifacts(
    artifacts,
    job.user_id,
    job.session_id,
    suggestionData.generatedClipArtifactIds
  );
  const mediaRows = (await new StoryCamMediaAssetRepository(client).listBySession(job.user_id, job.session_id)) ?? [];
  const clips = await Promise.all(
    generatedClipArtifacts.map(async (artifact) => {
      const generatedClip = generatedClipSchema.parse(artifact.data_json);
      const media = requireMediaAsset(mediaRows, generatedClip.mediaAssetId);

      assertStoryCamPrivateBucket(media.storage_bucket);

      return {
        bytes: await downloadStoryCamObject(client, media.storage_bucket, media.storage_path),
        durationSeconds: generatedClip.durationSeconds,
        generatedClipId: generatedClip.id
      };
    })
  );

  return {
    clips,
    inputArtifactVersions: Object.fromEntries([
      [stitchSuggestion.id, stitchSuggestion.version],
      ...generatedClipArtifacts.map((row) => [row.id, row.version] as const)
    ]),
    sessionId: job.session_id,
    stitchSuggestionId: stitchSuggestion.id,
    userId: job.user_id
  };
}

async function loadReadyGeneratedClipArtifacts(
  artifacts: StoryCamArtifactRepository,
  userId: string,
  sessionId: string,
  generatedClipArtifactIds: string[]
) {
  const rows = (await artifacts.listBySession(userId, { sessionId, type: "generated_clip" })) ?? [];
  const generatedClipArtifacts = generatedClipArtifactIds.map((id) => rows.find((row) => row.id === id && row.state === "ready"));

  if (generatedClipArtifacts.some((row) => !row)) {
    throw new FinalWorkRequestError("generated_clip_not_confirmed");
  }

  return generatedClipArtifacts.map((row) => row as StoryCamArtifactRow);
}

function parseStitchSuggestionData(value: Json): StitchSuggestionData {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray(value.generatedClipArtifactIds) ||
    value.generatedClipArtifactIds.some((id) => typeof id !== "string" || !id)
  ) {
    throw new FinalWorkRequestError("stitch_suggestion_not_found");
  }

  const generatedClipArtifactIds = value.generatedClipArtifactIds.filter((id): id is string => typeof id === "string" && Boolean(id));

  return {
    generatedClipArtifactIds,
    generatedClipIds: Array.isArray(value.generatedClipIds) ? value.generatedClipIds.filter((id): id is string => typeof id === "string") : [],
    id: typeof value.id === "string" ? value.id : "stitch-suggestion-1",
    recommendation: typeof value.recommendation === "string" ? value.recommendation : "Render one private final work.",
    sessionId: typeof value.sessionId === "string" ? value.sessionId : "",
    state: "ready",
    version: typeof value.version === "number" ? value.version : 1
  };
}

function requireMediaAsset(rows: MediaAssetRow[], mediaAssetId: string) {
  const media = rows.find((row) => row.id === mediaAssetId);

  if (!media) {
    throw new FinalWorkRequestError("generated_clip_not_confirmed");
  }

  return media;
}

function requireArtifactRow(row: StoryCamArtifactRow | null) {
  if (!row) {
    throw new Error("StoryCam final work artifact write failed.");
  }

  return row;
}

function toArtifactRef(row: StoryCamArtifactRow): StoryCamArtifactRef {
  return {
    id: row.id,
    state: row.state,
    type: row.type,
    version: row.version
  };
}

function toFinalWorkJobOutput(job: GenerationJobRow): FinalWorkJobOutput {
  return {
    jobId: job.id,
    ...(job.output_artifact_id ? { outputArtifactId: job.output_artifact_id } : {}),
    providerName: job.provider_name,
    status: job.status
  };
}
