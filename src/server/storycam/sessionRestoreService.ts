import type { SupabaseClient } from "@supabase/supabase-js";
import {
  characterAssetSchema,
  coreStoryboardGroupSchema,
  expandedStoryboardCardSchema,
  finalWorkSchema,
  generatedClipSchema,
  sceneAssetSchema,
  storyboardScriptSchema,
  storyScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import { createDurationPlan } from "@/features/storycam/domain/durationRules";
import type { Database, GenerationJobRow, MediaAssetRow, StoryCamArtifactRow, StoryCamSessionRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { createStoryCamSignedUrl, storyCamSignedUrlTtlSeconds, type StoryCamPrivateBucket } from "./mediaStore";
import { StoryCamSessionRepository } from "./sessionRepository";
import { generatingStoryboardImage, placeholderStoryboardImage, type GeneratedStoryboardImageState } from "./storyboardImageService";
import { toPublicStoryWorld, type PublicStoryWorldProviderOutput } from "./storyWorldService";

type ArtifactRef = {
  id: string;
  parentArtifactId?: string | null;
  state: StoryCamArtifactRow["state"];
  type: StoryCamArtifactRow["type"];
  version: number;
};

type RestoredMedia = {
  id: string;
  mimeType: string;
  signedUrl: string;
  signedUrlExpiresIn: number;
};

type RestoredCurrentStep = "clip-generation" | "clip-review" | "core-storyboard" | "export" | "story-world";

export type RestoreStoryCamSessionOutput =
  | {
      ok: true;
      restored: false;
    }
  | {
      clipJob?: RestoredGenerationJob;
      coreGroupTargetCount: 1 | 2 | 3;
      currentStep: RestoredCurrentStep;
      finalWork?: RestoredFinalWork;
      ok: true;
      restored: true;
      sessionId: string;
      storyboard: RestoredStoryboard | null;
      storyWorld: RestoredStoryWorld;
      storyWorldConfirmed: boolean;
    };

export type RecentStoryCamProject = {
  coreGroupTargetCount: 1 | 2 | 3;
  currentStep: RestoredCurrentStep;
  sessionId: string;
  summary: string;
  thumbnail: RestoredMedia | null;
  title: string;
  updatedAt: string;
};

export type ListRecentStoryCamProjectsOutput = {
  ok: true;
  projects: RecentStoryCamProject[];
};

export class StoryCamSessionRestoreError extends Error {
  constructor(readonly code: "not_found") {
    super(`StoryCam session restore error: ${code}`);
    this.name = "StoryCamSessionRestoreError";
  }
}

type RestoredStoryWorld = {
  assetImagesByArtifactId: Record<string, RestoredMedia>;
  artifacts: {
    characterAssets: ArtifactRef[];
    sceneAssets: ArtifactRef[];
    script: ArtifactRef;
  };
  ok: true;
  sessionId: string;
  storyWorld: {
    characterAssets: PublicStoryWorldProviderOutput["characterAssets"];
    sceneAssets: PublicStoryWorldProviderOutput["sceneAssets"];
    script: PublicStoryWorldProviderOutput["script"];
  };
};

type RestoredStoryboard = {
  artifacts: {
    coreStoryboardGroups: ArtifactRef[];
    expandedStoryboardCards?: ArtifactRef[];
    storyboardScript: ArtifactRef;
    storyboardScripts: ArtifactRef[];
  };
  durationPlan: {
    clipDurationTargets: number[];
    coreGroupTargetCount: 1 | 2 | 3;
    plannedDurationSeconds: number;
  };
  ok: true;
  sessionId: string;
  storyboard: {
    coreStoryboardGroups: Array<Record<string, unknown>>;
    storyboardScript: unknown;
  };
};

type RestoredGenerationJob = {
  attempts: number;
  id: string;
  outputArtifactId?: string;
  outputPreview?: {
    durationSeconds: number;
    mimeType: string;
    signedUrl: string;
    signedUrlExpiresIn: number;
  };
  providerErrorCategory?: string;
  providerHttpStatus?: number;
  providerKind: GenerationJobRow["provider_kind"];
  providerName: string;
  redactedError?: string;
  sessionId: string;
  status: GenerationJobRow["status"];
  type: GenerationJobRow["type"];
};

type RestoredFinalWork = {
  finalWork: ArtifactRef;
  media: {
    byteSize: number;
    id: string;
    kind: "final_work";
    mimeType: string;
  };
  ok: true;
  preview?: {
    durationSeconds: number;
    mimeType: string;
    signedUrl: string;
    signedUrlExpiresIn: number;
  };
};

type StoryWorldBundle = {
  characterRows: StoryCamArtifactRow[];
  sceneRows: StoryCamArtifactRow[];
  scriptRow: StoryCamArtifactRow;
};

export async function restoreCurrentStoryCamSession(
  client: SupabaseClient<Database>,
  userId: string
): Promise<RestoreStoryCamSessionOutput> {
  const sessions = (await new StoryCamSessionRepository(client).listRecentRestorableCandidates(userId, 50)) ?? [];

  for (const session of sessions) {
    const restored = await restoreSession(client, userId, session);

    if (restored) {
      return restored;
    }
  }

  return {
    ok: true,
    restored: false
  };
}

export async function restoreStoryCamSessionById(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string
): Promise<Exclude<RestoreStoryCamSessionOutput, { restored: false }>> {
  const session = await new StoryCamSessionRepository(client).findById(userId, sessionId);

  if (!session) {
    throw new StoryCamSessionRestoreError("not_found");
  }

  const restored = await restoreSession(client, userId, session);

  if (!restored) {
    throw new StoryCamSessionRestoreError("not_found");
  }

  return restored;
}

export async function listRecentStoryCamProjects(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 5
): Promise<ListRecentStoryCamProjectsOutput> {
  const projectLimit = Math.min(5, Math.max(1, Math.floor(limit)));
  const candidateLimit = Math.max(projectLimit * 10, 50);
  const sessions = (await new StoryCamSessionRepository(client).listRecentRestorableCandidates(userId, candidateLimit)) ?? [];
  const projects: RecentStoryCamProject[] = [];

  for (const session of sessions) {
    if (projects.length >= projectLimit) {
      break;
    }

    const summary = await summarizeSession(client, userId, session);

    if (summary) {
      projects.push(summary);
    }
  }

  return {
    ok: true,
    projects
  };
}

async function restoreSession(
  client: SupabaseClient<Database>,
  userId: string,
  session: StoryCamSessionRow
): Promise<Exclude<RestoreStoryCamSessionOutput, { restored: false }> | null> {
  const artifacts = new StoryCamArtifactRepository(client);
  const mediaAssets = new StoryCamMediaAssetRepository(client);
  const artifactRows = (await artifacts.listBySession(userId, { sessionId: session.id })) ?? [];
  const storyWorldBundle = findRestorableStoryWorldBundle(artifactRows);

  if (!storyWorldBundle) {
    return null;
  }

  const mediaRows = (await mediaAssets.listBySession(userId, session.id)) ?? [];
  const storyWorld = await restoreStoryWorld(client, session.id, storyWorldBundle, mediaRows);
  const storyboard = await restoreStoryboard(client, userId, session, storyWorldBundle, artifactRows, mediaRows);
  const clipJob = storyboard ? await restoreLatestClipJob(client, userId, session.id, artifactRows, mediaRows) : undefined;
  const finalWork = storyboard ? await restoreLatestFinalWork(client, artifactRows, mediaRows) : undefined;
  const coreGroupTargetCount = toCoreGroupTargetCount(session.core_group_target_count) ?? storyboard?.durationPlan.coreGroupTargetCount ?? 1;

  return {
    ...(clipJob ? { clipJob } : {}),
    coreGroupTargetCount,
    currentStep: currentStepForRestoredSession({ clipJob, finalWork, storyboard }),
    ...(finalWork ? { finalWork } : {}),
    ok: true,
    restored: true,
    sessionId: session.id,
    storyboard,
    storyWorld,
    storyWorldConfirmed: Boolean(storyboard)
  };
}

async function summarizeSession(
  client: SupabaseClient<Database>,
  userId: string,
  session: StoryCamSessionRow
): Promise<RecentStoryCamProject | null> {
  const artifacts = new StoryCamArtifactRepository(client);
  const mediaAssets = new StoryCamMediaAssetRepository(client);
  const artifactRows = (await artifacts.listBySession(userId, { sessionId: session.id })) ?? [];
  const storyWorldBundle = findRestorableStoryWorldBundle(artifactRows);

  if (!storyWorldBundle) {
    return null;
  }

  const mediaRows = (await mediaAssets.listBySession(userId, session.id)) ?? [];
  const storyboard = await restoreStoryboard(client, userId, session, storyWorldBundle, artifactRows, mediaRows);
  const clipJob = storyboard ? await restoreLatestClipJob(client, userId, session.id, artifactRows, mediaRows) : undefined;
  const finalWork = storyboard ? await restoreLatestFinalWork(client, artifactRows, mediaRows) : undefined;
  const script = storyScriptSchema.parse(storyWorldBundle.scriptRow.data_json);
  const coreGroupTargetCount = toCoreGroupTargetCount(session.core_group_target_count) ?? storyboard?.durationPlan.coreGroupTargetCount ?? 1;

  return {
    coreGroupTargetCount,
    currentStep: currentStepForRestoredSession({ clipJob, finalWork, storyboard }),
    sessionId: session.id,
    summary: script.summary,
    thumbnail: await restoreProjectThumbnail(client, storyboard, storyWorldBundle, mediaRows),
    title: script.title,
    updatedAt: session.updated_at
  };
}

function findRestorableStoryWorldBundle(rows: StoryCamArtifactRow[]): StoryWorldBundle | null {
  const readyRows = rows.filter((row) => row.state === "ready");
  const scriptRows = readyRows
    .filter((row) => row.type === "script")
    .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at));

  for (const scriptRow of scriptRows) {
    const characterRows = readyRows
      .filter((row) => row.type === "character_asset" && timestamp(row.created_at) >= timestamp(scriptRow.created_at))
      .sort((a, b) => timestamp(a.created_at) - timestamp(b.created_at))
      .slice(0, 3);
    const sceneRows = readyRows
      .filter((row) => row.type === "scene_asset" && timestamp(row.created_at) >= timestamp(scriptRow.created_at))
      .sort((a, b) => timestamp(a.created_at) - timestamp(b.created_at))
      .slice(0, 3);

    if (characterRows.length > 0 && sceneRows.length > 0) {
      return {
        characterRows,
        sceneRows,
        scriptRow
      };
    }
  }

  return null;
}

