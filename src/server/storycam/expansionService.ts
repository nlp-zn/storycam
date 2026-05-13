import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coreStoryboardGroupSchema, expandedStoryboardCardSchema, storyboardScriptSchema } from "@/features/storycam/domain/artifactSchemas";
import type { CoreStoryboardGroup, ExpandedStoryboardCard, StoryboardFrame, StoryboardScript } from "@/features/storycam/domain/artifacts";
import { defaultStoryCamVideoAspectRatio, parseStoryCamVideoAspectRatio } from "@/features/storycam/domain/videoSettings";
import type { ImageGenerationProvider } from "@/lib/providers/types";
import type { Database, Json, StoryCamArtifactRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { submitImageGenerationJob } from "./imageGenerationJobService";
import { StoryCamSessionRepository } from "./sessionRepository";
import {
  placeholderStoryboardImage,
  loadStoryWorldVisualContext,
  toExpandedStoryboardProviderInput,
  toStoryboardRepresentativeProviderInput,
  withCoreStoryboardReferenceImage,
  type ExpandedStoryboardImageInput,
  type GeneratedStoryboardImageState,
  type StoryboardRepresentativeImageInput,
  type StoryboardRepresentativeImageOutput
} from "./storyboardImageService";

export const defaultExpansionCardTargetCount = 8;
export const maxExpansionCardTargetCount = 8;

export type ExpansionRequestBody = {
  action?: unknown;
  coreStoryboardGroupId?: unknown;
  sessionId?: unknown;
  targetCount?: unknown;
};

export type ExpansionArtifactRef = {
  id: string;
  parentArtifactId: string | null;
  state: StoryCamArtifactRow["state"];
  type: StoryCamArtifactRow["type"];
  version: number;
};

export type ExpansionServiceOutput = {
  expansionCards: Array<{
    beatType: string;
    canvasPosition?: string;
    description: string;
    frameNumber?: number;
    guidance: string;
    image: GeneratedStoryboardImageState;
    imagePrompt?: string;
    sortOrder: number;
    title: string;
    visibleCharacterAssetIds?: string[];
    version: number;
  }>;
  expandedStoryboardImages: GeneratedStoryboardImageState[];
  expandedStoryboardCards: ExpansionArtifactRef[];
  sessionId: string;
};

export type RegenerateStoryboardFrameImageOutput = {
  frameNumber: number;
  image: GeneratedStoryboardImageState;
  sessionId: string;
};

export class ExpansionRequestError extends Error {
  constructor(readonly code: "core_group_not_found" | "frame_not_found" | "invalid_input" | "session_not_found") {
    super(`StoryCam expansion request error: ${code}`);
    this.name = "ExpansionRequestError";
  }
}

export async function createExpandedStoryboardCards(
  client: SupabaseClient<Database>,
  userId: string,
  coreStoryboardGroupId: string,
  body: ExpansionRequestBody,
  imageProvider?: ImageGenerationProvider<ExpandedStoryboardImageInput, StoryboardRepresentativeImageOutput>,
  options: {
    providerReferenceSignedUrlTtlSeconds?: number;
  } = {}
): Promise<{ ok: true; value: ExpansionServiceOutput }> {
  const input = parseExpansionRequest(coreStoryboardGroupId, body);
  const sessions = new StoryCamSessionRepository(client);
  const artifacts = new StoryCamArtifactRepository(client);
  const session = await sessions.findById(userId, input.sessionId);

  if (!session) {
    throw new ExpansionRequestError("session_not_found");
  }
  const videoAspectRatio = parseStoryCamVideoAspectRatio(session.video_aspect_ratio) ?? defaultStoryCamVideoAspectRatio;

  const coreGroupArtifact = await loadCoreGroupArtifact(artifacts, userId, session.id, input.coreStoryboardGroupId);
  const coreGroup = coreStoryboardGroupSchema.parse(coreGroupArtifact.data_json);
  const storyboardScriptArtifact = await loadStoryboardScriptArtifact(artifacts, userId, session.id, coreGroupArtifact.id);
  const storyboardScript = storyboardScriptSchema.parse(storyboardScriptArtifact.data_json);
  const visualContext = await loadStoryWorldVisualContext(client, userId, {
    coreGroup,
    providerReferenceSignedUrlTtlSeconds: options.providerReferenceSignedUrlTtlSeconds,
    sessionId: session.id
  });
  const expandedVisualContext = await withCoreStoryboardReferenceImage(client, userId, {
    coreStoryboardGroupArtifactId: coreGroupArtifact.id,
    providerReferenceSignedUrlTtlSeconds: options.providerReferenceSignedUrlTtlSeconds,
    sessionId: session.id,
    visualContext
  });
  const dependsOnJson: Json = {
    [coreGroupArtifact.id]: coreGroupArtifact.version,
    [storyboardScriptArtifact.id]: storyboardScriptArtifact.version
  };
  const existingCardArtifacts = await loadExpandedCardArtifacts(artifacts, userId, session.id, coreGroupArtifact.id);
  const expandedStoryboardCards =
    existingCardArtifacts.length >= input.targetCount
      ? existingCardArtifacts.slice(0, input.targetCount)
      : await Promise.all(
          storyboardScript.frames.slice(1, input.targetCount + 1).map((frame) =>
            createExpandedCardArtifact(client, userId, {
              artifacts,
              coreGroup,
              coreGroupArtifact,
              dependsOnJson,
              frame,
              sessionId: session.id
            })
          )
        );
  const cards = expandedStoryboardCards.map((artifact) => expandedStoryboardCardSchema.parse(artifact.data_json));
  const images = await Promise.all(
    cards.map(async (card, index) => {
      const linkedArtifact = requireArtifactRow(expandedStoryboardCards[index]);

      if (!expandedVisualContext.ok) {
        return placeholderStoryboardImage(expandedVisualContext.reason);
      }

      if (!imageProvider?.supportsReferenceImages) {
        return placeholderStoryboardImage("reference_images_unsupported");
      }

      const result = await submitImageGenerationJob(client, userId, {
        imageInput: toExpandedStoryboardProviderInput({
          card,
          coreGroup,
          sessionId: session.id,
          videoAspectRatio,
          visualContext: expandedVisualContext
        }),
        inputArtifactVersionsJson: {
          ...expandedVisualContext.inputArtifactVersionsJson,
          [coreGroupArtifact.id]: coreGroupArtifact.version,
          [storyboardScriptArtifact.id]: storyboardScriptArtifact.version,
          [linkedArtifact.id]: linkedArtifact.version
        },
        linkedArtifactId: linkedArtifact.id,
        provider: imageProvider,
        sessionId: session.id,
        type: "expanded_storyboard_image"
      });

      return result.image;
    })
  );

  return {
    ok: true,
    value: {
      expansionCards: cards.map((card, index) => ({
        beatType: card.beatType,
        canvasPosition: card.canvasPosition,
        description: card.description,
        frameNumber: card.frameNumber,
        guidance: card.guidance,
        image: images[index] ?? placeholderStoryboardImage(),
        imagePrompt: card.imagePrompt,
        sortOrder: card.sortOrder,
        title: card.title,
        visibleCharacterAssetIds: card.visibleCharacterAssetIds,
        version: card.version
      })),
      expandedStoryboardImages: images,
      expandedStoryboardCards: expandedStoryboardCards.map((artifact) => toArtifactRef(requireArtifactRow(artifact))),
      sessionId: session.id
    }
  };
}

export async function regenerateStoryboardFrameImage(
  client: SupabaseClient<Database>,
  userId: string,
  coreStoryboardGroupId: string,
  body: ExpansionRequestBody,
  frameNumber: number,
  imageProvider?: ImageGenerationProvider<ExpandedStoryboardImageInput | StoryboardRepresentativeImageInput, StoryboardRepresentativeImageOutput>,
  options: {
    providerReferenceSignedUrlTtlSeconds?: number;
  } = {}
): Promise<{ ok: true; value: RegenerateStoryboardFrameImageOutput }> {
  const input = parseExpansionRequest(coreStoryboardGroupId, body);
  const sessions = new StoryCamSessionRepository(client);
  const artifacts = new StoryCamArtifactRepository(client);
  const session = await sessions.findById(userId, input.sessionId);

  if (!session) {
    throw new ExpansionRequestError("session_not_found");
  }
  const videoAspectRatio = parseStoryCamVideoAspectRatio(session.video_aspect_ratio) ?? defaultStoryCamVideoAspectRatio;

  if (!Number.isInteger(frameNumber) || frameNumber < 1 || frameNumber > 9) {
    throw new ExpansionRequestError("invalid_input");
  }

  try {
    const coreGroupArtifact = await loadCoreGroupArtifact(artifacts, userId, session.id, input.coreStoryboardGroupId);
    const coreGroup = coreStoryboardGroupSchema.parse(coreGroupArtifact.data_json);
    const storyboardScriptArtifact = await loadStoryboardScriptArtifact(artifacts, userId, session.id, coreGroupArtifact.id);
    const storyboardScript = storyboardScriptSchema.parse(storyboardScriptArtifact.data_json);
    const frame = storyboardScript.frames[frameNumber - 1];
    const visualContext = await loadStoryWorldVisualContext(client, userId, {
      coreGroup,
      providerReferenceSignedUrlTtlSeconds: options.providerReferenceSignedUrlTtlSeconds,
      sessionId: session.id
    });

    if (!frame) {
      throw new ExpansionRequestError("frame_not_found");
    }

    if (!visualContext.ok) {
      return storyboardFramePlaceholderOutput(frameNumber, session.id, visualContext.reason);
    }

    if (!imageProvider?.supportsReferenceImages) {
      return storyboardFramePlaceholderOutput(frameNumber, session.id, "reference_images_unsupported");
    }

    if (frameNumber === 1) {
      const result = await submitImageGenerationJob(client, userId, {
        forceNew: true,
        idempotencyKeySuffix: randomUUID(),
        imageInput: toStoryboardRepresentativeProviderInput(coreGroup, session.id, videoAspectRatio, storyboardScript, visualContext),
        inputArtifactVersionsJson: {
          ...visualContext.inputArtifactVersionsJson,
          [coreGroupArtifact.id]: coreGroupArtifact.version,
          [storyboardScriptArtifact.id]: storyboardScriptArtifact.version
        },
        linkedArtifactId: coreGroupArtifact.id,
        provider: imageProvider,
        sessionId: session.id,
        type: "storyboard_image"
      });

      return {
        ok: true,
        value: {
          frameNumber,
          image: result.image,
          sessionId: session.id
        }
      };
    }

    const expandedVisualContext = await withCoreStoryboardReferenceImage(client, userId, {
      coreStoryboardGroupArtifactId: coreGroupArtifact.id,
      providerReferenceSignedUrlTtlSeconds: options.providerReferenceSignedUrlTtlSeconds,
      sessionId: session.id,
      visualContext
    });

    if (!expandedVisualContext.ok) {
      return storyboardFramePlaceholderOutput(frameNumber, session.id, expandedVisualContext.reason);
    }

    const cardArtifact = await findOrCreateExpandedCardArtifact(client, userId, {
      artifacts,
      coreGroup,
      coreGroupArtifact,
      dependsOnJson: {
        [coreGroupArtifact.id]: coreGroupArtifact.version,
        [storyboardScriptArtifact.id]: storyboardScriptArtifact.version
      },
      frame,
      sessionId: session.id
    });
    const card = expandedStoryboardCardSchema.parse(cardArtifact.data_json);
    const result = await submitImageGenerationJob(client, userId, {
      forceNew: true,
      idempotencyKeySuffix: randomUUID(),
      imageInput: toExpandedStoryboardProviderInput({
        card,
        coreGroup,
        sessionId: session.id,
        videoAspectRatio,
        visualContext: expandedVisualContext
      }),
      inputArtifactVersionsJson: {
        ...expandedVisualContext.inputArtifactVersionsJson,
        [coreGroupArtifact.id]: coreGroupArtifact.version,
        [storyboardScriptArtifact.id]: storyboardScriptArtifact.version,
        [cardArtifact.id]: cardArtifact.version
      },
      linkedArtifactId: cardArtifact.id,
      provider: imageProvider,
      sessionId: session.id,
      type: "expanded_storyboard_image"
    });

    return {
      ok: true,
      value: {
        frameNumber,
        image: result.image,
        sessionId: session.id
      }
    };
  } catch (error) {
    if (error instanceof ExpansionRequestError) {
      throw error;
    }

    return storyboardFramePlaceholderOutput(frameNumber, session.id, "storage_failed");
  }
}

function storyboardFramePlaceholderOutput(
  frameNumber: number,
  sessionId: string,
  reason: "provider_failed" | "reference_images_unsupported" | "storage_failed" | "waiting_for_asset_images"
): { ok: true; value: RegenerateStoryboardFrameImageOutput } {
  return {
    ok: true,
    value: {
      frameNumber,
      image: placeholderStoryboardImage(reason),
      sessionId
    }
  };
}

export function parseExpansionRequest(coreStoryboardGroupId: string, body: ExpansionRequestBody) {
  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : "";

  if (!sessionId || !coreStoryboardGroupId) {
    throw new ExpansionRequestError("invalid_input");
  }

  if (body.coreStoryboardGroupId !== undefined && body.coreStoryboardGroupId !== coreStoryboardGroupId) {
    throw new ExpansionRequestError("invalid_input");
  }

  return {
    action: parseExpansionAction(body.action),
    coreStoryboardGroupId,
    sessionId,
    targetCount: parseTargetCount(body.targetCount)
  };
}

async function loadStoryboardScriptArtifact(
  artifacts: StoryCamArtifactRepository,
  userId: string,
  sessionId: string,
  coreStoryboardGroupArtifactId: string
) {
  const rows = (await artifacts.listBySession(userId, { sessionId, type: "storyboard_script" })) ?? [];
  const script = rows.find(
    (row) =>
      row.type === "storyboard_script" &&
      row.parent_artifact_id === coreStoryboardGroupArtifactId &&
      row.state === "ready" &&
      storyboardScriptSchema.safeParse(row.data_json).success
  );

  if (!script) {
    throw new ExpansionRequestError("frame_not_found");
  }

  return script;
}

async function loadExpandedCardArtifacts(
  artifacts: StoryCamArtifactRepository,
  userId: string,
  sessionId: string,
  coreStoryboardGroupArtifactId: string
) {
  const rows = (await artifacts.listBySession(userId, { sessionId, type: "expanded_storyboard_card" })) ?? [];

  return rows
    .filter((row) => row.type === "expanded_storyboard_card" && row.parent_artifact_id === coreStoryboardGroupArtifactId && row.state === "ready")
    .sort((a, b) => {
      const aCard = expandedStoryboardCardSchema.safeParse(a.data_json);
      const bCard = expandedStoryboardCardSchema.safeParse(b.data_json);

      return (aCard.success ? aCard.data.sortOrder : 0) - (bCard.success ? bCard.data.sortOrder : 0);
    });
}

async function findOrCreateExpandedCardArtifact(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    artifacts: StoryCamArtifactRepository;
    coreGroup: CoreStoryboardGroup;
    coreGroupArtifact: StoryCamArtifactRow;
    dependsOnJson: Json;
    frame: StoryboardFrame;
    sessionId: string;
  }
) {
  const existing = (await loadExpandedCardArtifacts(input.artifacts, userId, input.sessionId, input.coreGroupArtifact.id)).find((row) => {
    const card = expandedStoryboardCardSchema.safeParse(row.data_json);

    return card.success && card.data.frameNumber === input.frame.frameNumber;
  });

  return existing ?? createExpandedCardArtifact(client, userId, input);
}

