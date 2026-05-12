import { createInferenceShImageProvider } from "@/lib/providers/inferenceSh/imageProvider";
import type { ImageGenerationProvider } from "@/lib/providers/types";
import { storyCamComicImagePromptLine, storyCamComicVisualSafetyLine } from "@/lib/storycam/visualStylePolicy";
import { isHanddrawnTravelVlogMode } from "@/features/storycam/domain/storyModes";
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
        height: input.aspectRatio === "9:16" ? 1536 : 864,
        images: input.referenceImages?.map((image) => image.signedUrl),
        prompt: buildStoryboardImagePrompt(input),
        quality: "high",
        width: input.aspectRatio === "9:16" ? 864 : 1536
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
      visibleCharacterAssetPrompt(input),
      handdrawnTravelStoryboardPrompt(input),
      baseStoryboardImagePrompt(input.aspectRatio)
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
    visibleCharacterAssetPrompt(input),
    handdrawnTravelStoryboardPrompt(input),
    baseStoryboardImagePrompt(input.aspectRatio)
  ]
    .filter(Boolean)
    .join("\n");
}

function handdrawnTravelStoryboardPrompt(input: StoryboardImageInput) {
  const storyModeId = "coreGroup" in input ? input.coreGroup.storyWorldBasis?.storyModeId : input.storyWorldBasis?.storyModeId;

  if (!isHanddrawnTravelVlogMode(storyModeId)) {
    return "";
  }

  return [
    "Handdrawn travel VLOG mode: combine real travel-location photography background with a hand-drawn illustrated traveler character.",
    "preserve the uploaded-photo-derived drawn character design from the character asset references, but do not make the character photorealistic.",
    "Keep the background grounded in real streets, architecture, landmarks, natural light, and travel-documentary perspective."
  ].join("\n");
}

function visibleCharacterAssetPrompt(input: StoryboardImageInput) {
  const visibleCharacterAssetIds = frameVisibleCharacterAssetIds(input);

  if (!visibleCharacterAssetIds.length) {
    return [
      "Visible character assets for this frame: none.",
      "Only render environment, objects, lighting, and off-screen effects; no visible characters."
    ].join("\n");
  }

  return [
    `Visible character assets for this frame: ${visibleCharacterAssetIds.join(", ")}.`,
    "Only render the visible character assets listed for this frame as characters.",
    "Do not add unlisted people, humans, pets, faces, silhouettes, backs, hands, or body parts.",
    "If the narrative mentions an unlisted person, keep them off-screen and show only effects such as a moving door, light change, object motion, sound cue, or a listed character's eyeline reaction."
  ].join("\n");
}

function frameVisibleCharacterAssetIds(input: StoryboardImageInput) {
  const allowedCharacterAssetIds = "coreGroup" in input ? input.coreGroup.characterAssetIds : input.characterAssetIds;
  const frameIds = input.frame?.visibleCharacterAssetIds;
  const requestedIds = frameIds?.length ? frameIds : allowedCharacterAssetIds;
  const allowedIds = new Set(allowedCharacterAssetIds);
  const visibleIds = requestedIds.filter((id) => allowedIds.has(id));

  return Array.from(new Set(visibleIds)).slice(0, 3);
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

function baseStoryboardImagePrompt(aspectRatio: StoryboardImageInput["aspectRatio"]) {
  const compositionLine =
    aspectRatio === "9:16"
      ? "Composition: vertical 9:16 frame for mobile video, full-height staging, keep the key subject readable without cropping heads or important props."
      : "Composition: horizontal 16:9 frame, readable cinematic staging, natural camera perspective, no collage, no model sheet, no UI.";

  return [
    storyCamComicImagePromptLine(aspectRatio),
    "Subject: fictional illustrated people in a private-memory comic film scene; grounded facial expressions and small visible actions.",
    "Continuity: keep character appearance, wardrobe, props, location, lighting, and mood consistent with the confirmed StoryCam assets.",
    compositionLine,
    "No readable text, no subtitles, no watermarks, no logos."
  ].join("\n");
}
