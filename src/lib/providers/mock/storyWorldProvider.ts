import {
  characterAssetSchema,
  sceneAssetSchema,
  storyScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type {
  StoryWorldProviderInput,
  StoryWorldProviderOutput,
  UploadedPhotoReference
} from "@/lib/providers/storyWorld";
import type { ProviderResult, TextGenerationProvider } from "@/lib/providers/types";
import { rainyKDramaStoryWorldFixture, type MockStoryWorldFixture } from "./fixtures/storyWorld";

export type { UploadedPhotoReference };
export type MockStoryWorldInput = StoryWorldProviderInput;
export type MockStoryWorldOutput = StoryWorldProviderOutput;

export function createMockStoryWorldProvider(
  fixture: MockStoryWorldFixture = rainyKDramaStoryWorldFixture
): TextGenerationProvider<MockStoryWorldInput, MockStoryWorldOutput> {
  return {
    providerKind: "text",
    providerName: "mock",
    async generate(input) {
      return generateMockStoryWorld(input, fixture);
    }
  };
}

function generateMockStoryWorld(
  input: MockStoryWorldInput,
  fixture: MockStoryWorldFixture
): Promise<ProviderResult<MockStoryWorldOutput>> {
  try {
    const referenceMediaIds = (input.uploadedPhotoRefs ?? []).map((ref) => ref.mediaAssetId);
    const output = {
      script: storyScriptSchema.parse({
        ...fixture.script,
        sessionId: input.sessionId
      }),
      characterAssets: fixture.characterAssets.map((asset) =>
        characterAssetSchema.parse({
          ...asset,
          referenceMediaIds,
          sessionId: input.sessionId
        })
      ),
      sceneAssets: fixture.sceneAssets.map((asset) =>
        sceneAssetSchema.parse({
          ...asset,
          referenceMediaIds,
          sessionId: input.sessionId
        })
      )
    };

    return Promise.resolve(providerSuccess({ providerKind: "text", providerName: "mock" }, output));
  } catch (error) {
    return Promise.resolve(
      providerFailure(
        {
          providerKind: "text",
          providerName: "mock"
        },
        error,
        {
          errorCode: "MOCK_STORY_WORLD_INVALID_FIXTURE",
          retryable: false
        }
      )
    );
  }
}
