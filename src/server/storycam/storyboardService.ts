import type { SupabaseClient } from "@supabase/supabase-js";
import { characterAssetSchema, sceneAssetSchema, storyScriptSchema } from "@/features/storycam/domain/artifactSchemas";
import type { CharacterAsset, SceneAsset, StoryScript } from "@/features/storycam/domain/artifacts";
import { createDurationPlan } from "@/features/storycam/domain/durationRules";
import { createMockStoryboardProvider, type MockStoryboardInput, type MockStoryboardOutput } from "@/lib/providers/mock/storyboardProvider";
import type { ProviderFailure, TextGenerationProvider } from "@/lib/providers/types";
import type { Database, Json, StoryCamArtifactRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { StoryCamSessionRepository } from "./sessionRepository";

export type StoryboardRequestBody = {
  confirmedArtifactVersions?: unknown;
  expansionCardTargetCount?: unknown;
  plannedDurationSeconds?: unknown;
  sessionId?: unknown;
};

export type StoryboardArtifactRef = {
  id: string;
  state: StoryCamArtifactRow["state"];
  type: StoryCamArtifactRow["type"];
  version: number;
};

export type StoryboardServiceOutput = {
  artifacts: {
    coreStoryboardGroups: StoryboardArtifactRef[];
    storyboardScript: StoryboardArtifactRef;
  };
  coreStoryboardGroups: StoryboardArtifactRef[];
  durationPlan: {
    clipDurationTargets: number[];
    coreGroupTargetCount: 1 | 2 | 3;
    plannedDurationSeconds: number;
  };
  sessionId: string;
  storyboard: MockStoryboardOutput;
  storyboardScript: StoryboardArtifactRef;
};

export class StoryboardRequestError extends Error {
  constructor(readonly code: "invalid_input" | "session_not_found" | "story_world_not_confirmed") {
    super(`StoryCam storyboard request error: ${code}`);
    this.name = "StoryboardRequestError";
  }
}

export async function createStoryboard(
  client: SupabaseClient<Database>,
  userId: string,
  body: StoryboardRequestBody,
  provider: TextGenerationProvider<MockStoryboardInput, MockStoryboardOutput> = createMockStoryboardProvider()
): Promise<ProviderFailure | { ok: true; value: StoryboardServiceOutput }> {
  const input = parseStoryboardRequest(body);
  const sessions = new StoryCamSessionRepository(client);
  const artifacts = new StoryCamArtifactRepository(client);
  const session = await sessions.findById(userId, input.sessionId);

  if (!session) {
    throw new StoryboardRequestError("session_not_found");
  }

  const plannedDurationSeconds = input.plannedDurationSeconds ?? session.planned_duration_seconds;
  const durationPlan = createDurationPlan({ plannedDurationSeconds });
  const storyWorld = await loadConfirmedStoryWorld(artifacts, userId, session.id, input.confirmedArtifactVersions);
  const providerResult = await provider.generate({
    expansionCardTargetCount: input.expansionCardTargetCount,
    plannedDurationSeconds,
    sessionId: session.id,
    storyWorld
  });

  if (!providerResult.ok) {
    return providerResult;
  }

  await sessions.update(userId, session.id, {
    coreGroupTargetCount: durationPlan.coreGroupTargetCount,
    plannedDurationSeconds,
    status: "ready"
  });

  const dependsOnJson: Json = input.confirmedArtifactVersions;
  const storyboardScript = requireArtifactRow(
    await artifacts.createVersion(userId, {
      dataJson: providerResult.value.storyboardScript,
      dependsOnJson,
      sessionId: session.id,
      state: "ready",
      type: "storyboard_script",
      version: providerResult.value.storyboardScript.version
    })
  );
  const coreStoryboardGroups = await Promise.all(
    providerResult.value.coreStoryboardGroups.map((group) =>
      artifacts.createVersion(userId, {
        dataJson: {
          ...group,
          expandedCardIds: []
        },
        dependsOnJson,
        sessionId: session.id,
        state: "ready",
        type: "core_storyboard_group",
        version: group.version
      })
    )
  );
  const storyboardScriptRef = toArtifactRef(storyboardScript);
  const coreStoryboardGroupRefs = coreStoryboardGroups.map((artifact) => toArtifactRef(requireArtifactRow(artifact)));

  return {
    ok: true,
    value: {
      artifacts: {
        coreStoryboardGroups: coreStoryboardGroupRefs,
        storyboardScript: storyboardScriptRef
      },
      coreStoryboardGroups: coreStoryboardGroupRefs,
      durationPlan,
      sessionId: session.id,
      storyboard: providerResult.value,
      storyboardScript: storyboardScriptRef
    }
  };
}

export function parseStoryboardRequest(body: StoryboardRequestBody) {
  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : "";

  if (!sessionId) {
    throw new StoryboardRequestError("invalid_input");
  }

  return {
    confirmedArtifactVersions: parseConfirmedArtifactVersions(body.confirmedArtifactVersions),
    expansionCardTargetCount: parseOptionalInteger(body.expansionCardTargetCount),
    plannedDurationSeconds: parseOptionalDuration(body.plannedDurationSeconds),
    sessionId
  };
}

async function loadConfirmedStoryWorld(
  artifacts: StoryCamArtifactRepository,
  userId: string,
  sessionId: string,
  confirmedArtifactVersions: Record<string, number>
) {
  const rows = (await artifacts.listBySession(userId, { sessionId })) ?? [];
  const confirmedRows = rows.filter((row) => confirmedArtifactVersions[row.id] === row.version && row.state === "ready");
  const script = confirmedRows.find((row) => row.type === "script");
  const characterRows = confirmedRows.filter((row) => row.type === "character_asset");
  const sceneRows = confirmedRows.filter((row) => row.type === "scene_asset");

  if (!script || characterRows.length === 0 || sceneRows.length === 0) {
    throw new StoryboardRequestError("story_world_not_confirmed");
  }

  return {
    characterAssets: characterRows.map((row) => parseCharacterAsset(row)),
    sceneAssets: sceneRows.map((row) => parseSceneAsset(row)),
    script: parseStoryScript(script)
  };
}

function parseConfirmedArtifactVersions(value: unknown) {
  if (!isRecord(value)) {
    throw new StoryboardRequestError("story_world_not_confirmed");
  }

  const entries = Object.entries(value);

  if (
    entries.length === 0 ||
    entries.some(
      ([artifactId, version]) => !artifactId || typeof version !== "number" || !Number.isInteger(version) || version <= 0
    )
  ) {
    throw new StoryboardRequestError("story_world_not_confirmed");
  }

  return Object.fromEntries(entries) as Record<string, number>;
}

function parseOptionalDuration(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StoryboardRequestError("invalid_input");
  }

  return value;
}

function parseOptionalInteger(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value)) {
    throw new StoryboardRequestError("invalid_input");
  }

  return value as number;
}

function parseStoryScript(row: StoryCamArtifactRow): StoryScript {
  return storyScriptSchema.parse(row.data_json);
}

function parseCharacterAsset(row: StoryCamArtifactRow): CharacterAsset {
  return characterAssetSchema.parse(row.data_json);
}

function parseSceneAsset(row: StoryCamArtifactRow): SceneAsset {
  return sceneAssetSchema.parse(row.data_json);
}

function requireArtifactRow(row: StoryCamArtifactRow | null) {
  if (!row) {
    throw new Error("StoryCam storyboard artifact write failed.");
  }

  return row;
}

function toArtifactRef(row: StoryCamArtifactRow): StoryboardArtifactRef {
  return {
    id: row.id,
    state: row.state,
    type: row.type,
    version: row.version
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