async function createExpandedCardArtifact(
  _client: SupabaseClient<Database>,
  userId: string,
  input: {
    artifacts: StoryCamArtifactRepository;
    coreGroup: CoreStoryboardGroup;
    coreGroupArtifact: StoryCamArtifactRow;
    dependsOnJson: Json;
    frame: StoryboardFrame;
    sessionId: string;
  }
) {
  const card = expandedStoryboardCardSchema.parse(frameToExpandedCard(input.coreGroup, input.frame, input.sessionId));

  return requireArtifactRow(
    await input.artifacts.createVersion(userId, {
      dataJson: card,
      dependsOnJson: input.dependsOnJson,
      parentArtifactId: input.coreGroupArtifact.id,
      sessionId: input.sessionId,
      state: "ready",
      type: "expanded_storyboard_card",
      version: card.version
    })
  );
}

function frameToExpandedCard(coreGroup: CoreStoryboardGroup, frame: StoryboardFrame, sessionId: string): ExpandedStoryboardCard {
  const sortOrder = frame.frameNumber - 2;

  return expandedStoryboardCardSchema.parse({
    beatType: frame.beatType === "core" ? "action" : frame.beatType,
    canvasPosition: frame.canvasPosition,
    coreGroupId: coreGroup.id,
    description: frame.visualContent,
    frameNumber: frame.frameNumber,
    guidance: `${frame.narrativePurpose} ${frame.technicalNotes} 节奏：${frame.timeRange}。声音意图：${frame.sound}`,
    id: `${coreGroup.id}-frame-${frame.frameNumber}`,
    imagePrompt: frame.imagePrompt,
    sessionId,
    sortOrder,
    state: "ready",
    title: frame.title,
    visibleCharacterAssetIds: frame.visibleCharacterAssetIds,
    version: 1
  });
}

