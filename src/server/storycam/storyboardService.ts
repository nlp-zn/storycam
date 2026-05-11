import type { SupabaseClient } from "@supabase/supabase-js";
import { characterAssetSchema, sceneAssetSchema, storyScriptSchema } from "@/features/storycam/domain/artifactSchemas";
import type { CharacterAsset, CoreStoryboardGroup, SceneAsset, StoryboardScript, StoryScript } from "@/features/storycam/domain/artifacts";
import { createDurationPlan } from "@/features/storycam/domain/durationRules";
import { createMockStoryboardProvider, type MockStoryboardInput, type MockStoryboardOutput } from "@/lib/providers/mock/storyboardProvider";
import type { ImageGenerationProvider, ProviderFailure, TextGenerationProvider } from "@/lib/providers/types";
import type { Database, Json, StoryCamArtifactRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { submitImageGenerationJob } from "./imageGenerationJobService";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { StoryCamSessionRepository } from "./sessionRepository";
import {
  placeholderStoryboardImage,
  loadStoryWorldVisualContext,
  toStoryboardRepresentativeProviderInput,
  type GeneratedStoryboardImageState,
  type StoryboardRepresentativeImageInput,
  type StoryboardRepresentativeImageOutput
} from "./storyboardImageService";

export type StoryboardRequestBody = {
  confirmedArtifactVersions?: unknown;
  coreGroupTargetCount?: unknown;
  deferRepresentativeImages?: unknown;
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
    storyboardScripts: StoryboardArtifactRef[];
  };
  coreStoryboardGroups: StoryboardArtifactRef[];
  durationPlan: {
    clipDurationTargets: number[];
    coreGroupTargetCount: 1 | 2 | 3;
    plannedDurationSeconds: number;
  };
  sessionId: string;
  storyboard: Omit<MockStoryboardOutput, "coreStoryboardGroups"> & {
    coreStoryboardGroups: StoryboardCoreGroupView[];
  };
  storyboardScript: StoryboardArtifactRef;
};

export type StoryboardCoreGroupView = CoreStoryboardGroup & {
  expandedStoryboardImages: GeneratedStoryboardImageState[];
  representativeImage: GeneratedStoryboardImageState;
  scriptArtifact: StoryboardArtifactRef;
};

export class StoryboardRequestError extends Error {
  constructor(readonly code: "invalid_input" | "session_not_found" | "story_world_asset_images_not_ready" | "story_world_not_confirmed") {
    super(`StoryCam storyboard request error: ${code}`);
    this.name = "StoryboardRequestError";
  }
}

