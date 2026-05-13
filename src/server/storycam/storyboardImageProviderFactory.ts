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
  const isHanddrawnTravel = isHanddrawnTravelStoryboardInput(input);

  if ("coreGroup" in input) {
    return [
      "Create one expanded storyboard image for StoryCam.",
      `Parent core storyboard: ${input.coreGroup.title}.`,
      `Expansion card ${input.sortOrder + 1}: ${input.title}. Beat type: ${input.beatType}.`,
      `Description: ${input.description}.`,
      `Guidance: ${input.guidance}.`,
      specificImagePromptLine(input.imagePrompt, isHanddrawnTravel),
      referenceImagePrompt(input),
      visibleCharacterAssetPrompt(input),
      handdrawnTravelStoryboardPrompt(input),
      isHanddrawnTravel ? handdrawnTravelBaseStoryboardImagePrompt(input.aspectRatio) : baseStoryboardImagePrompt(input.aspectRatio)
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    specificImagePromptLine(input.mainImagePrompt, isHanddrawnTravel, "Specific main image prompt"),
    `Core storyboard title: ${input.title}.`,
    `Story purpose: ${input.storyPurpose}.`,
    `Emotional turn: ${input.emotionalTurn}.`,
    `Approximate clip duration: ${input.estimatedClipDurationSeconds} seconds.`,
    referenceImagePrompt(input),
    visibleCharacterAssetPrompt(input),
    handdrawnTravelStoryboardPrompt(input),
    isHanddrawnTravel ? handdrawnTravelBaseStoryboardImagePrompt(input.aspectRatio) : baseStoryboardImagePrompt(input.aspectRatio)
  ]
    .filter(Boolean)
    .join("\n");
}

function handdrawnTravelStoryboardPrompt(input: StoryboardImageInput) {
  if (!isHanddrawnTravelStoryboardInput(input)) {
    return "";
  }

  return [
    "Handdrawn travel VLOG mode: create a real travel photo / mobile VLOG still with one 2D hand-drawn traveler composited into it.",
    "This follows the reference workflow: first make a real travel photograph frame, then place the drawn traveler character into that real location.",
    "Preserve the uploaded-photo-derived drawn character design from the character asset references, but do not make the character photorealistic.",
    "Keep the background grounded in the actual travel destination: real streets, architecture, landmarks, natural light, depth, lens perspective, and travel-documentary texture.",
    "Only the traveler is hand-drawn. Do not turn the real location, architecture, street, sky, vehicles, or props into comic illustration."
  ].join("\n");
}

function specificImagePromptLine(value: string | undefined, isHanddrawnTravel: boolean, label = "Specific image prompt") {
  if (!value) {
    return "";
  }

  if (!isHanddrawnTravel) {
    return `${label}: ${value}.`;
  }

  return [
    `${label} action/composition cue: ${value}.`,
    'Use this cue only for framing, objects, motion, and narrative action; ignore any "stylized comic", "storyboard", "anime", "illustration", or all-comic background wording inside it.',
    "For handdrawn travel VLOG mode, the background must remain real travel-location photography."
  ].join("\n");
}

function isHanddrawnTravelStoryboardInput(input: StoryboardImageInput) {
  const storyModeId = "coreGroup" in input ? input.coreGroup.storyWorldBasis?.storyModeId : input.storyWorldBasis?.storyModeId;

  return isHanddrawnTravelVlogMode(storyModeId);
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

function referenceImagePrompt(input: StoryboardImageInput) {
  const referenceImages = input.referenceImages;

  if (!referenceImages?.length) {
    return "";
  }

  const hasCoreStoryboardReference = referenceImages.some((image) => image.kind === "core_storyboard");
  const references = referenceImages
    .map((image, index) => `${index + 1}. ${referenceImageRoleLabel(image.kind)} ${image.assetArtifactId}, media ${image.mediaId}`)
    .join("\n");
  const coreStoryboardContinuityLines = hasCoreStoryboardReference
    ? [
        "Core storyboard reference images: use as the exact spatial continuity anchor for expanded frames.",
        "Preserve fixed landmarks, object positions, wall cracks, plants, flowers, doors, windows, street edges, and left/right relationships from the core storyboard reference.",
        "Do not move distinctive objects to the opposite wall, side, door, window, or street edge; only crop or occlude them when the camera angle demands it."
      ]
    : [];

  if (isHanddrawnTravelStoryboardInput(input)) {
    return [
      "Use the attached StoryCam asset reference images with separate roles.",
      references,
      "Character reference images: use only for the hand-drawn traveler design, hair, glasses, wardrobe, body proportion, props, line texture, and casual travel mood.",
      "Scene reference images: use as the real travel-location photography source of truth for destination architecture, street layout, landmark cues, daylight, weather, lens perspective, and spatial depth.",
      ...coreStoryboardContinuityLines,
      "Do not translate scene references into comic, anime, painting, sketch, or model-sheet style. The final background must stay photographic and grounded in the actual travel location.",
      "Do not invent a different destination, generic fantasy street, studio background, collage, route board, or illustrated environment.",
      storyCamComicVisualSafetyLine
    ].join("\n");
  }

  return [
    "Use the attached StoryCam asset reference images as the visual source of truth.",
    references,
    "Translate any non-comic source reference into the same illustrated comic-animation style.",
    ...coreStoryboardContinuityLines,
    "Do not invent new character faces, wardrobes, props, locations, lighting, or spatial layout beyond those references.",
    storyCamComicVisualSafetyLine
  ].join("\n");
}

function referenceImageRoleLabel(kind: NonNullable<StoryboardImageInput["referenceImages"]>[number]["kind"]) {
  if (kind === "character") {
    return "character asset";
  }

  if (kind === "scene") {
    return "scene asset";
  }

  return "core storyboard reference";
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

function handdrawnTravelBaseStoryboardImagePrompt(aspectRatio: StoryboardImageInput["aspectRatio"]) {
  const compositionLine =
    aspectRatio === "9:16"
      ? "Composition: vertical 9:16 mobile VLOG frame, full-height travel-photo staging, keep the drawn traveler readable without cropping the head, feet, phone, or important landmark cues."
      : "Composition: horizontal 16:9 travel-photo frame, natural camera perspective, no collage, no model sheet, no UI.";

  return [
    "Style: realistic travel-location photography background with one fictional 2D hand-drawn illustrated traveler character integrated naturally into the scene.",
    storyCamComicVisualSafetyLine,
    "Background rule: photographic, real-world, destination-specific, natural light, real architecture and street texture; not comic, not anime, not painterly, not sketched, not a storyboard board.",
    "Character rule: hand-drawn illustrated traveler only; keep rough black pencil/marker lines, simple flat color, and the confirmed character outfit/design.",
    "Continuity: keep the traveler, props, destination, lighting, and mood consistent with the confirmed StoryCam references.",
    compositionLine,
    "No subtitles, no watermarks, no UI, no large text blocks, no readable copyrighted logos."
  ].join("\n");
}
