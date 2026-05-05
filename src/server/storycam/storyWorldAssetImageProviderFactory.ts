import { createInferenceShImageProvider } from "@/lib/providers/inferenceSh/imageProvider";
import { createOpenRouterImageProvider } from "@/lib/providers/openrouter/imageProvider";
import type { ImageGenerationProvider } from "@/lib/providers/types";
import type { StoryCamConfig } from "@/server/config";
import type { StoryWorldAssetImageInput, StoryWorldAssetImageOutput } from "./storyWorldAssetImageService";

export function createConfiguredStoryWorldAssetImageProvider(
  config: StoryCamConfig
): ImageGenerationProvider<StoryWorldAssetImageInput, StoryWorldAssetImageOutput> | undefined {
  if (config.generation.imageProvider === "inference_sh") {
    if (!config.inferenceSh?.apiKey || !config.inferenceSh.imageApp) {
      return undefined;
    }

    return createInferenceShImageProvider<StoryWorldAssetImageInput>({
      apiKey: config.inferenceSh.apiKey,
      app: config.inferenceSh.imageApp,
      buildPrompt: (input) => ({
        ...buildStoryWorldAssetImagePrompt(input),
        height: 864,
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

    return createOpenRouterImageProvider<StoryWorldAssetImageInput>({
      apiKey: config.openrouter.apiKey,
      buildPrompt: buildStoryWorldAssetImagePrompt,
      maxAttempts: 2,
      model: config.openrouter.imageModel
    });
  }

  return undefined;
}

export function buildStoryWorldAssetImagePrompt(input: StoryWorldAssetImageInput) {
  const storyContext = input.script
    ? `Story title: ${input.script.title}. Logline: ${input.script.logline}. Summary: ${input.script.summary}.`
    : "Story context: private cinematic StoryCam memory.";
  const visualStyle = sharedVisualStyleForPrompt(input);

  if (input.assetKind === "character") {
    return {
      aspectRatio: "16:9" as const,
      prompt: [
        "Create a two-panel character design board for StoryCam, like a professional character production reference sheet.",
        storyContext,
        `Use the shared StoryCam visual style: ${visualStyle}.`,
        `Character name: ${input.asset.name}. Role: ${input.asset.role}.`,
        `Relationship to story: ${input.asset.relationshipToUserStory}.`,
        `Stable visual description: ${input.asset.stableVisualDescription}.`,
        `Emotional baseline: ${input.asset.emotionalBaseline}.`,
        input.asset.wardrobe ? `Wardrobe: ${input.asset.wardrobe}.` : "",
        input.asset.props.length ? `Props: ${input.asset.props.join(", ")}.` : "",
        input.asset.consistencyNotes.length ? `Consistency notes: ${input.asset.consistencyNotes.join("; ")}.` : "",
        "Composition: left 25-30% is a finished full-body action pose of the character on a clean floor shadow.",
        "Composition: right 70-75% is a detailed model sheet with front, side, and back turnaround views at consistent height.",
        "Add head, hair, and expression studies plus wardrobe, footwear, hand, and prop detail callouts around the turnaround.",
        "Use light pencil construction lines, simple measurement guides, and small nonessential annotation marks to feel like a professional character reference board.",
        "Keep the character asset style consistent with the shared visual style; it may be live-action realistic, cinematic, manga, animation, picture-book, filmic, or another style inferred from the story.",
        "Use a plain white or warm off-white studio background unless the shared visual style clearly requires another neutral production-board background.",
        "This is not a cinematic still, poster, close-up portrait, or UI mockup.",
        "No readable copyrighted logos, no watermarks, no large text blocks."
      ]
        .filter(Boolean)
        .join("\n")
    };
  }

  return {
    aspectRatio: "16:9" as const,
    prompt: [
      "Create one polished multi-panel environment-only asset board for StoryCam, like a professional background/location production reference sheet.",
      storyContext,
      `Use the shared StoryCam visual style: ${visualStyle}.`,
      `Scene name: ${input.asset.name}. Location: ${input.asset.location}. Time: ${input.asset.timeOfDay}.`,
      `Light: ${input.asset.light}. Atmosphere: ${input.asset.atmosphere}.`,
      `Key objects: ${input.asset.keyObjects.join(", ")}.`,
      `Spatial logic: ${input.asset.spatialLogic}.`,
      "Environment-only rule: no people, no humans, no human figures, no silhouettes, no reflections of people, no body parts, no character stand-ins, no crowds.",
      "If panel descriptions mention character actions, treat them only as blocking metadata; render empty space, object traces, lighting, framing, and places where characters could later be composited, but do not draw any person.",
      "Composition: one large establishing panel plus 4-6 smaller cut-in panels arranged as a clean contact sheet inside the same single image.",
      ...scenePanelsForPrompt(input).map(
        (panel, index) =>
          `Panel ${index + 1}: ${panel.title} (${panel.shotType}). Environment-only interpretation of source description: ${panel.description} Purpose: ${panel.purpose}. Key objects: ${panel.keyObjects.join(", ")}.`
      ),
      "All panels must belong to the same single location with consistent architecture, time of day, lighting continuity, and spatial logic.",
      "The smaller panels should cover environment angles, lighting, key objects, and action-space details required by the script.",
      "Keep the environment board style consistent with the shared visual style and with the character asset boards for this story.",
      "This is not a poster, standalone cinematic still, UI mockup, or collection of unrelated locations.",
      "No readable copyrighted logos, no UI, no watermarks, no large text blocks."
    ].join("\n")
  };
}

function sharedVisualStyleForPrompt(input: StoryWorldAssetImageInput) {
  const explicitStyle = input.script?.visualStyle?.trim();

  if (explicitStyle) {
    return explicitStyle;
  }

  const source = [
    input.script?.title,
    input.script?.logline,
    input.script?.summary,
    input.assetKind === "character" ? input.asset.stableVisualDescription : undefined,
    ...(input.characterAssets ?? []).map((asset) => `${asset.stableVisualDescription} ${asset.wardrobe ?? ""}`)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(漫画|动漫|动画|二次元|anime|manga|comic)/i.test(source)) {
    return "漫画/动画设定稿风格，干净线条，低饱和色彩，情绪克制";
  }

  if (/(绘本|童话|storybook|picture book)/i.test(source)) {
    return "绘本式视觉风格，柔和纸感，温暖色彩，适合私人记忆";
  }

  if (/(胶片|复古|film|retro|vintage)/i.test(source)) {
    return "复古胶片电影感，柔和颗粒，低对比光影，私人回忆质感";
  }

  return "写实电影感，普通人质感，克制表演，低饱和色彩和自然光线";
}

function scenePanelsForPrompt(input: Extract<StoryWorldAssetImageInput, { assetKind: "scene" }>) {
  if (input.asset.scenePanels.length) {
    return input.asset.scenePanels;
  }

  const keyObjects = input.asset.keyObjects.length ? input.asset.keyObjects : ["主空间", "关键物件", "光线"];
  const beats = input.script?.beats.length ? input.script.beats : [input.asset.spatialLogic];

  return [
    {
      description: `${input.asset.location} 的完整空间关系，预留角色后续入画和离开的空场动线。`,
      keyObjects: keyObjects.slice(0, 3),
      purpose: "建立故事发生的主场景。",
      shotType: "establishing" as const,
      title: input.asset.name
    },
    {
      description: input.asset.light,
      keyObjects: keyObjects.slice(0, 3),
      purpose: "固定整组场景的光线基调。",
      shotType: "lighting" as const,
      title: "光线关系"
    },
    {
      description: keyObjects.join("、"),
      keyObjects,
      purpose: "明确后续分镜需要反复保持一致的关键物件。",
      shotType: "detail" as const,
      title: "关键物件"
    },
    {
      description: beats[0] ?? input.asset.spatialLogic,
      keyObjects: keyObjects.slice(0, 3),
      purpose: "为后续角色入画预留空的动作空间。",
      shotType: "medium" as const,
      title: "动作空间"
    }
  ];
}
