import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoreStoryboardGroup, ExpandedStoryboardCard, StoryboardScript } from "@/features/storycam/domain/artifacts";
import type { ImageGenerationProvider, ProviderFailure } from "@/lib/providers/types";
import type { Database } from "@/server/db/types";
import {
  writeGeneratedStoryCamMedia,
  type GeneratedStoryCamImageMimeType,
  type WriteGeneratedStoryCamMediaResult
} from "./generatedMediaService";
import { createStoryCamSignedUrl, storyCamGeneratedBucket, storyCamSignedUrlTtlSeconds } from "./mediaStore";

export type StoryboardRepresentativeImageInput = {
  characterAssetIds: string[];
  coreGroupId: string;
  emotionalTurn: string;
  estimatedClipDurationSeconds: number;
  mainImagePrompt?: string;
  sceneAssetId: string;
  sessionId: string;
  storyPurpose: string;
  title: string;
};

export type ExpandedStoryboardImageInput = {
  beatType: string;
  coreGroup: StoryboardRepresentativeImageInput;
  description: string;
  guidance: string;
  imagePrompt?: string;
  sortOrder: number;
  title: string;
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
      image: placeholderStoryboardImage(),
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
      image: placeholderStoryboardImage(),
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
    return placeholderStoryboardImage();
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
    return placeholderStoryboardImage();
  }
}

export function placeholderStoryboardImage(): GeneratedStoryboardImageState {
  return {
    placeholder: true,
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
  storyboardScript?: StoryboardScript
) {
  return toProviderInput(coreGroup, sessionId, storyboardScript);
}

export function toExpandedStoryboardProviderInput(input: {
  card: ExpandedStoryboardCard;
  coreGroup: CoreStoryboardGroup;
  sessionId: string;
}) {
  return {
    beatType: input.card.beatType,
    coreGroup: toProviderInput(input.coreGroup, input.sessionId),
    description: input.card.description,
    guidance: input.card.guidance,
    imagePrompt: input.card.imagePrompt,
    sortOrder: input.card.sortOrder,
    title: input.card.title
  } satisfies ExpandedStoryboardImageInput;
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