async function restoreProjectThumbnail(
  client: SupabaseClient<Database>,
  storyboard: RestoredStoryboard | null,
  bundle: StoryWorldBundle,
  mediaRows: MediaAssetRow[]
) {
  const coreArtifactId = storyboard?.artifacts.coreStoryboardGroups[0]?.id;

  if (coreArtifactId) {
    const media = await restoreMedia(client, coreArtifactId, mediaRows);

    if (media) {
      return media;
    }
  }

  for (const row of [...bundle.characterRows, ...bundle.sceneRows]) {
    const media = await restoreMedia(client, row.id, mediaRows);

    if (media) {
      return media;
    }
  }

  return null;
}

async function restoreStoryWorld(
  client: SupabaseClient<Database>,
  sessionId: string,
  bundle: StoryWorldBundle,
  mediaRows: MediaAssetRow[]
): Promise<RestoredStoryWorld> {
  const assetRows = [...bundle.characterRows, ...bundle.sceneRows];

  return {
    assetImagesByArtifactId: await restoreAssetImages(client, assetRows, mediaRows),
    artifacts: {
      characterAssets: bundle.characterRows.map(toArtifactRef),
      sceneAssets: bundle.sceneRows.map(toArtifactRef),
      script: toArtifactRef(bundle.scriptRow)
    },
    ok: true,
    sessionId,
    storyWorld: toPublicStoryWorld({
      characterAssets: bundle.characterRows.map((row) => characterAssetSchema.parse(row.data_json)),
      sceneAssets: bundle.sceneRows.map((row) => sceneAssetSchema.parse(row.data_json)),
      script: storyScriptSchema.parse(bundle.scriptRow.data_json)
    })
  };
}

