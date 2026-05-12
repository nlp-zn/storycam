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
  it("creates one MVP core group even when legacy callers request more", async () => {
    const provider = createMockStoryboardProvider();
    const storyWorld = await createStoryWorld();

    await expect(
      provider.generate({
        coreGroupTargetCount: 1,
        plannedDurationSeconds: 12,
        sessionId: "session-1",
        storyWorld
      })
    ).resolves.toMatchObject({
      ok: true,
      value: {
        coreStoryboardGroups: [{ estimatedClipDurationSeconds: 15 }]
      }
    });
    await expect(
      provider.generate({
        coreGroupTargetCount: 3,
        plannedDurationSeconds: 12,
        sessionId: "session-1",
        storyWorld
      })
    ).resolves.toMatchObject({
      ok: true,
      value: {
        coreStoryboardGroups: [{ estimatedClipDurationSeconds: 15 }],
        storyboardScripts: [expect.objectContaining({ plannedDurationSeconds: 15 })]
      }
    });
  });

  it("includes title, story purpose, duration, scene, and characters in each group", async () => {
    const result = await createMockStoryboardProvider().generate({
      durationPreset: "medium",
      coreGroupTargetCount: 2,
      plannedDurationSeconds: 12,
      sessionId: "session-1",
      storyWorld: await createStoryWorld()
    });

    expect(result.ok && result.value.coreStoryboardGroups).toHaveLength(1);
    expect(result.ok && result.value.coreStoryboardGroups[0]).toMatchObject({
      characterAssetIds: ["character-rainy-crush-lead", "character-rainy-crush-counterpart"],
      estimatedClipDurationSeconds: 15,
      sceneAssetId: "scene-rainy-convenience-store",
      storyPurpose: expect.any(String),
      title: "未发送的短信"
    });
  });

  it("generates a stable nine-frame script for each core group", async () => {
    const provider = createMockStoryboardProvider();
    const storyWorld = await createStoryWorld();

    const result = await provider.generate({
      coreGroupTargetCount: 1,
      plannedDurationSeconds: 12,
      sessionId: "session-1",
      storyWorld
    });

    expect(result.ok && result.value.expandedStoryboardCards).toHaveLength(0);
    expect(result.ok && result.value.storyboardScripts[0]?.frames).toHaveLength(9);
    expect(result.ok && result.value.storyboardScripts[0]?.frames[0]).toMatchObject({
      beatType: "core",
      canvasPosition: "center",
      frameNumber: 1,
      visibleCharacterAssetIds: ["character-rainy-crush-lead", "character-rainy-crush-counterpart"]
    });
    expect(result.ok && result.value.storyboardScripts[0]?.frames[8]).toMatchObject({
      canvasPosition: "bottom-right",
      frameNumber: 9
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
          qualityChecks: [],
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
