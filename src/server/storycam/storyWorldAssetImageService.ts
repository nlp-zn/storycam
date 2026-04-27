import type { SupabaseClient } from "@supabase/supabase-js";
import { characterAssetSchema, sceneAssetSchema, storyScriptSchema } from "@/features/storycam/domain/artifactSchemas";
import type { CharacterAsset, SceneAsset, StoryScript } from "@/features/storycam/domain/artifacts";
import type { ImageGenerationProvider, ProviderFailure } from "@/lib/providers/types";
import type { OpenRouterImageProviderOutput } from "@/lib/providers/openrouter/imageProvider";
import type { Database, StoryCamArtifactRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { writeGeneratedStoryCamMedia } from "./generatedMediaService";
import { createStoryCamSignedUrl, storyCamGeneratedBucket, storyCamSignedUrlTtlSeconds } from "./mediaStore";
import { StoryCamSessionRepository } from "./sessionRepository";

export type StoryWorldAssetKind = "character" | "scene";

export type StoryWorldAssetImageInput =
  | {
      asset: CharacterAsset;
      assetArtifactId: string;
      assetKind: "character";
      script?: StoryScript;
      sessionId: string;
    }
  | {
      asset: SceneAsset;
      assetArtifactId: string;
      assetKind: "scene";
      script?: StoryScript;
      sessionId: string;
    };

export type StoryWorldAssetImageOutput = OpenRouterImageProviderOutput;

export type StoryWorldAssetImageServiceOutput = {
  assetArtifactId: string;
  assetKind: StoryWorldAssetKind;
  media: {
    id: string;
    mimeType: string;
    signedUrl: string;
    signedUrlExpiresIn: number;
  };
};

export type StoryWorldAssetImageRequestBody = {
  assetArtifactId?: unknown;
  assetKind?: unknown;
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

  const providerInput = toProviderInput(input, target, artifactRows);
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
      media: {
        id: media.id,
        mimeType: media.mimeType,
        signedUrl: await createStoryCamSignedUrl(client, storyCamGeneratedBucket, media.path, signedUrlExpiresIn),
        signedUrlExpiresIn
      }
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

function toProviderInput(
  input: ReturnType<typeof parseStoryWorldAssetImageRequest>,
  target: StoryCamArtifactRow,
  artifactRows: StoryCamArtifactRow[]
): StoryWorldAssetImageInput {
  const script = parseLatestScript(artifactRows);

  if (input.assetKind === "character") {
    return {
      asset: characterAssetSchema.parse(target.data_json),
      assetArtifactId: target.id,
      assetKind: "character",
      script,
      sessionId: input.sessionId
    };
  }

  return {
    asset: sceneAssetSchema.parse(target.data_json),
    assetArtifactId: target.id,
    assetKind: "scene",
    script,
    sessionId: input.sessionId
  };
}

function parseLatestScript(artifactRows: StoryCamArtifactRow[]) {
  const script = artifactRows.find((row) => row.type === "script" && row.state === "ready");

  return script ? storyScriptSchema.parse(script.data_json) : undefined;
}

function artifactTypeForAssetKind(assetKind: StoryWorldAssetKind) {
  return assetKind === "character" ? "character_asset" : "scene_asset";
}