export async function createStoryboard(
  client: SupabaseClient<Database>,
  userId: string,
  body: StoryboardRequestBody,
  provider: TextGenerationProvider<MockStoryboardInput, MockStoryboardOutput> = createMockStoryboardProvider(),
  imageProvider?: ImageGenerationProvider<StoryboardRepresentativeImageInput, StoryboardRepresentativeImageOutput>,
  options: {
    providerReferenceSignedUrlTtlSeconds?: number;
  } = {}
): Promise<ProviderFailure | { ok: true; value: StoryboardServiceOutput }> {
  const input = parseStoryboardRequest(body);
  const sessions = new StoryCamSessionRepository(client);
  const artifacts = new StoryCamArtifactRepository(client);
  const session = await sessions.findById(userId, input.sessionId);

  if (!session) {
    throw new StoryboardRequestError("session_not_found");
  }

  const sessionCoreGroupTargetCount = toCoreGroupTargetCount(session.core_group_target_count);
  const coreGroupTargetCount = input.coreGroupTargetCount ?? sessionCoreGroupTargetCount;
  const plannedDurationSeconds = input.plannedDurationSeconds ?? session.planned_duration_seconds;
  const durationPlan = createDurationPlan({ coreGroupTargetCount, plannedDurationSeconds });
  const storyWorld = await loadConfirmedStoryWorld(artifacts, userId, session.id, input.confirmedArtifactVersions);
  const storyWorldArtifactVersions = artifactVersions(storyWorld.artifactRows);

  if (imageProvider?.supportsReferenceImages && !input.deferRepresentativeImages) {
    await assertStoryWorldAssetImagesReady(client, userId, session.id, storyWorld.assetRows);
  }

  const providerResult = await provider.generate({
    coreGroupTargetCount: durationPlan.coreGroupTargetCount,
    expansionCardTargetCount: input.expansionCardTargetCount,
    plannedDurationSeconds: durationPlan.plannedDurationSeconds,
    sessionId: session.id,
    storyWorld
  });

  if (!providerResult.ok) {
    return providerResult;
  }

  await sessions.update(userId, session.id, {
    coreGroupTargetCount: durationPlan.coreGroupTargetCount,
    plannedDurationSeconds: durationPlan.plannedDurationSeconds,
    status: "ready"
  });

  const dependsOnJson: Json = storyWorldArtifactVersions;
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
  const coreStoryboardGroupRows = coreStoryboardGroups.map((artifact) => requireArtifactRow(artifact));
  const coreStoryboardGroupRefs = coreStoryboardGroupRows.map(toArtifactRef);
  const storyboardScripts = normalizeStoryboardScripts(providerResult.value, session.id, durationPlan.coreGroupTargetCount);
  const storyboardScriptRows = await Promise.all(
    storyboardScripts.map((script, index) =>
      artifacts.createVersion(userId, {
        dataJson: script,
        dependsOnJson: {
          ...storyWorldArtifactVersions,
          [coreStoryboardGroupRows[index]?.id ?? ""]: coreStoryboardGroupRows[index]?.version ?? 1
        },
        parentArtifactId: coreStoryboardGroupRows[index]?.id,
        sessionId: session.id,
        state: "ready",
        type: "storyboard_script",
        version: script.version
      })
    )
  );
  const storyboardScriptRefs = storyboardScriptRows.map((artifact) => toArtifactRef(requireArtifactRow(artifact)));
  const storyboardScriptRef = storyboardScriptRefs[0];
  const representativeImages = input.deferRepresentativeImages
    ? providerResult.value.coreStoryboardGroups.map(() => placeholderStoryboardImage())
    : await generateRepresentativeImages({
        client,
        coreGroupArtifacts: coreStoryboardGroupRows,
        coreGroups: providerResult.value.coreStoryboardGroups,
        imageProvider,
        providerReferenceSignedUrlTtlSeconds: options.providerReferenceSignedUrlTtlSeconds,
        storyboardScriptArtifacts: storyboardScriptRows.map((artifact) => requireArtifactRow(artifact)),
        scripts: storyboardScripts,
        sessionId: session.id,
        userId
      });
  const storyboardCoreGroups = providerResult.value.coreStoryboardGroups.map((group, index) => ({
    ...group,
    expandedStoryboardImages: [],
    representativeImage: representativeImages[index] ?? placeholderStoryboardImage(),
    scriptArtifact: storyboardScriptRefs[index] ?? storyboardScriptRef
  }));

  return {
    ok: true,
    value: {
      artifacts: {
        coreStoryboardGroups: coreStoryboardGroupRefs,
        storyboardScript: storyboardScriptRef,
        storyboardScripts: storyboardScriptRefs
      },
      coreStoryboardGroups: coreStoryboardGroupRefs,
      durationPlan,
      sessionId: session.id,
      storyboard: {
        ...providerResult.value,
        coreStoryboardGroups: storyboardCoreGroups,
        storyboardScripts
      },
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
    coreGroupTargetCount: parseOptionalCoreGroupTargetCount(body.coreGroupTargetCount),
    deferRepresentativeImages: body.deferRepresentativeImages === true,
    expansionCardTargetCount: parseOptionalInteger(body.expansionCardTargetCount),
    plannedDurationSeconds: parseOptionalDuration(body.plannedDurationSeconds),
    sessionId
  };
}

function normalizeStoryboardScripts(
  output: MockStoryboardOutput,
  sessionId: string,
  targetCount: 1 | 2 | 3
): StoryboardScript[] {
  const fallbackScripts = Array.from({ length: targetCount }, (_, index) =>
    ({
      ...output.storyboardScript,
      id: `${output.storyboardScript.id}-${index + 1}`,
      mainImagePrompt: output.storyboardScript.mainImagePrompt,
      plannedDurationSeconds: 15,
      sessionId
    }) satisfies StoryboardScript
  );

  return Array.from({ length: targetCount }, (_, index) => output.storyboardScripts[index] ?? fallbackScripts[index]);
}

async function generateRepresentativeImages(input: {
  client: SupabaseClient<Database>;
  coreGroupArtifacts: StoryCamArtifactRow[];
  coreGroups: CoreStoryboardGroup[];
  imageProvider?: ImageGenerationProvider<StoryboardRepresentativeImageInput, StoryboardRepresentativeImageOutput>;
  providerReferenceSignedUrlTtlSeconds?: number;
  scripts: StoryboardScript[];
  storyboardScriptArtifacts: StoryCamArtifactRow[];
  sessionId: string;
  userId: string;
}) {
  if (!input.imageProvider) {
    return input.coreGroups.map(() => placeholderStoryboardImage());
  }

  const results = await Promise.all(
    input.coreGroups.map(async (coreGroup, index) => {
      const linkedArtifact = input.coreGroupArtifacts[index];
      const storyboardScriptArtifact = input.storyboardScriptArtifacts[index];

      if (!linkedArtifact || !storyboardScriptArtifact) {
        return placeholderStoryboardImage("waiting_for_asset_images");
      }

      const visualContext = await loadStoryWorldVisualContext(input.client, input.userId, {
        coreGroup,
        providerReferenceSignedUrlTtlSeconds: input.providerReferenceSignedUrlTtlSeconds,
        sessionId: input.sessionId
      });

      if (!visualContext.ok) {
        return placeholderStoryboardImage(visualContext.reason);
      }

      if (!input.imageProvider?.supportsReferenceImages) {
        return placeholderStoryboardImage("reference_images_unsupported");
      }

      const result = await submitImageGenerationJob(input.client, input.userId, {
        imageInput: toStoryboardRepresentativeProviderInput(coreGroup, input.sessionId, input.scripts[index], visualContext),
        inputArtifactVersionsJson: {
          ...visualContext.inputArtifactVersionsJson,
          [linkedArtifact.id]: linkedArtifact.version,
          [storyboardScriptArtifact.id]: storyboardScriptArtifact.version
        },
        linkedArtifactId: linkedArtifact.id,
        provider: input.imageProvider,
        sessionId: input.sessionId,
        type: "storyboard_image"
      });

      return result.image;
    })
  );

  return results;
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
    artifactRows: [script, ...characterRows, ...sceneRows],
    assetRows: [...characterRows, ...sceneRows],
    characterAssets: characterRows.map((row) => parseCharacterAsset(row)),
    sceneAssets: sceneRows.map((row) => parseSceneAsset(row)),
    script: parseStoryScript(script)
  };
}

