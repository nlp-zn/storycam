import type { SupabaseClient } from "@supabase/supabase-js";
import {
  characterAssetSchema,
  coreStoryboardGroupSchema,
  expandedStoryboardCardSchema,
  sceneAssetSchema,
  storyboardScriptSchema,
  storyScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import { createDurationPlan } from "@/features/storycam/domain/durationRules";
import type { Database, MediaAssetRow, StoryCamArtifactRow, StoryCamSessionRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { createStoryCamSignedUrl, storyCamSignedUrlTtlSeconds, type StoryCamPrivateBucket } from "./mediaStore";
import { StoryCamSessionRepository } from "./sessionRepository";
import { placeholderStoryboardImage, type GeneratedStoryboardImageState } from "./storyboardImageService";

type ArtifactRef = {
  id: string;
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

export type RestoreStoryCamSessionOutput =
  | {
      ok: true;
      restored: false;
    }
  | {
      coreGroupTargetCount: 1 | 2 | 3;
      currentStep: "core-storyboard" | "story-world";
      ok: true;
      restored: true;
      sessionId: string;
      storyboard: RestoredStoryboard | null;
      storyWorld: RestoredStoryWorld;
      storyWorldConfirmed: boolean;
    };

export type RecentStoryCamProject = {
  coreGroupTargetCount: 1 | 2 | 3;
  currentStep: "core-storyboard" | "story-world";
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
    characterAssets: unknown[];
    sceneAssets: unknown[];
    script: unknown;
  };
};

type RestoredStoryboard = {
  artifacts: {
    coreStoryboardGroups: ArtifactRef[];
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

type StoryWorldBundle = {
  characterRows: StoryCamArtifactRow[];
  sceneRows: StoryCamArtifactRow[];
  scriptRow: StoryCamArtifactRow;
};

export async function restoreCurrentStoryCamSession(
  client: SupabaseClient<Database>,
  userId: string
): Promise<RestoreStoryCamSessionOutput> {
  const sessions = (await new StoryCamSessionRepository(client).listRecentRestorableCandidates(userId, 10)) ?? [];

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
  const sessions = (await new StoryCamSessionRepository(client).listRecentRestorableCandidates(userId, Math.max(projectLimit * 2, 10))) ?? [];
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
  const storyboard = await restoreStoryboard(client, session, storyWorldBundle, artifactRows, mediaRows);
  const coreGroupTargetCount = toCoreGroupTargetCount(session.core_group_target_count) ?? storyboard?.durationPlan.coreGroupTargetCount ?? 1;

  return {
    coreGroupTargetCount,
    currentStep: storyboard ? "core-storyboard" : "story-world",
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
  const storyboard = await restoreStoryboard(client, session, storyWorldBundle, artifactRows, mediaRows);
  const script = storyScriptSchema.parse(storyWorldBundle.scriptRow.data_json);
  const coreGroupTargetCount = toCoreGroupTargetCount(session.core_group_target_count) ?? storyboard?.durationPlan.coreGroupTargetCount ?? 1;

  return {
    coreGroupTargetCount,
    currentStep: storyboard ? "core-storyboard" : "story-world",
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
    storyWorld: {
      characterAssets: bundle.characterRows.map((row) => characterAssetSchema.parse(row.data_json)),
      sceneAssets: bundle.sceneRows.map((row) => sceneAssetSchema.parse(row.data_json)),
      script: storyScriptSchema.parse(bundle.scriptRow.data_json)
    }
  };
}

async function restoreStoryboard(
  client: SupabaseClient<Database>,
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
  const coreGroupViews = await Promise.all(
    matchingCoreRows.map(async (row, index) => ({
      ...coreStoryboardGroupSchema.parse(row.data_json),
      expandedStoryboardImages: await restoreExpandedStoryboardImages(client, row, rows, mediaRows),
      representativeImage: await restoreStoryboardImage(client, row.id, mediaRows),
      scriptArtifact: storyboardScriptRefs[index] ?? storyboardScriptRef
    }))
  );

  return {
    artifacts: {
      coreStoryboardGroups: matchingCoreRows.map(toArtifactRef),
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
  mediaRows: MediaAssetRow[]
): Promise<GeneratedStoryboardImageState> {
  const media = await restoreMedia(client, linkedArtifactId, mediaRows);

  if (!media) {
    return placeholderStoryboardImage();
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
  mediaRows: MediaAssetRow[]
) {
  const cards = rows
    .filter((row) => row.type === "expanded_storyboard_card" && row.state === "ready" && row.parent_artifact_id === coreRow.id)
    .sort((a, b) => {
      const aCard = expandedStoryboardCardSchema.safeParse(a.data_json);
      const bCard = expandedStoryboardCardSchema.safeParse(b.data_json);
      return (aCard.success ? aCard.data.sortOrder : 0) - (bCard.success ? bCard.data.sortOrder : 0);
    })
    .slice(0, 8);

  return Promise.all(cards.map((card) => restoreStoryboardImage(client, card.id, mediaRows)));
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

function dependsOnMatches(row: StoryCamArtifactRow, refs: ArtifactRef[]) {
  const dependsOn = isRecord(row.depends_on_json) ? row.depends_on_json : {};

  return refs.every((ref) => dependsOn[ref.id] === ref.version);
}

function toArtifactRef(row: StoryCamArtifactRow): ArtifactRef {
  return {
    id: row.id,
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
