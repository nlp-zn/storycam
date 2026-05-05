import { createInferenceShImageProvider } from "@/lib/providers/inferenceSh/imageProvider";
import { createOpenRouterImageProvider } from "@/lib/providers/openrouter/imageProvider";
import type { ImageGenerationProvider } from "@/lib/providers/types";
import type { StoryCamConfig } from "@/server/config";
import type {
  ExpandedStoryboardImageInput,
  StoryboardRepresentativeImageInput,
  StoryboardRepresentativeImageOutput
} from "./storyboardImageService";

type StoryboardImageInput = StoryboardRepresentativeImageInput | ExpandedStoryboardImageInput;

export function createConfiguredStoryboardImageProvider(
  config: StoryCamConfig
): ImageGenerationProvider<StoryboardImageInput, StoryboardRepresentativeImageOutput> | undefined {
  if (config.generation.imageProvider === "inference_sh") {
    if (!config.inferenceSh?.apiKey || !config.inferenceSh.imageApp) {
      return undefined;
    }

    return createInferenceShImageProvider<StoryboardImageInput>({
      apiKey: config.inferenceSh.apiKey,
      app: config.inferenceSh.imageApp,
      buildPrompt: (input) => ({
        height: 864,
        prompt: buildStoryboardImagePrompt(input),
        quality: "high",
        width: 1536
      }),
      maxAttempts: 2
    });
  }

  if (config.generation.imageProvider === "openrouter") {
    if (!config.openrouter?.apiKey || !config.openrouter.imageModel) {
      return undefined;
    }

    return createOpenRouterImageProvider<StoryboardImageInput>({
      apiKey: config.openrouter.apiKey,
      buildPrompt: (input) => ({
        aspectRatio: "16:9",
        prompt: buildStoryboardImagePrompt(input)
      }),
      maxAttempts: 2,
      model: config.openrouter.imageModel
    });
  }

  return undefined;
}

export function buildStoryboardImagePrompt(input: StoryboardImageInput) {
  if ("coreGroup" in input) {
    return [
      "Create one expanded storyboard image for StoryCam.",
      `Parent core storyboard: ${input.coreGroup.title}.`,
      `Expansion card ${input.sortOrder + 1}: ${input.title}. Beat type: ${input.beatType}.`,
      `Description: ${input.description}.`,
      `Guidance: ${input.guidance}.`,
      input.imagePrompt ? `Specific image prompt: ${input.imagePrompt}.` : "",
      baseStoryboardImagePrompt()
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    input.mainImagePrompt ? `Specific main image prompt: ${input.mainImagePrompt}.` : "",
    `Core storyboard title: ${input.title}.`,
    `Story purpose: ${input.storyPurpose}.`,
    `Emotional turn: ${input.emotionalTurn}.`,
    `Approximate clip duration: ${input.estimatedClipDurationSeconds} seconds.`,
    baseStoryboardImagePrompt()
  ]
    .filter(Boolean)
    .join("\n");
}

function baseStoryboardImagePrompt() {
  return [
    "Style: cinematic storyboard still, polished production frame, 16:9 landscape.",
    "Subject: ordinary people in a private-memory film scene; grounded facial expressions and small visible actions.",
    "Continuity: keep character appearance, wardrobe, props, location, lighting, and mood consistent with the confirmed StoryCam assets.",
    "Composition: clear single frame, readable staging, natural camera perspective, no collage, no model sheet, no UI.",
    "No readable text, no subtitles, no watermarks, no logos."
  ].join("\n");
}
