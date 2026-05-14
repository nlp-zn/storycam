import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderFailure, TextGenerationProvider } from "@/lib/providers/types";
import {
  storyWorldProviderOutputSchema,
  type StoryWorldProviderInput,
  type StoryWorldProviderOutput,
  type UploadedPhotoReference
} from "@/lib/providers/storyWorld";
import { defaultStoryCamVideoAspectRatio, parseStoryCamVideoAspectRatio, type StoryCamVideoAspectRatio } from "@/features/storycam/domain/videoSettings";
import {
  handdrawnTravelVlogPhotoReferenceNote,
  handdrawnTravelVlogModeId,
  handdrawnTravelVlogVisualStyle,
  isHanddrawnTravelVlogMode,
  parseStoryModeId
} from "@/features/storycam/domain/storyModes";
import { createMockStoryWorldProvider } from "@/lib/providers/mock/storyWorldProvider";
import { hashLogIdentifier } from "@/lib/privacy/redact";
import type { Database, MediaAssetRow, StoryCamArtifactRow, StoryCamSessionRow } from "@/server/db/types";
import type { GenerationJobRow, Json } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { StoryCamSessionRepository } from "./sessionRepository";

export const storyWorldInputMaxLength = 2_000;

export type StoryWorldRequestBody = {
  generationMode?: "mock" | "real";
  input?: unknown;
  lightweightChoices?: unknown;
  plannedDurationSeconds?: unknown;
  sessionId?: unknown;
  storyModeId?: unknown;
  travelDestination?: unknown;
  uploadedPhotoIds?: unknown;
  videoAspectRatio?: unknown;
};

export type StoryWorldArtifactRef = {
  id: string;
  state: StoryCamArtifactRow["state"];
  type: StoryCamArtifactRow["type"];
  version: number;
};

export type StoryWorldServiceOutput = {
  artifacts: {
    characterAssets: StoryWorldArtifactRef[];
    sceneAssets: StoryWorldArtifactRef[];
    script: StoryWorldArtifactRef;
  };
  sessionId: string;
  storyWorld: PublicStoryWorldProviderOutput;
  videoAspectRatio: StoryCamVideoAspectRatio;
};

export type PublicStoryWorldProviderOutput = Omit<StoryWorldProviderOutput, "script"> & {
  script: Omit<StoryWorldProviderOutput["script"], "directorBrief">;
};

export type StoryWorldJobOutput = {
  jobId: string;
  providerName: string;
  sessionId: string;
  status: GenerationJobRow["status"];
};

export class StoryWorldRequestError extends Error {
  constructor(readonly code: "invalid_generation_mode" | "invalid_input" | "invalid_photos" | "session_not_found") {
    super(`StoryCam story world request error: ${code}`);
    this.name = "StoryWorldRequestError";
  }
}

