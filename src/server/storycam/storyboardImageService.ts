import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoreStoryboardGroup, ExpandedStoryboardCard, StoryboardScript } from "@/features/storycam/domain/artifacts";
import type { ImageGenerationProvider, ProviderFailure } from "@/lib/providers/types";
import { characterAssetSchema, sceneAssetSchema } from "@/features/storycam/domain/artifactSchemas";
import type { Database, MediaAssetRow, StoryCamArtifactRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import {
  writeGeneratedStoryCamMedia,
  type GeneratedStoryCamImageMimeType,
  type WriteGeneratedStoryCamMediaResult
} from "./generatedMediaService";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import {
  createStoryCamProviderReferenceSignedUrl,
  createStoryCamSignedUrl,
  storyCamGeneratedBucket,
  storyCamProviderReferenceSignedUrlTtlSeconds,
  storyCamSignedUrlTtlSeconds,
  StoryCamMediaStoreError
} from "./mediaStore";

export type StoryboardRepresentativeImageInput = {
  characterAssetIds: string[];
  coreGroupId: string;
  emotionalTurn: string;
  estimatedClipDurationSeconds: number;
  frame?: StoryboardImageFrameInput;
  mainImagePrompt?: string;
  referenceImages?: StoryWorldReferenceImage[];
  sceneAssetId: string;
  sessionId: string;
  storyWorldBasis?: StoryWorldImageBasis;
  storyPurpose: string;
  title: string;
};

export type ExpandedStoryboardImageInput = {
  beatType: string;
  coreGroup: StoryboardRepresentativeImageInput;
  description: string;
  frame?: StoryboardImageFrameInput;
  guidance: string;
  imagePrompt?: string;
  referenceImages?: StoryWorldReferenceImage[];
  sortOrder: number;
  storyWorldBasis?: StoryWorldImageBasis;
  title: string;
};

export type StoryboardImageFrameInput = {
  frameNumber: number;
  imagePrompt: string;
  title: string;
  visualContent: string;
};

export type StoryWorldReferenceImage = {
  assetArtifactId: string;
  kind: "character" | "scene";
  mediaId: string;
  mimeType: string;
  signedUrl: string;
  signedUrlExpiresIn: number;
};

export type StoryWorldImageBasis = {
  characterAssetIds: string[];
  sceneAssetId: string;
  scriptArtifactId?: string;
};

export type StoryWorldVisualContext =
  | {
      inputArtifactVersionsJson: Record<string, number | string>;
      ok: true;
      referenceImages: StoryWorldReferenceImage[];
      storyWorldBasis: StoryWorldImageBasis;
    }
  | {
      ok: false;
      reason: "reference_images_unsupported" | "waiting_for_asset_images";
    };

export type StoryboardRepresentativeImageOutput = {
  bytes: Uint8Array;
  mimeType: GeneratedStoryCamImageMimeType;
  model?: string;
};

export type StoryboardRepresentativeImageResult =
  | {
      coreGroupId: string;
      image: GeneratedStoryboardImageState;
      media: WriteGeneratedStoryCamMediaResult;
      placeholder: false;
      status: "ready";
    }
  | {
      coreGroupId: string;
      image: GeneratedStoryboardImageState;
      media: null;
      placeholder: true;
      reason: "provider_failed" | "storage_failed";
      redactedFailure?: ProviderFailure;
      status: "placeholder";
    };

export type GeneratedStoryboardImageState =
  | {
      mediaId: string;
      mimeType: string;
      placeholder: false;
      signedUrl: string;
      signedUrlExpiresIn: number;
      status: "ready";
    }
  | {
      jobId: string;
      mediaId?: undefined;
      mimeType?: undefined;
      placeholder: true;
      signedUrl?: undefined;
      signedUrlExpiresIn?: undefined;
      status: "generating";
    }
  | {
      mediaId?: undefined;
      mimeType?: undefined;
      placeholder: true;
      reason?: "provider_failed" | "reference_images_unsupported" | "storage_failed" | "waiting_for_asset_images";
      signedUrl?: undefined;
      signedUrlExpiresIn?: undefined;
      status: "placeholder";
    };

export async function generateCoreStoryboardRepresentativeImage(
  client: SupabaseClient<Database>,
  input: {
    coreGroup: CoreStoryboardGroup;
    linkedArtifactId?: string;
    storyboardScript?: StoryboardScript;
    provider: ImageGenerationProvider<StoryboardRepresentativeImageInput, StoryboardRepresentativeImageOutput>;
    sessionId: string;
    userId: string;
  }
): Promise<StoryboardRepresentativeImageResult> {
  const providerResult = await input.provider.generateImage(toProviderInput(input.coreGroup, input.sessionId, input.storyboardScript));

  if (!providerResult.ok) {
    return {
      coreGroupId: input.coreGroup.id,
      image: placeholderStoryboardImage("provider_failed"),
      media: null,
      placeholder: true,
      reason: "provider_failed",
      redactedFailure: providerResult,
      status: "placeholder"
    };
  }

  try {
    const media = await writeGeneratedStoryCamMedia(client, {
      bytes: providerResult.value.bytes,
      kind: "thumbnail",
      linkedArtifactId: input.linkedArtifactId ?? input.coreGroup.id,
      mimeType: providerResult.value.mimeType,
      sessionId: input.sessionId,
      source: "provider",
      userId: input.userId
    });

    return {
      coreGroupId: input.coreGroup.id,
      image: await toReadyStoryboardImage(client, media),
      media,
      placeholder: false,
      status: "ready"
    };
  } catch {
    return {
      coreGroupId: input.coreGroup.id,
      image: placeholderStoryboardImage("storage_failed"),
      media: null,
      placeholder: true,
      reason: "storage_failed",
      status: "placeholder"
    };
  }
}

export async function generateExpandedStoryboardImage(
  client: SupabaseClient<Database>,
  input: {
    card: ExpandedStoryboardCard;
    linkedArtifactId?: string;
    coreGroup: CoreStoryboardGroup;
    provider: ImageGenerationProvider<ExpandedStoryboardImageInput, StoryboardRepresentativeImageOutput>;
    sessionId: string;
    userId: string;
  }
): Promise<GeneratedStoryboardImageState> {
  const providerResult = await input.provider.generateImage({
    beatType: input.card.beatType,
    coreGroup: toProviderInput(input.coreGroup, input.sessionId),
    description: input.card.description,
    guidance: input.card.guidance,
    imagePrompt: input.card.imagePrompt,
    sortOrder: input.card.sortOrder,
    title: input.card.title
  });

  if (!providerResult.ok) {
    return placeholderStoryboardImage("provider_failed");
  }

  try {
    const media = await writeGeneratedStoryCamMedia(client, {
      bytes: providerResult.value.bytes,
      kind: "thumbnail",
      linkedArtifactId: input.linkedArtifactId ?? input.card.id,
      mimeType: providerResult.value.mimeType,
      sessionId: input.sessionId,
      source: "provider",
      userId: input.userId
    });

    return toReadyStoryboardImage(client, media);
  } catch {
    return placeholderStoryboardImage("storage_failed");
  }
}

export function placeholderStoryboardImage(reason?: "provider_failed" | "reference_images_unsupported" | "storage_failed" | "waiting_for_asset_images"): GeneratedStoryboardImageState {
  return {
    placeholder: true,
    ...(reason ? { reason } : {}),
    status: "placeholder"
  };
}

function toProviderInput(
  coreGroup: CoreStoryboardGroup,
  sessionId: string,
  storyboardScript?: StoryboardScript
): StoryboardRepresentativeImageInput {
  return {
    characterAssetIds: coreGroup.characterAssetIds,
    coreGroupId: coreGroup.id,
    emotionalTurn: coreGroup.emotionalTurn,
    estimatedClipDurationSeconds: coreGroup.estimatedClipDurationSeconds,
    frame: storyboardScript?.frames?.[0]
      ? {
          frameNumber: storyboardScript.frames[0].frameNumber,
          imagePrompt: storyboardScript.frames[0].imagePrompt,
          title: storyboardScript.frames[0].title,
          visualContent: storyboardScript.frames[0].visualContent
        }
      : undefined,
    mainImagePrompt: storyboardScript?.mainImagePrompt,
    sceneAssetId: coreGroup.sceneAssetId,
    sessionId,
    storyPurpose: coreGroup.storyPurpose,
    title: coreGroup.title
  };
}

export function toStoryboardRepresentativeProviderInput(
  coreGroup: CoreStoryboardGroup,
  sessionId: string,
  storyboardScript?: StoryboardScript,
  visualContext?: Extract<StoryWorldVisualContext, { ok: true }>
) {
  return withVisualContext(toProviderInput(coreGroup, sessionId, storyboardScript), visualContext);
}

export function toExpandedStoryboardProviderInput(input: {
  card: ExpandedStoryboardCard;
  coreGroup: CoreStoryboardGroup;
  sessionId: string;
  visualContext?: Extract<StoryWorldVisualContext, { ok: true }>;
}) {
  return {
    beatType: input.card.beatType,
    coreGroup: withVisualContext(toProviderInput(input.coreGroup, input.sessionId), input.visualContext),
    description: input.card.description,
    frame:
      input.card.frameNumber && input.card.imagePrompt
        ? {
            frameNumber: input.card.frameNumber,
            imagePrompt: input.card.imagePrompt,
            title: input.card.title,
            visualContent: input.card.description
          }
        : undefined,
    guidance: input.card.guidance,
    imagePrompt: input.card.imagePrompt,
    referenceImages: input.visualContext?.referenceImages,
    sortOrder: input.card.sortOrder,
    storyWorldBasis: input.visualContext?.storyWorldBasis,
    title: input.card.title
  } satisfies ExpandedStoryboardImageInput;
}

function withVisualContext<T extends StoryboardRepresentativeImageInput>(
  input: T,
  visualContext?: Extract<StoryWorldVisualContext, { ok: true }>
): T {
  if (!visualContext) {
    return input;
  }

  return {
    ...input,
    referenceImages: visualContext.referenceImages,
    storyWorldBasis: visualContext.storyWorldBasis
  };
}

export async function loadStoryWorldVisualContext(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    coreGroup: CoreStoryboardGroup;
    providerReferenceSignedUrlTtlSeconds?: number;
    sessionId: string;
  }
): Promise<StoryWorldVisualContext> {
  const artifacts = new StoryCamArtifactRepository(client);
  const mediaAssets = new StoryCamMediaAssetRepository(client);
  const artifactRows = (await artifacts.listBySession(userId, { sessionId: input.sessionId })) ?? [];
  const characterRows = findCharacterArtifactRows(artifactRows, input.coreGroup.characterAssetIds);
  const sceneRow = findSceneArtifactRow(artifactRows, input.coreGroup.sceneAssetId);
  const scriptRow = artifactRows.find((row) => row.type === "script" && row.state === "ready");

  if (characterRows.length !== input.coreGroup.characterAssetIds.length || !sceneRow || !scriptRow) {
    return { ok: false, reason: "waiting_for_asset_images" };
  }

  const referenceRows = [...characterRows, sceneRow];
  let referenceImages: Array<StoryWorldReferenceImage | null>;

  try {
    referenceImages = await Promise.all(
      referenceRows.map(async (artifact) => {
        const media = await mediaAssets.findLatestThumbnailByLinkedArtifact(userId, {
          linkedArtifactId: artifact.id,
          sessionId: input.sessionId
        });

        if (!media) {
          return null;
        }

        return toReferenceImage(client, artifact, media, {
          providerReferenceSignedUrlTtlSeconds:
            input.providerReferenceSignedUrlTtlSeconds ?? storyCamProviderReferenceSignedUrlTtlSeconds
        });
      })
    );
  } catch (error) {
    if (error instanceof StoryCamMediaStoreError && error.code === "provider_reference_url_not_public") {
      return { ok: false, reason: "reference_images_unsupported" };
    }

    throw error;
  }

  if (referenceImages.some((image) => !image)) {
    return { ok: false, reason: "waiting_for_asset_images" };
  }

  const readyReferenceImages = referenceImages.filter(Boolean) as StoryWorldReferenceImage[];

  const storyWorldVersions = Object.fromEntries([...referenceRows, scriptRow].map((row) => [row.id, row.version]));
  const mediaReferences = Object.fromEntries(
    referenceImages.map((image) => [`media:${image?.mediaId ?? ""}`, image?.mediaId ?? ""]).filter(([key, value]) => key !== "media:" && value)
  );

  return {
    inputArtifactVersionsJson: {
      ...storyWorldVersions,
      ...mediaReferences
    },
    ok: true,
    referenceImages: readyReferenceImages,
    storyWorldBasis: {
      characterAssetIds: characterRows.map((row) => row.id),
      sceneAssetId: sceneRow.id,
      scriptArtifactId: scriptRow.id
    }
  };
}

