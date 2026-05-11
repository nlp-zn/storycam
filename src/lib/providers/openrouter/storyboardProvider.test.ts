import { describe, expect, it, vi } from "vitest";
import { createMockStoryWorldProvider } from "@/lib/providers/mock/storyWorldProvider";
import { buildOpenRouterStoryboardPrompt, createOpenRouterStoryboardProvider } from "./storyboardProvider";

vi.mock("server-only", () => ({}));

async function createStoryWorld() {
  const result = await createMockStoryWorldProvider().generate({
    idea: "我想把暗恋拍成韩剧雨夜",
    sessionId: "session-1"
  });

  if (!result.ok) {
    throw new Error("Expected mock story world fixture to be valid.");
  }

  return result.value;
}

describe("openrouter storyboard provider", () => {
  it("normalizes structured storyboard output into one 15 second MVP core group", async () => {
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        groups: [
          {
            emotionalTurn: "她终于抬头",
            mainImagePrompt: "Cinematic storyboard still, rainy convenience store, ordinary person looks up.",
            planSummary: "在屋檐下建立那句没发出去的话。",
            rhythm: "停住，点亮屏幕，抬头",
            storyPurpose: "让暗恋的迟疑变成可见动作。",
            title: "屋檐下的停顿",
            tone: "雨夜，克制"
          },
          {
            emotionalTurn: "两个人短暂同框",
            mainImagePrompt: "Cinematic storyboard still, glass reflection overlaps two ordinary people.",
            planSummary: "让错过发生在玻璃倒影里。",
            rhythm: "门铃，回头，错开",
            storyPurpose: "把靠近和错过放在同一个画面里。",
            title: "玻璃倒影",
            tone: "安静，遗憾"
          }
        ]
      }
    });
    const provider = createOpenRouterStoryboardProvider({
      apiKey: "openrouter-secret",
      generateObject,
      model: "deepseek/deepseek-v4-flash"
    });

    const result = await provider.generate({
      coreGroupTargetCount: 2,
      plannedDurationSeconds: 12,
      sessionId: "session-1",
      storyWorld: await createStoryWorld()
    });

    expect(result).toMatchObject({
      ok: true,
      providerKind: "text",
      providerName: "openrouter",
      value: {
        coreStoryboardGroups: [
          expect.objectContaining({ estimatedClipDurationSeconds: 15, title: "屋檐下的停顿" })
        ],
        storyboardScript: expect.objectContaining({ plannedDurationSeconds: 15 }),
        storyboardScripts: [
          expect.objectContaining({
            frames: expect.arrayContaining([
              expect.objectContaining({ beatType: "core", canvasPosition: "center", frameNumber: 1 }),
              expect.objectContaining({ canvasPosition: "bottom-right", frameNumber: 9 })
            ]),
            mainImagePrompt: expect.any(String),
            plannedDurationSeconds: 15
          })
        ]
      }
    });
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: "storycam_core_storyboard_plan",
        system: expect.stringContaining("核心分镜脚本师")
      })
    );
  });

  it("builds prompts with the single-group 15 second MVP target", async () => {
    const prompt = buildOpenRouterStoryboardPrompt({
      coreGroupTargetCount: 3,
      plannedDurationSeconds: 12,
      sessionId: "session-1",
      storyWorld: await createStoryWorld()
    });

    expect(prompt.prompt).toContain("目标核心分镜组数：1");
    expect(prompt.prompt).toContain("每组时长：约 15 秒");
    expect(prompt.prompt).toContain("总计划时长：约 15 秒");
    expect(prompt.prompt).toContain("frames 必须正好 9 帧");
    expect(prompt.prompt).toContain("visibleCharacterAssetIds");
    expect(prompt.prompt).toContain("每帧只能引用上方人物资产的 id");
    expect(prompt.system).toContain("山隐导演九列分镜");
  });

  it("keeps only confirmed visible character asset ids on storyboard frames", async () => {
    const storyWorld = await createStoryWorld();
    const knownCharacterId = storyWorld.characterAssets[0]?.id;
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        groups: [
          {
            emotionalTurn: "门开了",
            frames: [
              {
                beatType: "core",
                cameraAngle: "平视",
                canvasPosition: "center",
                durationSeconds: 3,
                frameNumber: 1,
                imagePrompt: "Stylized comic animation storyboard frame, only confirmed character assets visible.",
                narrativePurpose: "建立核心动作。",
                scene: "雨夜便利店门口",
                shotSize: "中景",
                sound: "门铃",
                technicalNotes: "保持角色资产一致。",
                timeRange: "00:00-00:03",
                title: "门口等待",
                visibleCharacterAssetIds: [knownCharacterId, "unlisted-owner"],
                visualContent: "主角看向门口。"
              },
              ...Array.from({ length: 8 }, (_, index) => ({
                beatType: "reaction",
                cameraAngle: "平视",
                canvasPosition: ["top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"][index],
                durationSeconds: 1.5,
                frameNumber: index + 2,
                imagePrompt: "Stylized comic animation storyboard frame, only confirmed character assets visible.",
                narrativePurpose: "补充动作。",
                scene: "雨夜便利店门口",
                shotSize: "近景",
                sound: "雨声",
                technicalNotes: "保持角色资产一致。",
                timeRange: `00:0${index + 3}-00:0${index + 4}`,
                title: `扩展 ${index + 2}`,
                ...(index === 0 ? { visibleCharacterAssetIds: [] } : {}),
                ...(index === 1 ? { visibleCharacterAssetIds: ["unlisted-owner"] } : {}),
                visualContent: "门口光线变化。"
              }))
            ],
            mainImagePrompt: "Stylized comic animation storyboard frame, only confirmed character assets visible.",
            planSummary: "等待门口的变化。",
            rhythm: "慢，停顿，轻微反应",
            storyPurpose: "让等待变成可见动作。",
            title: "门口等待",
            tone: "克制"
          }
        ]
      }
    });
    const provider = createOpenRouterStoryboardProvider({
      apiKey: "openrouter-secret",
      generateObject,
      model: "deepseek/deepseek-v4-flash"
    });

    const result = await provider.generate({
      plannedDurationSeconds: 15,
      sessionId: "session-1",
      storyWorld
    });

    expect(result.ok && result.value.storyboardScript.frames[0]?.visibleCharacterAssetIds).toEqual([knownCharacterId]);
    expect(result.ok && result.value.storyboardScript.frames[1]?.visibleCharacterAssetIds).toEqual([]);
    expect(result.ok && result.value.storyboardScript.frames[2]?.visibleCharacterAssetIds).toEqual([]);
    expect(result.ok && result.value.storyboardScript.frames[3]?.visibleCharacterAssetIds).toEqual(
      storyWorld.characterAssets.map((asset) => asset.id)
    );
  });
});
