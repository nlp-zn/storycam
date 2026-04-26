import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderFailure, TextGenerationProvider } from "@/lib/providers/types";
import type {
  MockStoryWorldInput,
  MockStoryWorldOutput,
  UploadedPhotoReference
} from "@/lib/providers/mock/storyWorldProvider";
import { createMockStoryWorldProvider } from "@/lib/providers/mock/storyWorldProvider";
import type { Database, MediaAssetRow, StoryCamArtifactRow } from "@/server/db/types";
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
  uploadedPhotoIds?: unknown;
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
  storyWorld: MockStoryWorldOutput;
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
  provider: TextGenerationProvider<MockStoryWorldInput, MockStoryWorldOutput> = createMockStoryWorldProvider()
): Promise<ProviderFailure | { ok: true; value: StoryWorldServiceOutput }> {
  const input = parseStoryWorldRequest(body);
  const sessions = new StoryCamSessionRepository(client);
  const artifacts = new StoryCamArtifactRepository(client);
  const mediaAssets = new StoryCamMediaAssetRepository(client);
  const session = input.sessionId
    ? await sessions.findById(userId, input.sessionId)
    : await sessions.create(userId, {
        generationMode: "mock",
        plannedDurationSeconds: input.plannedDurationSeconds
      });

  if (!session) {
    throw new StoryWorldRequestError("session_not_found");
  }

  const uploadedPhotoRefs = await resolveUploadedPhotoRefs(mediaAssets, userId, session.id, input.uploadedPhotoIds);
  const providerResult = await provider.generate({
    idea: input.input,
    sessionId: session.id,
    uploadedPhotoRefs
  });

  if (!providerResult.ok) {
    return providerResult;
  }

  const script = requireArtifactRow(
    await artifacts.createVersion(userId, {
      dataJson: providerResult.value.script,
      sessionId: session.id,
      state: "ready",
      type: "script",
      version: providerResult.value.script.version
    })
  );
  const characterAssets = await Promise.all(
    providerResult.value.characterAssets.map((asset) =>
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
    providerResult.value.sceneAssets.map((asset) =>
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
      storyWorld: providerResult.value
    }
  };
}

export function parseStoryWorldRequest(body: StoryWorldRequestBody) {
  const input = typeof body.input === "string" ? body.input.trim() : "";
  const generationMode = body.generationMode ?? "mock";

  if (generationMode !== "mock") {
    throw new StoryWorldRequestError("invalid_generation_mode");
  }

  if (!input || input.length > storyWorldInputMaxLength) {
    throw new StoryWorldRequestError("invalid_input");
  }

  return {
    generationMode,
    input,
    lightweightChoices: parseStringArray(body.lightweightChoices),
    plannedDurationSeconds: parsePlannedDuration(body.plannedDurationSeconds),
    sessionId: typeof body.sessionId === "string" && body.sessionId ? body.sessionId : undefined,
    uploadedPhotoIds: parseStringArray(body.uploadedPhotoIds)
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