async function restoreStoryboard(
  client: SupabaseClient<Database>,
  userId: string,
  session: StoryCamSessionRow,
  bundle: StoryWorldBundle,
  rows: StoryCamArtifactRow[],
  mediaRows: MediaAssetRow[]
): Promise<RestoredStoryboard | null> {
  const targetCount = toCoreGroupTargetCount(session.core_group_target_count) ?? 1;
  const storyWorldRefs = [
    bundle.scriptRow,
    ...bundle.characterRows,
    ...bundle.sceneRows
  ].map(toArtifactRef);
  const matchingCoreRows = rows
    .filter((row) => row.type === "core_storyboard_group" && row.state === "ready" && dependsOnMatches(row, storyWorldRefs))
    .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))
    .slice(0, targetCount)
    .sort((a, b) => timestamp(a.created_at) - timestamp(b.created_at));

  if (matchingCoreRows.length === 0) {
    return null;
  }

  const scriptRows = matchingCoreRows
    .map((coreRow) =>
      rows
        .filter((row) => row.type === "storyboard_script" && row.state === "ready" && row.parent_artifact_id === coreRow.id)
        .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))[0]
    )
    .filter((row): row is StoryCamArtifactRow => Boolean(row));

  if (scriptRows.length === 0) {
    return null;
  }

  const durationPlan = createDurationPlan({
    coreGroupTargetCount: toCoreGroupTargetCount(matchingCoreRows.length) ?? 1,
    plannedDurationSeconds: session.planned_duration_seconds
  });
  const storyboardScripts = scriptRows.map((row) => storyboardScriptSchema.parse(row.data_json));
  const storyboardScriptRefs = scriptRows.map(toArtifactRef);
  const storyboardScriptRef = storyboardScriptRefs[0];
  const imageJobs = await restoreStoryboardImageJobs(client, userId, session.id);
  const expandedStoryboardCardRefs = matchingCoreRows.flatMap((coreRow) => restoreExpandedStoryboardCardRefs(coreRow, rows));
  const coreGroupViews = await Promise.all(
    matchingCoreRows.map(async (row, index) => ({
      ...coreStoryboardGroupSchema.parse(row.data_json),
      expandedStoryboardImages: await restoreExpandedStoryboardImages(client, row, rows, mediaRows, imageJobs),
      representativeImage: await restoreStoryboardImage(client, row.id, mediaRows, imageJobs, "storyboard_image"),
      scriptArtifact: storyboardScriptRefs[index] ?? storyboardScriptRef
    }))
  );

  return {
    artifacts: {
      coreStoryboardGroups: matchingCoreRows.map(toArtifactRef),
      expandedStoryboardCards: expandedStoryboardCardRefs,
      storyboardScript: storyboardScriptRef,
      storyboardScripts: storyboardScriptRefs
    },
    durationPlan,
    ok: true,
    sessionId: session.id,
    storyboard: {
      coreStoryboardGroups: coreGroupViews,
      storyboardScript: storyboardScripts[0]
    }
  };
}

