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
    expect(prompt.system).toContain("山隐导演九列分镜");
  });
});
