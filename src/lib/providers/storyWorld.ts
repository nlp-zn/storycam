import { z } from "zod";
import {
  characterAssetSchema,
  sceneAssetSchema,
  scenePanelSchema,
  storyScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import type { CharacterAsset, SceneAsset, StoryScript } from "@/features/storycam/domain/artifacts";

export type UploadedPhotoReference = {
  mediaAssetId: string;
  storageBucket?: string;
  storagePath?: string;
};

export type StoryWorldProviderInput = {
  idea: string;
  lightweightChoices?: string[];
  sessionId: string;
  uploadedPhotoRefs?: UploadedPhotoReference[];
};

export type StoryWorldProviderOutput = {
  characterAssets: CharacterAsset[];
  sceneAssets: SceneAsset[];
  script: StoryScript;
};

const generatedSceneAssetSchema = sceneAssetSchema.extend({
  scenePanels: z.array(scenePanelSchema).min(4).max(6)
});

export const storyWorldProviderOutputSchema = z.object({
  characterAssets: z.array(characterAssetSchema).min(1).max(3),
  sceneAssets: z.array(generatedSceneAssetSchema).length(1),
  script: storyScriptSchema
});
