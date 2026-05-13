import { describe, expect, it, vi } from "vitest";
import {
  buildStoryWorldAssetImagePrompt,
  createConfiguredStoryWorldAssetImageProvider
} from "./storyWorldAssetImageProviderFactory";
import type { CharacterAsset, SceneAsset, StoryScript } from "@/features/storycam/domain/artifacts";
import type { StoryCamConfig } from "@/server/config";

vi.mock("server-only", () => ({}));

describe("story-world asset image prompt", () => {
  it("selects Inference.sh when configured as the story-world image provider", () => {
    const provider = createConfiguredStoryWorldAssetImageProvider({
      generation: {
        finalWorkProvider: "mock",
        imageProvider: "inference_sh",
        mode: "mock",
        multimodalProvider: "mock",
        textProvider: "mock",
        videoProvider: "mock"
      },
      inferenceSh: {
        apiKey: "inference-key",
        imageApp: "openai/gpt-image-2"
      },
      media: {
        providerReferenceSignedUrlTtlSeconds: 3600
      },
      supabase: {
        anonKey: "anon-key",
        serviceRoleKey: "service-role-key",
        url: "https://storycam.example.supabase.co"
      }
    } satisfies StoryCamConfig);

    expect(provider?.providerName).toBe("inference_sh");
  });

  it("asks character generation for a finished pose plus a detailed model sheet board", () => {
    const prompt = buildStoryWorldAssetImagePrompt({
      asset: characterAsset(),
      assetArtifactId: "character-1",
      assetKind: "character",
      aspectRatio: "16:9",
      script: storyScript(),
      sessionId: "session-1"
    });

    expect(prompt.aspectRatio).toBe("16:9");
    expect(prompt.prompt).toContain("two-panel character design board");
    expect(prompt.prompt).toContain("finished full-body action pose");
    expect(prompt.prompt).toContain("front, side, and back turnaround");
    expect(prompt.prompt).toContain("head, hair, and expression studies");
    expect(prompt.prompt).toContain("wardrobe, footwear, hand, and prop detail callouts");
    expect(prompt.prompt).toContain("Use the shared StoryCam visual style: 漫画电影/动画分镜风格");
    expect(prompt.prompt).toContain("not photorealistic people");
    expect(prompt.prompt).toContain("plain white or warm off-white studio background");
  });

  it("uses style and uploaded photo references for handdrawn travel characters", () => {
    const prompt = buildStoryWorldAssetImagePrompt({
      asset: {
        ...characterAsset(),
        referenceMediaIds: ["photo-1"],
        relationshipToUserStory: "由用户照片转译出的手绘旅行主角"
      },
      assetArtifactId: "character-1",
      assetKind: "character",
      aspectRatio: "9:16",
      referenceImages: [
        {
          kind: "style_reference",
          mediaId: "storycam-handdrawn-travel-character-style",
          signedUrl: "data:image/jpeg;base64,c3R5bGU="
        },
        {
          kind: "uploaded_photo",
          mediaId: "photo-1",
          signedUrl: "https://storycam.example/uploads/photo.jpg"
        }
      ],
      script: {
        ...storyScript(),
        storyModeId: "handdrawn-travel-vlog",
        visualStyle: "手绘角色叠加真实旅行地摄影感背景"
      },
      sessionId: "session-1"
    });

    expect(prompt.images).toEqual(["data:image/jpeg;base64,c3R5bGU=", "https://storycam.example/uploads/photo.jpg"]);
    expect(prompt.prompt).toContain("根据 Image 1 的简单粗硬画笔画风");
    expect(prompt.prompt).toContain("绘制 Image 2 中人物转译后的全身手绘旅行角色");
    expect(prompt.prompt).toContain("Image 1 只用于简单粗硬黑色线条");
    expect(prompt.prompt).toContain("Image 2 如存在，只用于发型、眼镜、衣着轮廓、姿态和旅行气质");
    expect(prompt.prompt).toContain("不要真人复刻");
  });

  it("asks scene generation for one multi-panel environment asset board from scene panels", () => {
    const prompt = buildStoryWorldAssetImagePrompt({
      asset: sceneAsset(),
      assetArtifactId: "scene-1",
      assetKind: "scene",
      aspectRatio: "16:9",
      script: storyScript(),
      sessionId: "session-1"
    });

    expect(prompt.aspectRatio).toBe("16:9");
    expect(prompt.prompt).toContain("multi-panel environment-only asset board");
    expect(prompt.prompt).toContain("one large establishing panel");
    expect(prompt.prompt).toContain("4-6 smaller cut-in panels");
    expect(prompt.prompt).toContain("Panel 1: 便利店外景");
    expect(prompt.prompt).toContain("Panel 4: 灯光反射");
    expect(prompt.prompt).toContain("All panels must belong to the same single location");
    expect(prompt.prompt).toContain("Use the shared StoryCam visual style: 漫画电影/动画分镜风格");
    expect(prompt.prompt).toContain("no people");
    expect(prompt.prompt).toContain("no silhouettes");
    expect(prompt.prompt).toContain("no reflections of people");
    expect(prompt.prompt).toContain("no body parts");
    expect(prompt.prompt).not.toContain("grounded realistic space");
  });

  it("turns handdrawn travel scenes into a real destination route board without people", () => {
    const prompt = buildStoryWorldAssetImagePrompt({
      asset: {
        ...sceneAsset(),
        location: "葡萄牙里斯本阿尔法玛",
        name: "里斯本阿尔法玛旅行路线"
      },
      assetArtifactId: "scene-1",
      assetKind: "scene",
      aspectRatio: "9:16",
      script: {
        ...storyScript(),
        storyModeId: "handdrawn-travel-vlog",
        visualStyle: "手绘角色叠加真实旅行地摄影感背景"
      },
      sessionId: "session-1"
    });

    expect(prompt.aspectRatio).toBe("9:16");
    expect(prompt.prompt).toContain("vertical 9:16 portrait asset board");
    expect(prompt.prompt).toContain("not a horizontal 16:9 canvas");
    expect(prompt.prompt).toContain("real travel destination route board");
    expect(prompt.prompt).toContain("photographic travel-location background reference");
    expect(prompt.prompt).toContain("Scene visual style: real travel-location photography background reference");
    expect(prompt.prompt).toContain("Do not cartoonize, illustrate, sketch, paint, or turn the destination into comic/anime style");
    expect(prompt.prompt).toContain("Keep every environment panel photographic, real-world, destination-specific");
    expect(prompt.prompt).toContain("葡萄牙里斯本阿尔法玛");
    expect(prompt.prompt).toContain("Environment-only rule: no people");
    expect(prompt.prompt).not.toContain("Use the shared StoryCam visual style: 手绘角色叠加真实旅行地摄影感背景");
  });

  it("falls back to an inferred shared visual style for older scripts", () => {
    const { visualStyle: _visualStyle, ...oldScript } = storyScript();
    const prompt = buildStoryWorldAssetImagePrompt({
      asset: sceneAsset(),
      assetArtifactId: "scene-1",
      assetKind: "scene",
      aspectRatio: "16:9",
      characterAssets: [characterAsset()],
      script: oldScript,
      sessionId: "session-1"
    });

    expect(prompt.prompt).toContain("Use the shared StoryCam visual style: 漫画电影/动画分镜风格");
  });
});

