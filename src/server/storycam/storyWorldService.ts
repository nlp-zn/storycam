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
import type { Database, MediaAssetRow, StoryCamArtifactRow, StoryCamSessionRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
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
