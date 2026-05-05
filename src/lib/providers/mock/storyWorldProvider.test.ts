import { describe, expect, it } from "vitest";
import { malformedStoryWorldFixture } from "./fixtures/storyWorld";
import { createMockStoryWorldProvider } from "./storyWorldProvider";

describe("mock story world provider", () => {
  it("returns the stable rainy K-drama crush sample", async () => {
    const provider = createMockStoryWorldProvider();

    const result = await provider.generate({
      idea: "我想把暗恋拍成韩剧雨夜",
      sessionId: "session-1"
    });

    expect(result).toMatchObject({
      ok: true,
      providerKind: "text",
      providerName: "mock"
    });
    expect(result.ok && result.value.script).toMatchObject({
      id: "script-rainy-kdrama-crush",
      title: "雨夜未发送",
      visualStyle: expect.stringContaining("写实韩剧电影感")
    });
    expect(result.ok && result.value.characterAssets[0]?.stableVisualDescription).toContain("浅色风衣");
    expect(result.ok && result.value.sceneAssets[0]?.location).toContain("便利店");
    expect(result.ok && result.value.sceneAssets).toHaveLength(1);
    expect(result.ok && result.value.sceneAssets[0]?.scenePanels).toHaveLength(4);
  });

  it("keeps uploaded photo references as media ids without raw storage paths", async () => {
    const provider = createMockStoryWorldProvider();

    const result = await provider.generate({
      idea: "暗恋韩剧雨夜",
      sessionId: "session-1",
      uploadedPhotoRefs: [
        {
          mediaAssetId: "media-photo-1",
          storageBucket: "storycam-uploads",
          storagePath: "users/user-1/sessions/session-1/uploads/private-photo.jpg"
        }
      ]
    });

    expect(result.ok && result.value.characterAssets[0]?.referenceMediaIds).toEqual(["media-photo-1"]);
    expect(result.ok && result.value.sceneAssets[0]?.referenceMediaIds).toEqual(["media-photo-1"]);
    expect(JSON.stringify(result)).not.toContain("private-photo.jpg");
    expect(JSON.stringify(result)).not.toContain("storycam-uploads");
  });

  it("rejects malformed mock fixtures through the provider error shape", async () => {
    const provider = createMockStoryWorldProvider(malformedStoryWorldFixture);

    const result = await provider.generate({
      idea: "暗恋韩剧雨夜",
      sessionId: "session-1"
    });

    expect(result).toEqual({
      errorCode: "MOCK_STORY_WORLD_INVALID_FIXTURE",
      ok: false,
      providerKind: "text",
      providerName: "mock",
      redactedError: "Provider request failed.",
      redactionApplied: true,
      retryable: false
    });
  });
});
