import { createInferenceShImageProvider } from "@/lib/providers/inferenceSh/imageProvider";
import type { ImageGenerationProvider } from "@/lib/providers/types";
import { storyCamComicImagePromptLine, storyCamComicVisualSafetyLine } from "@/lib/storycam/visualStylePolicy";
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
        images: input.referenceImages?.map((image) => image.signedUrl),
        prompt: buildStoryboardImagePrompt(input),
        quality: "high",
        width: 1536
      }),
      maxAttempts: 2,
      supportsReferenceImages: true
    });
  }

  if (config.generation.imageProvider === "openrouter") {
    return undefined;
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
      referenceImagePrompt(input.referenceImages),
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
    referenceImagePrompt(input.referenceImages),
    baseStoryboardImagePrompt()
  ]
    .filter(Boolean)
    .join("\n");
}

function referenceImagePrompt(referenceImages: StoryboardImageInput["referenceImages"]) {
  if (!referenceImages?.length) {
    return "";
  }

  const references = referenceImages
    .map((image, index) => `${index + 1}. ${image.kind} asset ${image.assetArtifactId}, media ${image.mediaId}`)
    .join("\n");

  return [
    "Use the attached StoryCam asset reference images as the visual source of truth.",
    references,
    "Translate any non-comic source reference into the same illustrated comic-animation style.",
    "Do not invent new character faces, wardrobes, props, locations, lighting, or spatial layout beyond those references.",
    storyCamComicVisualSafetyLine
  ].join("\n");
}

function baseStoryboardImagePrompt() {
  return [
    storyCamComicImagePromptLine(),
    "Subject: fictional illustrated people in a private-memory comic film scene; grounded facial expressions and small visible actions.",
    "Continuity: keep character appearance, wardrobe, props, location, lighting, and mood consistent with the confirmed StoryCam assets.",
    "Composition: clear single frame, readable staging, natural camera perspective, no collage, no model sheet, no UI.",
    "No readable text, no subtitles, no watermarks, no logos."
  ].join("\n");
}