async function loadCoreGroupArtifact(
  artifacts: StoryCamArtifactRepository,
  userId: string,
  sessionId: string,
  coreStoryboardGroupId: string
) {
  const rows = (await artifacts.listBySession(userId, { sessionId, type: "core_storyboard_group" })) ?? [];
  const coreGroup = rows.find((row) => row.id === coreStoryboardGroupId && row.state === "ready");

  if (!coreGroup) {
    throw new ExpansionRequestError("core_group_not_found");
  }

  return coreGroup;
}

function parseExpansionAction(value: unknown) {
  if (value === undefined) {
    return "default";
  }

  if (value === "default" || value === "more" || value === "new_angle" || value === "stronger_emotion") {
    return value;
  }

  throw new ExpansionRequestError("invalid_input");
}

function parseTargetCount(value: unknown) {
  if (value === undefined) {
    return defaultExpansionCardTargetCount;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ExpansionRequestError("invalid_input");
  }

  return Math.min(value, maxExpansionCardTargetCount);
}

function requireArtifactRow(row: StoryCamArtifactRow | null) {
  if (!row) {
    throw new Error("StoryCam expansion artifact write failed.");
  }

  return row;
}

function toArtifactRef(row: StoryCamArtifactRow): ExpansionArtifactRef {
  return {
    id: row.id,
    parentArtifactId: row.parent_artifact_id,
    state: row.state,
    type: row.type,
    version: row.version
  };
}