function characterAsset(): CharacterAsset {
  return {
    consistencyNotes: ["黑色短发保持湿润凌乱", "透明长柄伞始终在右手"],
    emotionalBaseline: "克制、紧张",
    id: "character-1",
    name: "我",
    props: ["透明长柄伞"],
    referenceMediaIds: [],
    relationshipToUserStory: "承载雨夜暗恋的第一视角",
    role: "主角",
    sessionId: "session-1",
    stableVisualDescription: "一个穿深蓝色校服外套的年轻人，黑色短发被雨打湿",
    state: "ready",
    version: 1,
    wardrobe: "深蓝色校服外套"
  };
}

function storyScript(): StoryScript {
  return {
    beats: ["雨夜便利店屋檐下，主角停住脚步。"],
    id: "script-1",
    logline: "雨夜里，一个没说出口的暗恋故事。",
    qualityChecks: [],
    sessionId: "session-1",
    state: "ready",
    summary: "主角在雨夜便利店屋檐下看见街对面的人，握紧透明伞。",
    title: "雨夜暗恋",
    version: 1,
    visualStyle: "写实韩剧电影感，雨夜冷暖混合光，低饱和色彩"
  };
}

function sceneAsset(): SceneAsset {
  return {
    atmosphere: "潮湿、安静、私人回忆感",
    id: "scene-1",
    keyObjects: ["便利店玻璃门", "伞面雨滴", "手机屏幕"],
    light: "冷白便利店灯混合暖色街灯",
    location: "雨夜街角便利店门口",
    name: "便利店外的玻璃反光",
    referenceMediaIds: [],
    scenePanels: [
      {
        description: "雨夜街角便利店门口，屋檐、玻璃门和街灯在同一个空间中。",
        keyObjects: ["便利店玻璃门", "屋檐", "街灯"],
        purpose: "建立整个故事发生的主场景。",
        shotType: "establishing",
        title: "便利店外景"
      },
      {
        description: "玻璃门上留出两道可供角色后续入画的冷白反光区域。",
        keyObjects: ["玻璃门", "冷白反光"],
        purpose: "预留两人靠近但没有真正相认的空间关系。",
        shotType: "medium",
        title: "玻璃倒影"
      },
      {
        description: "手机屏幕放在便利店窗边，停在未发送短信界面，雨滴落在玻璃边缘。",
        keyObjects: ["手机屏幕", "雨滴", "窗边"],
        purpose: "把暗恋情绪落到可见物件上。",
        shotType: "detail",
        title: "未发送短信"
      },
      {
        description: "冷白便利店灯和暖色街灯在湿地面上反光。",
        keyObjects: ["便利店灯", "街灯", "湿地面"],
        purpose: "固定整段短片的光线质感。",
        shotType: "lighting",
        title: "灯光反射"
      }
    ],
    sessionId: "session-1",
    spatialLogic: "她在门外低头删短信，他从店里出来，倒影在玻璃上短暂重叠",
    state: "ready",
    timeOfDay: "night",
    version: 1
  };
}
