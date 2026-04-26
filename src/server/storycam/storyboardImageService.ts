import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoreStoryboardGroup } from "@/features/storycam/domain/artifacts";
import type { ImageGenerationProvider, ProviderFailure } from "@/lib/providers/types";
import type { Database } from "@/server/db/types";
import {
  writeGeneratedStoryCamMedia,
  type GeneratedStoryCamImageMimeType,
  type WriteGeneratedStoryCamMediaResult
} from "./generatedMediaService";

export type StoryboardRepresentativeImageInput = {
  characterAssetIds: string[];
  coreGroupId: string;
  emotionalTurn: string;
  estimatedClipDurationSeconds: number;
  sceneAssetId: string;
  sessionId: string;
  storyPurpose: string;
  title: string;
};

export type StoryboardRepresentativeImageOutput = {
  bytes: Uint8Array;
  mimeType: GeneratedStoryCamImageMimeType;
};

export type StoryboardRepresentativeImageResult =
  | {
      coreGroupId: string;
      media: WriteGeneratedStoryCamMediaResult;
      placeholder: false;
      status: "ready";
    }
  | {
      coreGroupId: string;
      media: null;
      placeholder: true;
      reason: "provider_failed" | "storage_failed";
      redactedFailure?: ProviderFailure;
      status: "placeholder";
    };

export async function generateCoreStoryboardRepresentativeImage(
  client: SupabaseClient<Database>,
  input: {
    coreGroup: CoreStoryboardGroup;
    provider: ImageGenerationProvider<StoryboardRepresentativeImageInput, StoryboardRepresentativeImageOutput>;
    sessionId: string;
    userId: string;
  }
): Promise<StoryboardRepresentativeImageResult> {
  const providerResult = await input.provider.generateImage(toProviderInput(input.coreGroup, input.sessionId));

  if (!providerResult.ok) {
    return {
      coreGroupId: input.coreGroup.id,
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
      linkedArtifactId: input.coreGroup.id,
      mimeType: providerResult.value.mimeType,
      sessionId: input.sessionId,
      source: "provider",
      userId: input.userId
    });

    return {
      coreGroupId: input.coreGroup.id,
      media,
      placeholder: false,
      status: "ready"
    };
  } catch {
    return {
      coreGroupId: input.coreGroup.id,
      media: null,
      placeholder: true,
      reason: "storage_failed",
      status: "placeholder"
    };
  }
}

function toProviderInput(coreGroup: CoreStoryboardGroup, sessionId: string): StoryboardRepresentativeImageInput {
  return {
    characterAssetIds: coreGroup.characterAssetIds,
    coreGroupId: coreGroup.id,
    emotionalTurn: coreGroup.emotionalTurn,
    estimatedClipDurationSeconds: coreGroup.estimatedClipDurationSeconds,
    sceneAssetId: coreGroup.sceneAssetId,
    sessionId,
    storyPurpose: coreGroup.storyPurpose,
    title: coreGroup.title
  };
}
