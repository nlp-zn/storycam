import { createOpenRouterImageProvider } from "@/lib/providers/openrouter/imageProvider";
import type { ImageGenerationProvider } from "@/lib/providers/types";
import type { StoryCamConfig } from "@/server/config";
import type { StoryWorldAssetImageInput, StoryWorldAssetImageOutput } from "./storyWorldAssetImageService";

export function createConfiguredStoryWorldAssetImageProvider(
  config: StoryCamConfig
): ImageGenerationProvider<StoryWorldAssetImageInput, StoryWorldAssetImageOutput> | undefined {
  if (config.generation.imageProvider !== "openrouter") {
    return undefined;
  }

  return createOpenRouterImageProvider<StoryWorldAssetImageInput>({
    apiKey: config.openrouter?.apiKey ?? "",
    buildPrompt: buildStoryWorldAssetImagePrompt,
    maxAttempts: 2,
    model: config.openrouter?.imageModel ?? ""
  });
}

export function buildStoryWorldAssetImagePrompt(input: StoryWorldAssetImageInput) {
  const storyContext = input.script
    ? `Story title: ${input.script.title}. Logline: ${input.script.logline}. Summary: ${input.script.summary}.`
    : "Story context: private cinematic StoryCam memory.";

  if (input.assetKind === "character") {
    return {
      aspectRatio: "16:9" as const,
      prompt: [
        "Create a polished cinematic character asset sheet for StoryCam.",
        storyContext,
        `Character name: ${input.asset.name}. Role: ${input.asset.role}.`,
        `Relationship to story: ${input.asset.relationshipToUserStory}.`,
        `Stable visual description: ${input.asset.stableVisualDescription}.`,
        `Emotional baseline: ${input.asset.emotionalBaseline}.`,
        input.asset.wardrobe ? `Wardrobe: ${input.asset.wardrobe}.` : "",
        input.asset.props.length ? `Props: ${input.asset.props.join(", ")}.` : "",
        input.asset.consistencyNotes.length ? `Consistency notes: ${input.asset.consistencyNotes.join("; ")}.` : "",
        "Composition: left side full-body character render, right side clean model sheet with front, side, back views and small detail callouts.",
        "Style: refined cinematic concept art, grounded realistic proportions, clean studio background, production design reference sheet.",
        "No readable copyrighted logos, no UI, no watermarks, no extra text blocks."
      ]
        .filter(Boolean)
        .join("\n")
    };
  }

  return {
    aspectRatio: "16:9" as const,
    prompt: [
      "Create a polished cinematic environment asset board for StoryCam.",
      storyContext,
      `Scene name: ${input.asset.name}. Location: ${input.asset.location}. Time: ${input.asset.timeOfDay}.`,
      `Light: ${input.asset.light}. Atmosphere: ${input.asset.atmosphere}.`,
      `Key objects: ${input.asset.keyObjects.join(", ")}.`,
      `Spatial logic: ${input.asset.spatialLogic}.`,
      "Composition: one large establishing environment image plus three smaller detail panels showing lighting, key object, and alternate angle.",
      "Style: cinematic production design board, grounded realistic space, strong lighting continuity, private memory mood.",
      "No readable copyrighted logos, no UI, no watermarks, no extra text blocks."
    ].join("\n")
  };
}
