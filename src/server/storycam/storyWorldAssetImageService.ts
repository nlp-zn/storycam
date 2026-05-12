import type { SupabaseClient } from "@supabase/supabase-js";
import { characterAssetSchema, sceneAssetSchema, storyScriptSchema } from "@/features/storycam/domain/artifactSchemas";
import type { CharacterAsset, SceneAsset, StoryScript } from "@/features/storycam/domain/artifacts";
import type { ImageGenerationProvider, ProviderFailure } from "@/lib/providers/types";
import type { Database, StoryCamArtifactRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { writeGeneratedStoryCamMedia } from "./generatedMediaService";
import {
  submitImageGenerationJob,
  type AsyncImageProviderOutput,
  type ImageJobState
} from "./imageGenerationJobService";
import { createStoryCamSignedUrl, storyCamGeneratedBucket, storyCamSignedUrlTtlSeconds } from "./mediaStore";
import { StoryCamSessionRepository } from "./sessionRepository";

export type StoryWorldAssetKind = "character" | "scene";

export type StoryWorldAssetImageInput =
  | {
      asset: CharacterAsset;
      assetArtifactId: string;
      assetKind: "character";
      characterAssets?: CharacterAsset[];
      script?: StoryScript;
      sessionId: string;
    }
  | {
      asset: SceneAsset;
      assetArtifactId: string;
      assetKind: "scene";
      characterAssets?: CharacterAsset[];
      script?: StoryScript;
      sessionId: string;
    };

export type StoryWorldAssetImageOutput = {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  model: string;
};

export type StoryWorldAssetImageServiceOutput = {
  assetArtifactId: string;
  assetKind: StoryWorldAssetKind;
  image: ImageJobState;
  media?: {
    id: string;
    mimeType: string;
    signedUrl: string;
    signedUrlExpiresIn: number;
  };
};

export type StoryWorldAssetImagesServiceOutput = {
  imagesByArtifactId: Record<string, StoryWorldAssetImageServiceOutput>;
};

export type StoryWorldAssetImageRequestBody = {
  assetArtifactId?: unknown;
  assetKind?: unknown;
  sessionId?: unknown;
};

export type StoryWorldAssetImagesRequestBody = {
  assetArtifactIds?: unknown;
  sessionId?: unknown;
};

export class StoryWorldAssetImageRequestError extends Error {
  constructor(
    readonly code:
      | "asset_not_found"
      | "image_provider_not_configured"
      | "invalid_input"
      | "session_not_found"
  ) {
    super(`StoryCam asset image request error: ${code}`);
    this.name = "StoryWorldAssetImageRequestError";
  }
}

export async function generateStoryWorldAssetImage(
  client: SupabaseClient<Database>,
  userId: string,
  body: StoryWorldAssetImageRequestBody,
  provider?: ImageGenerationProvider<StoryWorldAssetImageInput, StoryWorldAssetImageOutput>
): Promise<ProviderFailure | { ok: true; value: StoryWorldAssetImageServiceOutput }> {
  if (!provider) {
    throw new StoryWorldAssetImageRequestError("image_provider_not_configured");
  }

  const input = parseStoryWorldAssetImageRequest(body);
  const sessions = new StoryCamSessionRepository(client);
  const session = await sessions.findById(userId, input.sessionId);

  if (!session) {
    throw new StoryWorldAssetImageRequestError("session_not_found");
  }

  const artifacts = new StoryCamArtifactRepository(client);
  const artifactRows = (await artifacts.listBySession(userId, { sessionId: input.sessionId })) ?? [];
  const target = artifactRows.find((row) => row.id === input.assetArtifactId && row.state === "ready");

  if (!target || target.type !== artifactTypeForAssetKind(input.assetKind)) {
    throw new StoryWorldAssetImageRequestError("asset_not_found");
  }

  const providerInput = buildStoryWorldAssetImageProviderInput(input, target, artifactRows);
  const providerResult = await provider.generateImage(providerInput);

  if (!providerResult.ok) {
    return providerResult;
  }

  const media = await writeGeneratedStoryCamMedia(client, {
    bytes: providerResult.value.bytes,
    kind: "thumbnail",
    linkedArtifactId: target.id,
    mimeType: providerResult.value.mimeType,
    sessionId: input.sessionId,
    source: "provider",
    userId
  });
  const signedUrlExpiresIn = storyCamSignedUrlTtlSeconds;

  return {
    ok: true,
    value: {
      assetArtifactId: target.id,
      assetKind: input.assetKind,
      image: {
        mediaId: media.id,
        mimeType: media.mimeType,
        placeholder: false,
        signedUrl: await createStoryCamSignedUrl(client, storyCamGeneratedBucket, media.path, signedUrlExpiresIn),
        signedUrlExpiresIn,
        status: "ready"
      },
      media: {
        id: media.id,
        mimeType: media.mimeType,
        signedUrl: await createStoryCamSignedUrl(client, storyCamGeneratedBucket, media.path, signedUrlExpiresIn),
        signedUrlExpiresIn
      }
    }
  };
}

export async function submitStoryWorldAssetImageJob(
  client: SupabaseClient<Database>,
  userId: string,
  body: StoryWorldAssetImageRequestBody,
  provider?: ImageGenerationProvider<StoryWorldAssetImageInput, AsyncImageProviderOutput>
): Promise<{ ok: true; value: StoryWorldAssetImageServiceOutput }> {
  if (!provider) {
    throw new StoryWorldAssetImageRequestError("image_provider_not_configured");
  }

  const input = parseStoryWorldAssetImageRequest(body);
  const sessions = new StoryCamSessionRepository(client);
  const session = await sessions.findById(userId, input.sessionId);

  if (!session) {
    throw new StoryWorldAssetImageRequestError("session_not_found");
  }

  const artifacts = new StoryCamArtifactRepository(client);
  const artifactRows = (await artifacts.listBySession(userId, { sessionId: input.sessionId })) ?? [];
  const target = artifactRows.find((row) => row.id === input.assetArtifactId && row.state === "ready");

  if (!target || target.type !== artifactTypeForAssetKind(input.assetKind)) {
    throw new StoryWorldAssetImageRequestError("asset_not_found");
  }

  const imageJob = await submitImageGenerationJob(client, userId, {
    imageInput: buildStoryWorldAssetImageProviderInput(input, target, artifactRows),
    inputArtifactVersionsJson: { [target.id]: target.version },
    linkedArtifactId: target.id,
    provider,
    sessionId: input.sessionId,
    type: "story_world_asset_image"
  });

  return {
    ok: true,
    value: toStoryWorldAssetImageOutput(target.id, input.assetKind, imageJob.image)
  };
}

export async function submitStoryWorldAssetImageJobs(
  client: SupabaseClient<Database>,
  userId: string,
  body: StoryWorldAssetImagesRequestBody,
  provider?: ImageGenerationProvider<StoryWorldAssetImageInput, AsyncImageProviderOutput>
): Promise<{ ok: true; value: StoryWorldAssetImagesServiceOutput }> {
  if (!provider) {
    throw new StoryWorldAssetImageRequestError("image_provider_not_configured");
  }

  const input = parseStoryWorldAssetImagesRequest(body);
  const sessions = new StoryCamSessionRepository(client);
  const session = await sessions.findById(userId, input.sessionId);

  if (!session) {
    throw new StoryWorldAssetImageRequestError("session_not_found");
  }

  const artifacts = new StoryCamArtifactRepository(client);
  const artifactRows = (await artifacts.listBySession(userId, { sessionId: input.sessionId })) ?? [];
  const readyAssets = artifactRows.filter((row) => row.state === "ready" && (row.type === "character_asset" || row.type === "scene_asset"));
  const requestedIds = input.assetArtifactIds.length ? new Set(input.assetArtifactIds) : null;
  const targets = readyAssets.filter((row) => !requestedIds || requestedIds.has(row.id));

  if (targets.length === 0) {
    throw new StoryWorldAssetImageRequestError("asset_not_found");
  }

  const entries = await Promise.all(
    targets.map(async (target) => {
      const assetKind = target.type === "character_asset" ? "character" : "scene";
      try {
        const imageJob = await submitImageGenerationJob(client, userId, {
          imageInput: buildStoryWorldAssetImageProviderInput(
            {
              assetArtifactId: target.id,
              assetKind,
              sessionId: input.sessionId
            },
            target,
            artifactRows
          ),
          inputArtifactVersionsJson: { [target.id]: target.version },
          linkedArtifactId: target.id,
          provider,
          sessionId: input.sessionId,
          type: "story_world_asset_image"
        });

        return [target.id, toStoryWorldAssetImageOutput(target.id, assetKind, imageJob.image)] as const;
      } catch {
        return [
          target.id,
          storyWorldAssetImagePlaceholderOutput(target.id, assetKind, "Asset image generation is unavailable for this asset.")
        ] as const;
      }
    })
  );

  return {
    ok: true,
    value: {
      imagesByArtifactId: Object.fromEntries(entries)
    }
  };
}

export function parseStoryWorldAssetImageRequest(body: StoryWorldAssetImageRequestBody) {
  const assetArtifactId = typeof body.assetArtifactId === "string" ? body.assetArtifactId.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";

  if (!assetArtifactId || !sessionId || (body.assetKind !== "character" && body.assetKind !== "scene")) {
    throw new StoryWorldAssetImageRequestError("invalid_input");
  }

  return {
    assetArtifactId,
    assetKind: body.assetKind as StoryWorldAssetKind,
    sessionId
  };
}

export function parseStoryWorldAssetImagesRequest(body: StoryWorldAssetImagesRequestBody) {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";

  if (!sessionId) {
    throw new StoryWorldAssetImageRequestError("invalid_input");
  }

  if (body.assetArtifactIds === undefined) {
    return {
      assetArtifactIds: [],
      sessionId
    };
  }

  if (!Array.isArray(body.assetArtifactIds) || body.assetArtifactIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new StoryWorldAssetImageRequestError("invalid_input");
  }

  return {
    assetArtifactIds: body.assetArtifactIds.map((id) => id.trim()),
    sessionId
  };
}

function toStoryWorldAssetImageOutput(
  assetArtifactId: string,
  assetKind: StoryWorldAssetKind,
  image: ImageJobState
): StoryWorldAssetImageServiceOutput {
  return {
    assetArtifactId,
    assetKind,
    image,
    ...(image.status === "ready"
      ? {
          media: {
            id: image.mediaId,
            mimeType: image.mimeType,
            signedUrl: image.signedUrl,
            signedUrlExpiresIn: image.signedUrlExpiresIn
          }
        }
      : {})
  };
}

function storyWorldAssetImagePlaceholderOutput(
  assetArtifactId: string,
  assetKind: StoryWorldAssetKind,
  redactedError: string
): StoryWorldAssetImageServiceOutput {
  return {
    assetArtifactId,
    assetKind,
    image: {
      placeholder: true,
      reason: "storage_failed",
      redactedError,
      status: "placeholder"
    }
  };
}

export function buildStoryWorldAssetImageProviderInput(
  input: ReturnType<typeof parseStoryWorldAssetImageRequest>,
  target: StoryCamArtifactRow,
  artifactRows: StoryCamArtifactRow[]
): StoryWorldAssetImageInput {
  const script = parseLatestScript(artifactRows);
  const characterAssets = parseCharacterAssets(artifactRows);

  if (input.assetKind === "character") {
    return {
      asset: characterAssetSchema.parse(target.data_json),
      assetArtifactId: target.id,
      assetKind: "character",
      characterAssets,
      script,
      sessionId: input.sessionId
    };
  }

  return {
    asset: sceneAssetSchema.parse(target.data_json),
    assetArtifactId: target.id,
    assetKind: "scene",
    characterAssets,
    script,
    sessionId: input.sessionId
  };
}

function parseLatestScript(artifactRows: StoryCamArtifactRow[]) {
  const script = artifactRows.find((row) => row.type === "script" && row.state === "ready");

  return script ? storyScriptSchema.parse(script.data_json) : undefined;
}

function parseCharacterAssets(artifactRows: StoryCamArtifactRow[]) {
  return artifactRows
    .filter((row) => row.type === "character_asset" && row.state === "ready")
    .map((row) => characterAssetSchema.parse(row.data_json));
}

function artifactTypeForAssetKind(assetKind: StoryWorldAssetKind) {
  return assetKind === "character" ? "character_asset" : "scene_asset";
}