async function assertStoryWorldAssetImagesReady(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  assetRows: StoryCamArtifactRow[]
) {
  const mediaAssets = new StoryCamMediaAssetRepository(client);
  const imageRows = await Promise.all(
    assetRows.map((row) =>
      mediaAssets.findLatestThumbnailByLinkedArtifact(userId, {
        linkedArtifactId: row.id,
        sessionId
      })
    )
  );

  if (imageRows.some((row) => !row)) {
    throw new StoryboardRequestError("story_world_asset_images_not_ready");
  }
}

function artifactVersions(rows: StoryCamArtifactRow[]) {
  return Object.fromEntries(rows.map((row) => [row.id, row.version])) as Record<string, number>;
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

function parseOptionalCoreGroupTargetCount(value: unknown): 1 | 2 | 3 | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== 1 && value !== 2 && value !== 3) {
    throw new StoryboardRequestError("invalid_input");
  }

  return value;
}

function toCoreGroupTargetCount(value: number | null | undefined): 1 | 2 | 3 | undefined {
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

function parseStoryScript(row: StoryCamArtifactRow): StoryScript {
  return storyScriptSchema.parse(row.data_json);
}

function parseCharacterAsset(row: StoryCamArtifactRow): CharacterAsset {
  return characterAssetSchema.parse({
    ...characterAssetSchema.parse(row.data_json),
    id: row.id
  });
}

function parseSceneAsset(row: StoryCamArtifactRow): SceneAsset {
  return sceneAssetSchema.parse({
    ...sceneAssetSchema.parse(row.data_json),
    id: row.id
  });
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