async function restoreAssetImages(client: SupabaseClient<Database>, assetRows: StoryCamArtifactRow[], mediaRows: MediaAssetRow[]) {
  const entries = await Promise.all(
    assetRows.map(async (row) => {
      const media = await restoreMedia(client, row.id, mediaRows);
      return media ? ([row.id, media] as const) : null;
    })
  );

  return Object.fromEntries(entries.filter((entry): entry is readonly [string, RestoredMedia] => Boolean(entry)));
}

async function restoreStoryboardImage(
  client: SupabaseClient<Database>,
  linkedArtifactId: string,
  mediaRows: MediaAssetRow[],
  imageJobs: GenerationJobRow[] = [],
  imageJobType?: GenerationJobRow["type"]
): Promise<GeneratedStoryboardImageState> {
  const media = await restoreMedia(client, linkedArtifactId, mediaRows);

  if (!media) {
    return restoreStoryboardImageJobState(linkedArtifactId, imageJobs, imageJobType) ?? placeholderStoryboardImage();
  }

  return {
    mediaId: media.id,
    mimeType: media.mimeType,
    placeholder: false,
    signedUrl: media.signedUrl,
    signedUrlExpiresIn: media.signedUrlExpiresIn,
    status: "ready"
  };
}

async function restoreExpandedStoryboardImages(
  client: SupabaseClient<Database>,
  coreRow: StoryCamArtifactRow,
  rows: StoryCamArtifactRow[],
  mediaRows: MediaAssetRow[],
  imageJobs: GenerationJobRow[]
) {
  const cards = rows
    .filter((row) => row.type === "expanded_storyboard_card" && row.state === "ready" && row.parent_artifact_id === coreRow.id)
    .sort((a, b) => {
      const aCard = expandedStoryboardCardSchema.safeParse(a.data_json);
      const bCard = expandedStoryboardCardSchema.safeParse(b.data_json);
      return (aCard.success ? aCard.data.sortOrder : 0) - (bCard.success ? bCard.data.sortOrder : 0);
    })
    .slice(0, 8);

  return Promise.all(cards.map((card) => restoreStoryboardImage(client, card.id, mediaRows, imageJobs, "expanded_storyboard_image")));
}

