import { describe, expect, it, vi } from "vitest";
import { buildDeepSeekStoryWorldRequest, createDeepSeekStoryWorldProvider } from "./storyWorldProvider";

const storyWorldArguments = {
  characterAssets: [
    {
      consistencyNotes: ["手机始终握在右手", "不做夸张哭戏"],
      emotionalBaseline: "克制、犹豫，用停顿和小动作表达情绪。",
      name: "她",
      props: ["手机", "透明伞"],
      relationshipToUserStory: "承载那段没有说出口的暗恋记忆。",
      role: "暗恋者",
      stableVisualDescription: "二十多岁的普通女生，浅色风衣，手里握着手机和透明伞。",
      wardrobe: "浅色风衣、白色帆布鞋。"
    }
  ],
  sceneAssets: [
    {
      atmosphere: "潮湿、安静、带一点遗憾。",
      keyObjects: ["便利店玻璃门", "透明伞", "手机屏幕"],
      light: "冷白便利店灯混合暖色街灯。",
      location: "雨夜街角便利店门口",
      name: "便利店外的玻璃反光",
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
      spatialLogic: "她站在门外屋檐下，对方从店内出来，玻璃门让两人的倒影短暂重叠。",
      timeOfDay: "night"
    }
  ],
  script: {
    beats: ["她站在屋檐下看着未发送短信。"],
    logline: "她在雨夜便利店门口，把一条没有发出的告白短信删了又写。",
    summary: "便利店冷白灯、雨水和玻璃反光让两个人短暂同框，故事停在没有说出口的一秒。",
    title: "雨夜未发送",
    visualStyle: "写实韩剧电影感，雨夜冷暖混合光，低饱和色彩"
  }
};

