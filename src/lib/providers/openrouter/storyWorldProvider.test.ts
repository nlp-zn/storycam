import { describe, expect, it, vi } from "vitest";
import { buildOpenRouterStoryWorldPrompt, createOpenRouterStoryWorldProvider } from "./storyWorldProvider";

vi.mock("server-only", () => ({}));

const storyWorldDraft = {
  characterAssets: [
    {
      consistencyNotes: ["始终把手机握在掌心，不做夸张哭戏"],
      emotionalBaseline: "克制、犹豫，用停顿和回避表达情绪",
      name: "她",
      props: ["手机", "透明伞"],
      relationshipToUserStory: "承载那段没有说出口的暗恋记忆",
      role: "暗恋者",
      stableVisualDescription: "湿发贴在脸侧，浅色风衣，手指反复点亮手机屏幕",
      wardrobe: "浅色风衣、低饱和围巾"
    }
  ],
  sceneAssets: [
    {
      atmosphere: "潮湿、安静、带一点遗憾",
      keyObjects: ["便利店玻璃门", "伞面雨滴", "手机屏幕"],
      light: "冷白便利店灯混合暖色街灯",
      location: "雨夜街角便利店门口",
      name: "便利店外的玻璃反光",
      scenePanels: scenePanels(),
      spatialLogic: "她在门外低头删短信，他从店里出来，倒影在玻璃上短暂重叠",
      timeOfDay: "night"
    }
  ],
  script: {
    beats: ["她在雨声里删掉短信", "便利店门铃响起", "两人的倒影短暂重叠"],
    logline: "她在雨夜便利店门口，把一条没有发出的告白短信删了又写。",
    summary: "冷白灯、雨水和玻璃反光让两个人短暂同框，故事停在没有说出口的那一秒。",
    title: "雨夜未发送",
    visualStyle: "写实韩剧电影感，雨夜冷暖混合光，低饱和色彩"
  }
};

describe("openrouter story world provider", () => {
  it("generates schema-valid StoryCam story world artifacts from a user idea and lightweight choices", async () => {
    const generateObject = vi.fn().mockResolvedValue({ object: storyWorldDraft });
    const provider = createOpenRouterStoryWorldProvider({
      apiKey: "openrouter-secret",
      generateObject,
      model: "deepseek/deepseek-v4-flash"
    });

    const result = await provider.generate({
      idea: "我想把暗恋拍成韩剧雨夜",
      lightweightChoices: ["更遗憾一点", "像私人回忆"],
      sessionId: "session-1",
      uploadedPhotoRefs: [{ mediaAssetId: "photo-1" }]
    });

    expect(result).toMatchObject({
      ok: true,
      providerKind: "text",
      providerName: "openrouter",
      value: {
        characterAssets: [
          expect.objectContaining({
            id: "character-session-1-1",
            referenceMediaIds: ["photo-1"],
            sessionId: "session-1"
          })
        ],
        sceneAssets: [
          expect.objectContaining({
            id: "scene-session-1-1",
            referenceMediaIds: ["photo-1"],
            scenePanels: expect.arrayContaining([
              expect.objectContaining({
                shotType: "establishing",
                title: "便利店外景"
              })
            ]),
            sessionId: "session-1"
          })
        ],
        script: expect.objectContaining({
          id: "script-session-1",
          sessionId: "session-1",
          title: "雨夜未发送",
          visualStyle: expect.stringContaining("漫画电影/动画分镜风格")
        })
      }
    });
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("我想把暗恋拍成韩剧雨夜"),
        schemaDescription: expect.stringContaining("StoryCam story world draft"),
        schemaName: "storycam_story_world_draft",
        system: expect.stringContaining("私人故事剧本整理器")
      })
    );
  });

  it("retries provider failures and returns a redacted provider failure", async () => {
    const generateObject = vi.fn().mockRejectedValue(new Error("provider failed with openrouter-secret and full prompt"));
    const provider = createOpenRouterStoryWorldProvider({
      apiKey: "openrouter-secret",
      generateObject,
      model: "deepseek/deepseek-v4-flash"
    });

    const result = await provider.generate({
      idea: "bad output please",
      sessionId: "session-1"
    });

    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      errorCode: "OPENROUTER_TEXT_INVALID_OUTPUT",
      ok: false,
      providerKind: "text",
      providerName: "openrouter",
      redactionApplied: true,
      retryable: true
    });
    expect(JSON.stringify(result)).not.toContain("openrouter-secret");
    expect(JSON.stringify(result)).not.toContain("full prompt");
  });

  it("normalizes a story-world draft when the model omits the script object", async () => {
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        characterAssets: [],
        sceneAssets: []
      }
    });
    const provider = createOpenRouterStoryWorldProvider({
      apiKey: "openrouter-secret",
      generateObject,
      model: "deepseek/deepseek-v4-flash"
    });

    const result = await provider.generate({
      idea: "我想把雨夜错过的人拍成短片",
      sessionId: "session-1"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        characterAssets: [expect.objectContaining({ name: "主角" })],
        sceneAssets: [
          expect.objectContaining({
            name: "故事发生的地方",
            scenePanels: expect.arrayContaining([expect.objectContaining({ shotType: "establishing" })])
          })
        ],
        script: expect.objectContaining({
          logline: "我想把雨夜错过的人拍成短片",
          title: "私人短片",
          visualStyle: expect.stringContaining("漫画电影/动画分镜风格")
        })
      }
    });
  });

  it("builds prompts from text and lightweight choices without leaking uploaded storage paths", () => {
    const prompt = buildOpenRouterStoryWorldPrompt({
      idea: "把旧照片里的毕业告别拍成短片",
      lightweightChoices: ["少说话"],
      sessionId: "session-1",
      uploadedPhotoRefs: [
        {
          mediaAssetId: "photo-1",
          storageBucket: "storycam-uploads",
          storagePath: "users/user-1/sessions/session-1/uploads/private.jpg"
        }
      ]
    });

    expect(prompt.prompt).toContain("把旧照片里的毕业告别拍成短片");
    expect(prompt.prompt).toContain("少说话");
    expect(prompt.prompt).toContain("photo-1");
    expect(prompt.prompt).toContain("不是分镜拆解阶段");
    expect(prompt.prompt).toContain("script.beats 是剧情节点");
    expect(prompt.prompt).toContain("不是镜头列表");
    expect(prompt.prompt).toContain("场景资产必须且只能生成 1 个");
    expect(prompt.prompt).toContain("script.visualStyle");
    expect(prompt.prompt).toContain("scenePanels 生成 4-6 个小切图描述");
    expect(prompt.prompt).toContain("不要写可见人物");
    expect(prompt.system).toContain("beats 是剧情节点，不是分镜");
    expect(prompt.prompt).not.toContain("private.jpg");
    expect(prompt.prompt).not.toContain("storycam-uploads");
  });
});

function scenePanels() {
  return [
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
  ];
}