async function restoreStoryboardImageJobs(client: SupabaseClient<Database>, userId: string, sessionId: string) {
  const jobs = (await new StoryCamGenerationJobRepository(client).listBySession(userId, sessionId)) ?? [];

  return jobs.filter((job) => job.type === "storyboard_image" || job.type === "expanded_storyboard_image");
}

function restoreStoryboardImageJobState(
  linkedArtifactId: string,
  imageJobs: GenerationJobRow[],
  imageJobType?: GenerationJobRow["type"]
): GeneratedStoryboardImageState | null {
  const job = imageJobs
    .filter((candidate) => {
      if (candidate.output_artifact_id !== linkedArtifactId) {
        return false;
      }

      return imageJobType ? candidate.type === imageJobType : true;
    })
    .sort((a, b) => timestamp(b.updated_at) - timestamp(a.updated_at))[0];

  if (!job) {
    return null;
  }

  if (job.status === "queued" || job.status === "running" || job.status === "cancel_requested") {
    return generatingStoryboardImage(job.id);
  }

  return placeholderStoryboardImage("provider_failed");
}

async function restoreLatestClipJob(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  artifactRows: StoryCamArtifactRow[],
  mediaRows: MediaAssetRow[]
): Promise<RestoredGenerationJob | undefined> {
  const jobs = ((await new StoryCamGenerationJobRepository(client).listBySession(userId, sessionId)) ?? [])
    .filter((job) => job.type === "video_clip")
    .sort((a, b) => timestamp(b.updated_at) - timestamp(a.updated_at));
  const job = jobs[0];

  if (!job) {
    return undefined;
  }

  const outputPreview = await restoreGeneratedClipPreview(client, job.output_artifact_id, artifactRows, mediaRows);

  return {
    attempts: job.attempts,
    id: job.id,
    ...(job.output_artifact_id ? { outputArtifactId: job.output_artifact_id } : {}),
    ...(outputPreview ? { outputPreview } : {}),
    ...(job.provider_error_category ? { providerErrorCategory: job.provider_error_category } : {}),
    ...(job.provider_http_status !== null ? { providerHttpStatus: job.provider_http_status } : {}),
    providerKind: job.provider_kind,
    providerName: job.provider_name,
    ...(job.redacted_error ? { redactedError: job.redacted_error } : {}),
    sessionId: job.session_id,
    status: job.status,
    type: job.type
  };
}

async function restoreGeneratedClipPreview(
  client: SupabaseClient<Database>,
  outputArtifactId: string | null,
  artifactRows: StoryCamArtifactRow[],
  mediaRows: MediaAssetRow[]
) {
  if (!outputArtifactId) {
    return undefined;
  }

  const artifact = artifactRows.find((row) => row.id === outputArtifactId && row.type === "generated_clip" && row.state === "ready");

  if (!artifact) {
    return undefined;
  }

  const generatedClip = generatedClipSchema.parse(artifact.data_json);
  const media = await restoreMediaById(client, generatedClip.mediaAssetId, mediaRows);

  if (!media) {
    return undefined;
  }

  return {
    durationSeconds: generatedClip.durationSeconds,
    mimeType: media.mimeType,
    signedUrl: media.signedUrl,
    signedUrlExpiresIn: media.signedUrlExpiresIn
  };
}