export async function createStoryWorld(
  client: SupabaseClient<Database>,
  userId: string,
  body: StoryWorldRequestBody,
  provider: TextGenerationProvider<StoryWorldProviderInput, StoryWorldProviderOutput> = createMockStoryWorldProvider()
): Promise<ProviderFailure | { ok: true; value: StoryWorldServiceOutput }> {
  const input = parseStoryWorldRequest(body);
  const sessions = new StoryCamSessionRepository(client);
  const artifacts = new StoryCamArtifactRepository(client);
  const mediaAssets = new StoryCamMediaAssetRepository(client);
  const loadedSession = await loadOrCreateStoryWorldSession({
    input,
    sessions,
    userId
  });

  if (!loadedSession) {
    throw new StoryWorldRequestError("session_not_found");
  }

  const session = await applyInitialVideoAspectRatio({
    artifacts,
    requestedAspectRatio: input.requestedVideoAspectRatio,
    session: loadedSession,
    sessions,
    userId
  });
  const uploadedPhotoRefs = await resolveUploadedPhotoRefs(mediaAssets, userId, session.id, input.uploadedPhotoIds);
  const providerResult = await provider.generate({
    idea: input.input,
    lightweightChoices: input.lightweightChoices,
    sessionId: session.id,
    storyModeId: input.storyModeId,
    travelDestination: input.travelDestination,
    uploadedPhotoRefs
  });

  if (!providerResult.ok) {
    return providerResult;
  }

  const storyWorld = storyWorldProviderOutputSchema.parse(applyStoryModePolicy(providerResult.value, input));
  const script = requireArtifactRow(
    await artifacts.createVersion(userId, {
      dataJson: storyWorld.script,
      sessionId: session.id,
      state: "ready",
      type: "script",
      version: storyWorld.script.version
    })
  );
  const characterAssets = await Promise.all(
    storyWorld.characterAssets.map((asset) =>
      artifacts.createVersion(userId, {
        dataJson: asset,
        sessionId: session.id,
        state: "ready",
        type: "character_asset",
        version: asset.version
      })
    )
  );
  const sceneAssets = await Promise.all(
    storyWorld.sceneAssets.map((asset) =>
      artifacts.createVersion(userId, {
        dataJson: asset,
        sessionId: session.id,
        state: "ready",
        type: "scene_asset",
        version: asset.version
      })
    )
  );

  return {
    ok: true,
    value: {
      artifacts: {
        characterAssets: characterAssets.map((artifact) => toArtifactRef(requireArtifactRow(artifact))),
        sceneAssets: sceneAssets.map((artifact) => toArtifactRef(requireArtifactRow(artifact))),
        script: toArtifactRef(script)
      },
      sessionId: session.id,
      storyWorld: toPublicStoryWorld(storyWorld),
      videoAspectRatio: parseStoryCamVideoAspectRatio(session.video_aspect_ratio) ?? defaultStoryCamVideoAspectRatio
    }
  };
}

export async function createStoryWorldJob(
  client: SupabaseClient<Database>,
  userId: string,
  body: StoryWorldRequestBody,
  options: {
    generationMode: GenerationJobRow["generation_mode"];
    providerName: string;
  }
): Promise<StoryWorldJobOutput> {
  const input = parseStoryWorldRequest(body);
  const sessions = new StoryCamSessionRepository(client);
  const artifacts = new StoryCamArtifactRepository(client);
  const mediaAssets = new StoryCamMediaAssetRepository(client);
  const loadedSession = await loadOrCreateStoryWorldSession({ input, sessions, userId });

  if (!loadedSession) {
    throw new StoryWorldRequestError("session_not_found");
  }

  const session = await applyInitialVideoAspectRatio({
    artifacts,
    requestedAspectRatio: input.requestedVideoAspectRatio,
    session: loadedSession,
    sessions,
    userId
  });

  await resolveUploadedPhotoRefs(mediaAssets, userId, session.id, input.uploadedPhotoIds);

  const idempotencyKeyHash = hashLogIdentifier(
    stableStoryWorldJobHashInput({
      input,
      providerName: options.providerName,
      sessionId: session.id
    })
  );
  const jobs = new StoryCamGenerationJobRepository(client);
  const existingJob = await jobs.findActiveByIdempotencyKey(userId, idempotencyKeyHash);

  if (existingJob && !isFailedOrExpiredStoryWorldJob(existingJob)) {
    return toStoryWorldJobOutput(existingJob);
  }

  const inputArtifact = requireArtifactRow(
    await artifacts.createVersion(userId, {
      dataJson: toStoryWorldInputArtifactJson(input, session.id),
      sessionId: session.id,
      state: "ready",
      type: "input",
      version: 1
    })
  );
  const job = await jobs.create(userId, {
    generationMode: options.generationMode,
    idempotencyKeyHash,
    inputArtifactVersionsJson: {
      [inputArtifact.id]: inputArtifact.version,
      storyWorldInputArtifactId: inputArtifact.id
    },
    maxAttempts: 1,
    providerKind: "text",
    providerName: options.providerName,
    sessionId: session.id,
    status: "queued",
    type: "story_world"
  });

  if (!job) {
    throw new Error("StoryCam story-world job creation failed.");
  }

  return toStoryWorldJobOutput(job);
}

