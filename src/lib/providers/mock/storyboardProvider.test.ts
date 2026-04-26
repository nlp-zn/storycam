import { describe, expect, it } from "vitest";
import { createMockStoryWorldProvider } from "./storyWorldProvider";
import { createMockStoryboardProvider } from "./storyboardProvider";

async function createStoryWorld() {
  const storyWorld = await createMockStoryWorldProvider().generate({
    idea: "暗恋韩剧雨夜",
    sessionId: "session-1"
  });

  if (!storyWorld.ok) {
    throw new Error("Expected mock story world fixture to be valid.");
  }

  return storyWorld.value;
}

describe("mock storyboard provider", () => {
  it("creates 1-3 core groups from the duration plan", async () => {
    const provider = createMockStoryboardProvider();
    const storyWorld = await createStoryWorld();

    await expect(
      provider.generate({
        plannedDurationSeconds: 9,
        sessionId: "session-1",
        storyWorld
      })
    ).resolves.toMatchObject({
      ok: true,
      value: {
        coreStoryboardGroups: [{ estimatedClipDurationSeconds: 9 }]
      }
    });
    await expect(
      provider.generate({
        plannedDurationSeconds: 14,
        sessionId: "session-1",
        storyWorld
      })
    ).resolves.toMatchObject({
      ok: true,
      value: {
        coreStoryboardGroups: [{ estimatedClipDurationSeconds: 4.7 }, {}, {}]
      }
    });
  });

  it("includes title, story purpose, duration, scene, and characters in each group", async () => {
    const result = await createMockStoryboardProvider().generate({
      durationPreset: "medium",
      plannedDurationSeconds: 12,
      sessionId: "session-1",
      storyWorld: await createStoryWorld()
    });

    expect(result.ok && result.value.coreStoryboardGroups).toHaveLength(2);
    expect(result.ok && result.value.coreStoryboardGroups[0]).toMatchObject({
      characterAssetIds: ["character-rainy-crush-lead"],
      estimatedClipDurationSeconds: 6,
      sceneAssetId: "scene-rainy-convenience-store",
      storyPurpose: expect.any(String),
      title: "未发送的短信"
    });
  });

  it("generates three expansion cards by default and caps requested cards at eight", async () => {
    const provider = createMockStoryboardProvider();
    const storyWorld = await createStoryWorld();

    const defaultResult = await provider.generate({
      plannedDurationSeconds: 12,
      sessionId: "session-1",
      storyWorld
    });
    const cappedResult = await provider.generate({
      expansionCardTargetCount: 20,
      plannedDurationSeconds: 12,
      sessionId: "session-1",
      storyWorld
    });

    expect(defaultResult.ok && defaultResult.value.expandedStoryboardCards).toHaveLength(3);
    expect(cappedResult.ok && cappedResult.value.expandedStoryboardCards).toHaveLength(8);
    expect(defaultResult.ok && defaultResult.value.expandedStoryboardCards[0]).toMatchObject({
      beatType: "enter",
      coreGroupId: "core-group-rainy-kdrama-1",
      sortOrder: 0
    });
  });

  it("returns a redacted provider failure for malformed story world input", async () => {
    const result = await createMockStoryboardProvider().generate({
      plannedDurationSeconds: 12,
      sessionId: "session-1",
      storyWorld: {
        characterAssets: [],
        sceneAssets: [],
        script: {
          beats: [],
          id: "bad",
          logline: "",
          sessionId: "session-1",
          state: "ready",
          summary: "",
          title: "",
          version: 1
        }
      }
    });

    expect(result).toMatchObject({
      errorCode: "MOCK_STORYBOARD_INVALID_OUTPUT",
      ok: false,
      redactionApplied: true
    });
  });
});