async function restoreLatestFinalWork(
  client: SupabaseClient<Database>,
  artifactRows: StoryCamArtifactRow[],
  mediaRows: MediaAssetRow[]
): Promise<RestoredFinalWork | undefined> {
  const artifact = artifactRows
    .filter((row) => row.type === "final_work" && row.state === "ready")
    .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))[0];

  if (!artifact) {
    return undefined;
  }

  const finalWork = finalWorkSchema.parse(artifact.data_json);
  const media = mediaRows.find((row) => row.id === finalWork.mediaAssetId);
  const previewMedia = await restoreMediaById(client, finalWork.mediaAssetId, mediaRows);

  if (!media) {
    return undefined;
  }

  const restored: RestoredFinalWork = {
    finalWork: toArtifactRef(artifact),
    media: {
      byteSize: media.byte_size,
      id: media.id,
      kind: "final_work",
      mimeType: media.mime_type
    },
    ok: true
  };

  if (previewMedia) {
    restored.preview = {
      durationSeconds: finalWork.durationSeconds,
      mimeType: previewMedia.mimeType,
      signedUrl: previewMedia.signedUrl,
      signedUrlExpiresIn: previewMedia.signedUrlExpiresIn
    };
  }

  return restored;
}

function restoreExpandedStoryboardCardRefs(coreRow: StoryCamArtifactRow, rows: StoryCamArtifactRow[]) {
  return rows
    .filter((row) => row.type === "expanded_storyboard_card" && row.state === "ready" && row.parent_artifact_id === coreRow.id)
    .sort((a, b) => {
      const aCard = expandedStoryboardCardSchema.safeParse(a.data_json);
      const bCard = expandedStoryboardCardSchema.safeParse(b.data_json);
      return (aCard.success ? aCard.data.sortOrder : 0) - (bCard.success ? bCard.data.sortOrder : 0);
    })
    .slice(0, 8)
    .map(toArtifactRef);
}

async function restoreMedia(
  client: SupabaseClient<Database>,
  linkedArtifactId: string,
  mediaRows: MediaAssetRow[]
): Promise<RestoredMedia | null> {
  const row = mediaRows
    .filter((media) => media.kind === "thumbnail" && media.linked_artifact_id === linkedArtifactId)
    .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))[0];

  if (!row) {
    return null;
  }

  return restoreMediaRow(client, row);
}

async function restoreMediaById(
  client: SupabaseClient<Database>,
  mediaAssetId: string,
  mediaRows: MediaAssetRow[]
): Promise<RestoredMedia | null> {
  const row = mediaRows.find((media) => media.id === mediaAssetId);

  if (!row) {
    return null;
  }

  return restoreMediaRow(client, row);
}

async function restoreMediaRow(client: SupabaseClient<Database>, row: MediaAssetRow): Promise<RestoredMedia | null> {
  try {
    return {
      id: row.id,
      mimeType: row.mime_type,
      signedUrl: await createStoryCamSignedUrl(
        client,
        row.storage_bucket as StoryCamPrivateBucket,
        row.storage_path,
        storyCamSignedUrlTtlSeconds
      ),
      signedUrlExpiresIn: storyCamSignedUrlTtlSeconds
    };
  } catch {
    return null;
  }
}

function currentStepForRestoredSession(input: {
  clipJob?: RestoredGenerationJob;
  finalWork?: RestoredFinalWork;
  storyboard: RestoredStoryboard | null;
}): RestoredCurrentStep {
  if (input.finalWork) {
    return "export";
  }

  if (input.clipJob?.status === "succeeded") {
    return "clip-review";
  }

  if (input.clipJob) {
    return "clip-generation";
  }

  return input.storyboard ? "core-storyboard" : "story-world";
}

function dependsOnMatches(row: StoryCamArtifactRow, refs: ArtifactRef[]) {
  const dependsOn = isRecord(row.depends_on_json) ? row.depends_on_json : {};

  return refs.every((ref) => dependsOn[ref.id] === ref.version);
}

function toArtifactRef(row: StoryCamArtifactRow): ArtifactRef {
  return {
    id: row.id,
    parentArtifactId: row.parent_artifact_id,
    state: row.state,
    type: row.type,
    version: row.version
  };
}

function toCoreGroupTargetCount(value: number | null | undefined): 1 | 2 | 3 | undefined {
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

function timestamp(value: string) {
  return new Date(value).getTime();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