export async function completeStoryWorldJob(
  client: SupabaseClient<Database>,
  job: GenerationJobRow,
  provider?: TextGenerationProvider<StoryWorldProviderInput, StoryWorldProviderOutput>
) {
  const jobs = new StoryCamGenerationJobRepository(client);

  if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled" || job.status === "expired") {
    return job;
  }

  if (job.status === "cancel_requested" || job.tombstoned_at) {
    return (await jobs.markCanceled(job.user_id, job.id)) ?? job;
  }

  if (job.provider_name !== "mock" && !provider) {
    return (
      (await jobs.markFailed(job.user_id, job.id, {
        errorCode: "STORY_WORLD_PROVIDER_UNAVAILABLE",
        redactedError: "Story world generation failed."
      })) ?? job
    );
  }

  try {
    const requestBody = await loadStoryWorldJobRequestBody(client, job);
    const result = await createStoryWorld(client, job.user_id, requestBody, provider);

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

    return (await jobs.markSucceeded(job.user_id, job.id, { outputArtifactId: result.value.artifacts.script.id })) ?? job;
  } catch (error) {
    const errorCode = error instanceof StoryWorldRequestError ? error.code : "STORY_WORLD_JOB_FAILED";

    return (
      (await jobs.markFailed(job.user_id, job.id, {
        errorCode,
        redactedError: "Story world generation failed."
      })) ?? job
    );
  }
}

async function applyInitialVideoAspectRatio({
  artifacts,
  requestedAspectRatio,
  session,
  sessions,
  userId
}: {
  artifacts: StoryCamArtifactRepository;
  requestedAspectRatio: StoryCamVideoAspectRatio | undefined;
  session: StoryCamSessionRow;
  sessions: StoryCamSessionRepository;
  userId: string;
}): Promise<StoryCamSessionRow> {
  if (requestedAspectRatio === undefined) {
    return session;
  }

  const currentAspectRatio = parseStoryCamVideoAspectRatio(session.video_aspect_ratio) ?? defaultStoryCamVideoAspectRatio;

  if (currentAspectRatio === requestedAspectRatio) {
    return session;
  }

  const existingArtifacts = (await artifacts.listBySession(userId, { sessionId: session.id })) ?? [];

  if (existingArtifacts.length > 0) {
    return session;
  }

  const updatedSession = await sessions.update(userId, session.id, {
    videoAspectRatio: requestedAspectRatio
  });

  if (!updatedSession) {
    throw new StoryWorldRequestError("session_not_found");
  }

  return updatedSession;
}

export function toPublicStoryWorld(storyWorld: StoryWorldProviderOutput): PublicStoryWorldProviderOutput {
  const { directorBrief: _directorBrief, ...script } = storyWorld.script;

  return {
    ...storyWorld,
    script
  };
}

async function loadOrCreateStoryWorldSession({
  input,
  sessions,
  userId
}: {
  input: ReturnType<typeof parseStoryWorldRequest>;
  sessions: StoryCamSessionRepository;
  userId: string;
}): Promise<StoryCamSessionRow | null> {
  if (input.sessionId) {
    return sessions.findById(userId, input.sessionId);
  }

  return sessions.create(userId, {
    generationMode: input.generationMode,
    plannedDurationSeconds: input.plannedDurationSeconds,
    videoAspectRatio: input.videoAspectRatio
  });
}

export function parseStoryWorldRequest(body: StoryWorldRequestBody) {
  const input = typeof body.input === "string" ? body.input.trim() : "";
  const generationMode = body.generationMode ?? "mock";
  const storyModeId = parseStoryModeId(body.storyModeId);
  const uploadedPhotoIds = parseStringArray(body.uploadedPhotoIds);
  const travelDestination = parseTravelDestination(body.travelDestination);

  if (generationMode !== "mock" && generationMode !== "real") {
    throw new StoryWorldRequestError("invalid_generation_mode");
  }

  if (body.storyModeId !== undefined && !storyModeId) {
    throw new StoryWorldRequestError("invalid_input");
  }

  if (!input || input.length > storyWorldInputMaxLength) {
    throw new StoryWorldRequestError("invalid_input");
  }

  if (isHanddrawnTravelVlogMode(storyModeId)) {
    if (uploadedPhotoIds.length !== 1) {
      throw new StoryWorldRequestError("invalid_photos");
    }

    if (!travelDestination) {
      throw new StoryWorldRequestError("invalid_input");
    }
  }

  return {
    generationMode,
    input,
    lightweightChoices: parseStringArray(body.lightweightChoices),
    plannedDurationSeconds: parsePlannedDuration(body.plannedDurationSeconds),
    requestedVideoAspectRatio: parseRequestedVideoAspectRatio(body.videoAspectRatio),
    sessionId: typeof body.sessionId === "string" && body.sessionId ? body.sessionId : undefined,
    storyModeId,
    travelDestination,
    uploadedPhotoIds,
    videoAspectRatio: parseVideoAspectRatioWithDefault(body.videoAspectRatio)
  };
}