describe("deepseek story world provider", () => {
  it("generates schema-valid StoryCam story world artifacts from strict tool call arguments", async () => {
    const fetchDeepSeek = vi.fn().mockResolvedValue(
      deepSeekResponse({
        toolArguments: JSON.stringify(storyWorldArguments)
      })
    );
    const provider = createDeepSeekStoryWorldProvider({
      apiKey: "deepseek-secret",
      fetchDeepSeek,
      model: "deepseek-v4-pro"
    });

    const result = await provider.generate({
      idea: "我想把暗恋拍成韩剧雨夜",
      lightweightChoices: ["像私人回忆", "少说话"],
      sessionId: "session-1",
      uploadedPhotoRefs: [{ mediaAssetId: "photo-1", storagePath: "users/user-1/private.jpg" }]
    });

    expect(result).toMatchObject({
      ok: true,
      providerKind: "text",
      providerName: "deepseek",
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
    expect(fetchDeepSeek).toHaveBeenCalledWith(
      "https://api.deepseek.com/beta/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining("submit_story_world"),
        headers: expect.objectContaining({
          authorization: "Bearer deepseek-secret"
        }),
        method: "POST"
      })
    );
    expect(JSON.stringify(fetchDeepSeek.mock.calls)).not.toContain("private.jpg");
  });

  it("returns a redacted provider failure when DeepSeek omits the required tool call", async () => {
    const provider = createDeepSeekStoryWorldProvider({
      apiKey: "deepseek-secret",
      fetchDeepSeek: vi.fn().mockResolvedValue(deepSeekResponse({ message: { content: "{}" } })),
      model: "deepseek-v4-pro"
    });

    const result = await provider.generate({
      idea: "bad tool output",
      sessionId: "session-1"
    });

    expect(result).toMatchObject({
      errorCode: "DEEPSEEK_TOOL_CALL_MISSING",
      ok: false,
      providerKind: "text",
      providerName: "deepseek",
      redactionApplied: true,
      retryable: true
    });
  });

  it("returns a redacted provider failure when tool arguments are not JSON", async () => {
    const provider = createDeepSeekStoryWorldProvider({
      apiKey: "deepseek-secret",
      fetchDeepSeek: vi.fn().mockResolvedValue(deepSeekResponse({ toolArguments: "not-json" })),
      model: "deepseek-v4-pro"
    });

    const result = await provider.generate({
      idea: "bad json",
      sessionId: "session-1"
    });

    expect(result).toMatchObject({
      errorCode: "DEEPSEEK_TOOL_ARGUMENTS_INVALID_JSON",
      ok: false,
      redactionApplied: true,
      retryable: true
    });
  });

  it("returns a redacted provider failure when arguments fail the StoryCam draft schema", async () => {
    const provider = createDeepSeekStoryWorldProvider({
      apiKey: "deepseek-secret",
      fetchDeepSeek: vi.fn().mockResolvedValue(
        deepSeekResponse({
          toolArguments: JSON.stringify({
            characterAssets: [],
            sceneAssets: [],
            script: {
              title: "bad"
            }
          })
        })
      ),
      model: "deepseek-v4-pro"
    });

    const result = await provider.generate({
      idea: "schema failure",
      sessionId: "session-1"
    });

    expect(result).toMatchObject({
      errorCode: "DEEPSEEK_STORY_WORLD_INVALID_OUTPUT",
      ok: false,
      redactionApplied: true,
      retryable: true
    });
  });

  it("returns a redacted provider failure when the required scene panels are missing", async () => {
    const { scenePanels: _scenePanels, ...sceneWithoutPanels } = storyWorldArguments.sceneAssets[0];
    const provider = createDeepSeekStoryWorldProvider({
      apiKey: "deepseek-secret",
      fetchDeepSeek: vi.fn().mockResolvedValue(
        deepSeekResponse({
          toolArguments: JSON.stringify({
            ...storyWorldArguments,
            sceneAssets: [sceneWithoutPanels]
          })
        })
      ),
      model: "deepseek-v4-pro"
    });

    const result = await provider.generate({
      idea: "missing panels",
      sessionId: "session-1"
    });

    expect(result).toMatchObject({
      errorCode: "DEEPSEEK_STORY_WORLD_INVALID_OUTPUT",
      ok: false,
      redactionApplied: true
    });
  });

  it("returns a redacted provider failure when more than one scene asset is returned", async () => {
    const provider = createDeepSeekStoryWorldProvider({
      apiKey: "deepseek-secret",
      fetchDeepSeek: vi.fn().mockResolvedValue(
        deepSeekResponse({
          toolArguments: JSON.stringify({
            ...storyWorldArguments,
            sceneAssets: [storyWorldArguments.sceneAssets[0], storyWorldArguments.sceneAssets[0]]
          })
        })
      ),
      model: "deepseek-v4-pro"
    });

    const result = await provider.generate({
      idea: "too many scenes",
      sessionId: "session-1"
    });

    expect(result).toMatchObject({
      errorCode: "DEEPSEEK_STORY_WORLD_INVALID_OUTPUT",
      ok: false,
      redactionApplied: true
    });
  });

  it("falls back to the configured flash model after a primary provider failure", async () => {
    const fetchDeepSeek = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream failed", { status: 503 }))
      .mockResolvedValueOnce(deepSeekResponse({ toolArguments: JSON.stringify(storyWorldArguments) }));
    const provider = createDeepSeekStoryWorldProvider({
      apiKey: "deepseek-secret",
      fallbackModels: ["deepseek-v4-flash"],
      fetchDeepSeek,
      model: "deepseek-v4-pro"
    });

    const result = await provider.generate({
      idea: "fallback please",
      sessionId: "session-1"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        script: expect.objectContaining({ title: "雨夜未发送" })
      }
    });
    expect(fetchDeepSeek).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchDeepSeek.mock.calls[0]?.[1]?.body))).toMatchObject({ model: "deepseek-v4-pro" });
    expect(JSON.parse(String(fetchDeepSeek.mock.calls[1]?.[1]?.body))).toMatchObject({ model: "deepseek-v4-flash" });
  });

  it("builds strict tool-call requests without leaking uploaded storage paths", () => {
    const request = buildDeepSeekStoryWorldRequest({
      input: {
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
      },
      model: "deepseek-v4-pro"
    });

    expect(request.model).toBe("deepseek-v4-pro");
    expect(request.thinking).toEqual({ type: "disabled" });
    expect(request.tool_choice).toEqual({
      function: { name: "submit_story_world" },
      type: "function"
    });
    expect(request.tools[0]?.function.strict).toBe(true);
    expect(containsUnsupportedDeepSeekStrictSchemaKeyword(request.tools[0]?.function.parameters)).toBe(false);
    expect(JSON.stringify(request)).toContain("photo-1");
    expect(JSON.stringify(request)).toContain("script.visualStyle");
    expect(JSON.stringify(request)).toContain("不是分镜拆解阶段");
    expect(JSON.stringify(request)).toContain("script.beats 是剧情节点");
    expect(JSON.stringify(request)).toContain("不是镜头列表");
    expect(JSON.stringify(request)).toContain("不要写可见人物");
    expect(JSON.stringify(request)).not.toContain("private.jpg");
    expect(JSON.stringify(request)).not.toContain("storycam-uploads");
  });
});

function containsUnsupportedDeepSeekStrictSchemaKeyword(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsUnsupportedDeepSeekStrictSchemaKeyword);
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  if ("minItems" in value || "maxItems" in value) {
    return true;
  }

  return Object.values(value).some(containsUnsupportedDeepSeekStrictSchemaKeyword);
}

function deepSeekResponse(input: {
  message?: Record<string, unknown>;
  toolArguments?: string;
}) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: input.toolArguments ? "tool_calls" : "stop",
          message: input.message ?? {
            content: "",
            role: "assistant",
            tool_calls: [
              {
                function: {
                  arguments: input.toolArguments,
                  name: "submit_story_world"
                },
                id: "call-story-world-1",
                type: "function"
              }
            ]
          }
        }
      ],
      id: "chatcmpl-test"
    }),
    {
      headers: { "content-type": "application/json" },
      status: 200
    }
  );
}