function findCharacterArtifactRows(rows: StoryCamArtifactRow[], requiredIds: string[]) {
  return requiredIds
    .map((id) =>
      rows.find((row) => row.type === "character_asset" && row.state === "ready" && (row.id === id || characterAssetSchema.safeParse(row.data_json).data?.id === id))
    )
    .filter((row): row is StoryCamArtifactRow => Boolean(row));
}

function findSceneArtifactRow(rows: StoryCamArtifactRow[], requiredId: string) {
  return rows.find(
    (row) => row.type === "scene_asset" && row.state === "ready" && (row.id === requiredId || sceneAssetSchema.safeParse(row.data_json).data?.id === requiredId)
  );
}

async function toReferenceImage(
  client: SupabaseClient<Database>,
  artifact: StoryCamArtifactRow,
  media: MediaAssetRow,
  options: {
    providerReferenceSignedUrlTtlSeconds: number;
  }
): Promise<StoryWorldReferenceImage> {
  return {
    assetArtifactId: artifact.id,
    kind: artifact.type === "character_asset" ? "character" : "scene",
    mediaId: media.id,
    mimeType: media.mime_type,
    signedUrl: await createStoryCamProviderReferenceSignedUrl(
      client,
      storyCamGeneratedBucket,
      media.storage_path,
      options.providerReferenceSignedUrlTtlSeconds
    ),
    signedUrlExpiresIn: options.providerReferenceSignedUrlTtlSeconds
  };
}

export function generatingStoryboardImage(jobId: string): GeneratedStoryboardImageState {
  return {
    jobId,
    placeholder: true,
    status: "generating"
  };
}

export async function toReadyStoryboardImage(
  client: SupabaseClient<Database>,
  media: WriteGeneratedStoryCamMediaResult
): Promise<GeneratedStoryboardImageState> {
  const signedUrlExpiresIn = storyCamSignedUrlTtlSeconds;

  return {
    mediaId: media.id,
    mimeType: media.mimeType,
    placeholder: false,
    signedUrl: await createStoryCamSignedUrl(client, storyCamGeneratedBucket, media.path, signedUrlExpiresIn),
    signedUrlExpiresIn,
    status: "ready"
  };
}