function toStoryWorldInputArtifactJson(input: ReturnType<typeof parseStoryWorldRequest>, sessionId: string): Json {
  return {
    generationMode: input.generationMode,
    input: input.input,
    lightweightChoices: input.lightweightChoices,
    plannedDurationSeconds: input.plannedDurationSeconds,
    requestedVideoAspectRatio: input.requestedVideoAspectRatio ?? null,
    sessionId,
    storyModeId: input.storyModeId ?? null,
    travelDestination: input.travelDestination ?? null,
    uploadedPhotoIds: input.uploadedPhotoIds,
    videoAspectRatio: input.videoAspectRatio
  };
}

async function loadStoryWorldJobRequestBody(client: SupabaseClient<Database>, job: GenerationJobRow): Promise<StoryWorldRequestBody> {
  const inputArtifactId = storyWorldInputArtifactId(job.input_artifact_versions_json);

  if (!inputArtifactId) {
    throw new StoryWorldRequestError("invalid_input");
  }

  const rows = (await new StoryCamArtifactRepository(client).listBySession(job.user_id, {
    sessionId: job.session_id,
    type: "input"
  })) ?? [];
  const inputArtifact = rows.find((row) => row.id === inputArtifactId && row.state === "ready");

  if (!inputArtifact || !isRecord(inputArtifact.data_json)) {
    throw new StoryWorldRequestError("invalid_input");
  }

  return {
    generationMode: inputArtifact.data_json.generationMode === "real" ? "real" : "mock",
    input: inputArtifact.data_json.input,
    lightweightChoices: inputArtifact.data_json.lightweightChoices,
    plannedDurationSeconds: inputArtifact.data_json.plannedDurationSeconds,
    sessionId: inputArtifact.data_json.sessionId,
    storyModeId: nullToUndefined(inputArtifact.data_json.storyModeId),
    travelDestination: nullToUndefined(inputArtifact.data_json.travelDestination),
    uploadedPhotoIds: inputArtifact.data_json.uploadedPhotoIds,
    videoAspectRatio: inputArtifact.data_json.videoAspectRatio
  };
}

function storyWorldInputArtifactId(value: Json) {
  if (!isRecord(value) || typeof value.storyWorldInputArtifactId !== "string") {
    return null;
  }

  return value.storyWorldInputArtifactId;
}

function nullToUndefined(value: unknown) {
  return value === null ? undefined : value;
}

function stableStoryWorldJobHashInput(input: {
  input: ReturnType<typeof parseStoryWorldRequest>;
  providerName: string;
  sessionId: string;
}) {
  return JSON.stringify({
    input: input.input.input,
    lightweightChoices: input.input.lightweightChoices,
    plannedDurationSeconds: input.input.plannedDurationSeconds,
    providerName: input.providerName,
    sessionId: input.sessionId,
    storyModeId: input.input.storyModeId ?? null,
    travelDestination: input.input.travelDestination ?? null,
    uploadedPhotoIds: input.input.uploadedPhotoIds,
    type: "story_world",
    videoAspectRatio: input.input.videoAspectRatio
  });
}

function isFailedOrExpiredStoryWorldJob(job: GenerationJobRow) {
  return job.status === "failed" || job.status === "expired";
}

