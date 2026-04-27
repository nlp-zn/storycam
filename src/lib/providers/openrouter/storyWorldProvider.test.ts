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
      spatialLogic: "她在门外低头删短信，他从店里出来，倒影在玻璃上短暂重叠",
      timeOfDay: "night"
    }
  ],
  script: {
    beats: ["她在雨声里删掉短信", "便利店门铃响起", "两人的倒影短暂重叠"],
    logline: "她在雨夜便利店门口，把一条没有发出的告白短信删了又写。",
    summary: "冷白灯、雨水和玻璃反光让两个人短暂同框，故事停在没有说出口的那一秒。",
    title: "雨夜未发送"
  }
};

describe("openrouter story world provider", () => {
  it("generates schema-valid StoryCam story world artifacts from a user idea and lightweight choices", async () => {
    const generateObject = vi.fn().mockResolvedValue({ object: storyWorldDraft });
    const provider = createOpenRouterStoryWorldProvider({
      apiKey: "openrouter-secret",
      generateObject,
      model: "deepseek/deepseek-v4-pro"
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
            sessionId: "session-1"
          })
        ],
        script: expect.objectContaining({
          id: "script-session-1",
          sessionId: "session-1",
          title: "雨夜未发送"
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
      model: "deepseek/deepseek-v4-pro"
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
    expect(prompt.prompt).not.toContain("private.jpg");
    expect(prompt.prompt).not.toContain("storycam-uploads");
  });
});