function toStoryWorldJobOutput(job: GenerationJobRow): StoryWorldJobOutput {
  return {
    jobId: job.id,
    providerName: job.provider_name,
    sessionId: job.session_id,
    status: job.status
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequestedVideoAspectRatio(value: unknown): StoryCamVideoAspectRatio | undefined {
  if (value === undefined) {
    return undefined;
  }

  const aspectRatio = parseStoryCamVideoAspectRatio(value);

  if (!aspectRatio) {
    throw new StoryWorldRequestError("invalid_input");
  }

  return aspectRatio;
}

function parseVideoAspectRatioWithDefault(value: unknown): StoryCamVideoAspectRatio {
  return parseRequestedVideoAspectRatio(value) ?? defaultStoryCamVideoAspectRatio;
}

function parseTravelDestination(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new StoryWorldRequestError("invalid_input");
  }

  const trimmed = value.trim();

  if (trimmed.length > 120) {
    throw new StoryWorldRequestError("invalid_input");
  }

  return trimmed || undefined;
}

function applyStoryModePolicy(
  storyWorld: StoryWorldProviderOutput,
  input: ReturnType<typeof parseStoryWorldRequest>
): StoryWorldProviderOutput {
  const storyWorldWithMode = {
    ...storyWorld,
    script: {
      ...storyWorld.script,
      ...(input.storyModeId ? { storyModeId: input.storyModeId } : {})
    }
  };

  if (!isHanddrawnTravelVlogMode(input.storyModeId)) {
    return storyWorldWithMode;
  }

  return applyHanddrawnTravelVlogPolicy(storyWorldWithMode, input);
}

function applyHanddrawnTravelVlogPolicy(
  storyWorld: StoryWorldProviderOutput,
  input: ReturnType<typeof parseStoryWorldRequest>
): StoryWorldProviderOutput {
  const referenceMediaIds = input.uploadedPhotoIds.slice(0, 1);
  const firstCharacter = storyWorld.characterAssets[0];
  const firstScene = storyWorld.sceneAssets[0];

  return {
    characterAssets: firstCharacter
      ? [
          {
            ...firstCharacter,
            consistencyNotes: [...firstCharacter.consistencyNotes, handdrawnTravelVlogPhotoReferenceNote],
            referenceMediaIds,
            relationshipToUserStory: firstCharacter.relationshipToUserStory || "由用户照片转译出的手绘旅行主角"
          }
        ]
      : storyWorld.characterAssets,
    sceneAssets: firstScene
      ? [
          {
            ...firstScene,
            location: input.travelDestination ?? firstScene.location,
            name: firstScene.name || `${input.travelDestination ?? "旅行地"}路线资产板`,
            referenceMediaIds: []
          }
        ]
      : storyWorld.sceneAssets,
    script: {
      ...storyWorld.script,
      storyModeId: handdrawnTravelVlogModeId,
      visualStyle: handdrawnTravelVlogVisualStyle
    }
  };
}

async function resolveUploadedPhotoRefs(
  mediaAssets: StoryCamMediaAssetRepository,
  userId: string,
  sessionId: string,
  uploadedPhotoIds: string[]
): Promise<UploadedPhotoReference[]> {
  if (uploadedPhotoIds.length === 0) {
    return [];
  }

  const mediaRows = (await mediaAssets.listBySession(userId, sessionId)) ?? [];
  const refs = uploadedPhotoIds.map((id) => mediaRows.find((row) => row.id === id && row.kind === "uploaded_photo"));

  if (refs.some((row) => !row)) {
    throw new StoryWorldRequestError("invalid_photos");
  }

  return refs.map((row) => ({
    mediaAssetId: (row as MediaAssetRow).id
  }));
}

function parseStringArray(value: unknown) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new StoryWorldRequestError("invalid_input");
  }

  return value;
}

function parsePlannedDuration(value: unknown) {
  if (value === undefined) {
    return 12;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StoryWorldRequestError("invalid_input");
  }

  return value;
}

function requireArtifactRow(row: StoryCamArtifactRow | null) {
  if (!row) {
    throw new Error("StoryCam story world artifact write failed.");
  }

  return row;
}

function toArtifactRef(row: StoryCamArtifactRow): StoryWorldArtifactRef {
  return {
    id: row.id,
    state: row.state,
    type: row.type,
    version: row.version
  };
}
