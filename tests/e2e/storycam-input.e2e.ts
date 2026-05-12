import { expect, test } from "@playwright/test";
import { mockAuthenticated } from "./helpers/auth";

test.describe("StoryCam story input", () => {
  test("selects rounded story mode templates without overwriting custom writing", async ({ page }) => {
    await mockAuthenticated(page);
    await page.goto("/");

    const ideaInput = page.getByLabel("你的这一幕");
    const memoryMode = page.getByRole("button", { name: /私人记忆/ });
    const petMode = page.getByRole("button", { name: /宠物小剧场/ });
    const novelMode = page.getByRole("button", { name: /小说角色/ });

    await expect(memoryMode).toHaveAttribute("aria-pressed", "true");
    await expect(ideaInput).toHaveValue("我想把暗恋拍成韩剧雨夜");
    await expect(page.getByRole("button", { name: "移除 留白多一点" })).toHaveAttribute("aria-pressed", "true");

    await ideaInput.fill("");
    await petMode.click();

    await expect(petMode).toHaveAttribute("aria-pressed", "true");
    await expect(ideaInput).toHaveValue("我想拍一只小狗等主人回家的十秒小剧场");
    await expect(page.getByRole("button", { name: "移除 低机位跟随" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { exact: true, name: "留白多一点" })).toHaveCount(0);

    await ideaInput.fill("这是我自己写的一段，不要被模板覆盖");
    await novelMode.click();

    await expect(novelMode).toHaveAttribute("aria-pressed", "true");
    await expect(ideaInput).toHaveValue("这是我自己写的一段，不要被模板覆盖");
    await expect(page.getByRole("button", { name: "移除 初登场感" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("已切换方向，不会覆盖你的文字。")).toBeVisible();
  });

  test("handdrawn travel VLOG requires a photo and destination before submitting", async ({ page }) => {
    let storyWorldBody: {
      input: string;
      lightweightChoices: string[];
      storyModeId?: string;
      travelDestination?: string;
      uploadedPhotoIds?: string[];
      videoAspectRatio?: string;
    } | null = null;

    await mockAuthenticated(page);
    await page.route("**/api/uploads", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          media: {
            byteSize: 4,
            id: "media-photo-1",
            kind: "uploaded_photo",
            mimeType: "image/png"
          },
          ok: true,
          sessionId: "session-1",
          uploadedPhotoIds: ["media-photo-1"],
          uploadedPhotoRefs: [{ mediaAssetId: "media-photo-1" }]
        })
      });
    });
    await page.route("**/api/story-world", async (route) => {
      storyWorldBody = route.request().postDataJSON();

      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            characterAssets: [],
            sceneAssets: [],
            script: {
              id: "script-artifact-1",
              state: "ready",
              type: "script",
              version: 1
            }
          },
          ok: true,
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: /手绘旅行 VLOG/ }).click();
    await expect(page.getByRole("button", { name: "生成故事雏形" })).toBeDisabled();
    await expect(page.getByText("上传一张自己的照片，再写一个旅行地。")).toBeVisible();

    await page.getByRole("textbox", { name: "旅行地" }).fill("葡萄牙里斯本阿尔法玛");
    await expect(page.getByRole("button", { name: "生成故事雏形" })).toBeDisabled();

    await page.getByTestId("story-photo-input").setInputFiles({
      buffer: Buffer.from([137, 80, 78, 71]),
      mimeType: "image/png",
      name: "me.png"
    });
    const storyWorldRequestPromise = page.waitForRequest("**/api/story-world");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    const storyWorldRequest = await storyWorldRequestPromise;
    storyWorldBody = storyWorldRequest.postDataJSON();

    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    expect(storyWorldBody).toMatchObject({
      lightweightChoices: expect.arrayContaining(["手绘角色感"]),
      storyModeId: "handdrawn-travel-vlog",
      travelDestination: "葡萄牙里斯本阿尔法玛",
      uploadedPhotoIds: ["media-photo-1"],
      videoAspectRatio: "9:16"
    });
  });

  test("rotates discovery samples without changing layout width", async ({ page }) => {
    await mockAuthenticated(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    const discovery = page.getByRole("region", { name: "发现更多" });
    const initialTitle = await discovery.locator(".storycam-discovery-card h3").first().innerText();

    await expect(discovery.locator(".storycam-discovery-card")).toHaveCount(6);
    await page.getByRole("button", { name: "换一批发现样片" }).click();

    await expect(discovery.locator(".storycam-discovery-card")).toHaveCount(6);
    await expect(discovery.locator(".storycam-discovery-card h3").first()).not.toHaveText(initialTitle);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("story input uploads a photo preview and calls story-world", async ({ page }) => {
    let uploadCalled = false;
    let storyWorldCalled = false;

    await mockAuthenticated(page);
    await page.route("**/api/uploads", async (route) => {
      uploadCalled = true;
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          media: {
            byteSize: 4,
            id: "media-photo-1",
            kind: "uploaded_photo",
            mimeType: "image/png"
          },
          ok: true,
          sessionId: "session-1",
          uploadedPhotoIds: ["media-photo-1"],
          uploadedPhotoRefs: [{ mediaAssetId: "media-photo-1" }]
        })
      });
    });
    await page.route("**/api/story-world", async (route) => {
      storyWorldCalled = true;
      const body = route.request().postDataJSON() as {
        input: string;
        lightweightChoices: string[];
        sessionId?: string;
        uploadedPhotoIds?: string[];
      };

      expect(body.input).toContain("雨夜");
      expect(body.lightweightChoices).toContain("留白多一点");
      expect(body.sessionId).toBe("session-1");
      expect(body.uploadedPhotoIds).toEqual(["media-photo-1"]);

      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            characterAssets: [],
            sceneAssets: [],
            script: {
              id: "script-artifact-1",
              state: "ready",
              type: "script",
              version: 1
            }
          },
          ok: true,
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByTestId("story-photo-input").setInputFiles({
      buffer: Buffer.from([137, 80, 78, 71]),
      mimeType: "image/png",
      name: "rain.png"
    });

    await expect(page.getByAltText("上传照片预览")).toBeVisible();
    await expect(page.getByText("rain.png")).toBeVisible();

    await page.getByRole("button", { name: "生成故事雏形" }).click();

    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    await expect(page.getByText("雨夜未发送", { exact: false })).toBeVisible();
    await expect(page.getByText("确认故事世界", { exact: true })).toBeVisible();
    expect(uploadCalled).toBe(true);
    expect(storyWorldCalled).toBe(true);
  });

  test("moves to story-world immediately while the story is still generating", async ({ page }) => {
    const storyWorldGate = deferred<void>();

    await mockAuthenticated(page);
    await page.route("**/api/story-world", async (route) => {
      await storyWorldGate.promise;
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            characterAssets: [{ id: "character-artifact-1", state: "ready", type: "character_asset", version: 1 }],
            sceneAssets: [{ id: "scene-artifact-1", state: "ready", type: "scene_asset", version: 1 }],
            script: { id: "script-artifact-1", state: "ready", type: "script", version: 1 }
          },
          ok: true,
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();

    await expect(page).toHaveURL(/\/storycam\/story-world$/);
    await expect(page.getByTestId("story-world-generating")).toBeVisible();
    await expect(page.getByTestId("story-world-layout-grid")).toBeVisible();
    await expect(page.getByTestId("story-world-script-card")).toBeVisible();
    await expect(page.getByTestId("story-world-script-skeleton")).toBeVisible();
    await expect(page.getByTestId("story-world-beats-skeleton")).toBeVisible();
    await expect(page.getByText("正在生成你的剧本、人物和地点。")).toBeVisible();
    await expect(page.getByRole("button", { name: "剧本生成中" })).toBeDisabled();

    storyWorldGate.resolve();

    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    await expect(page.getByText("雨夜未发送", { exact: false })).toBeVisible();
  });

  test("keeps story-world failures local and retries without reuploading a saved photo", async ({ page }) => {
    let uploadCalls = 0;
    const storyWorldBodies: Array<{ sessionId?: string; uploadedPhotoIds?: string[] }> = [];

    await mockAuthenticated(page);
    await page.route("**/api/uploads", async (route) => {
      uploadCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          media: {
            byteSize: 4,
            id: "media-photo-1",
            kind: "uploaded_photo",
            mimeType: "image/png"
          },
          ok: true,
          sessionId: "session-1",
          uploadedPhotoIds: ["media-photo-1"],
          uploadedPhotoRefs: [{ mediaAssetId: "media-photo-1" }]
        })
      });
    });
    await page.route("**/api/story-world", async (route) => {
      storyWorldBodies.push(route.request().postDataJSON() as { sessionId?: string; uploadedPhotoIds?: string[] });

      if (storyWorldBodies.length === 1) {
        await route.fulfill({
          contentType: "application/json",
          status: 500,
          body: JSON.stringify({ error: "story_world_failed" })
        });
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            characterAssets: [{ id: "character-artifact-1", state: "ready", type: "character_asset", version: 1 }],
            sceneAssets: [{ id: "scene-artifact-1", state: "ready", type: "scene_asset", version: 1 }],
            script: { id: "script-artifact-1", state: "ready", type: "script", version: 1 }
          },
          ok: true,
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByTestId("story-photo-input").setInputFiles({
      buffer: Buffer.from([137, 80, 78, 71]),
      mimeType: "image/png",
      name: "rain.png"
    });
    await page.getByRole("button", { name: "生成故事雏形" }).click();

    await expect(page).toHaveURL(/\/storycam\/story-world$/);
    await expect(page.getByTestId("story-world-layout-grid")).toBeVisible();
    await expect(page.getByTestId("story-world-script-card")).toBeVisible();
    await expect(page.getByText("正在保存参考照片并生成剧本。")).toBeVisible();
    await expect(page.getByText("故事雏形生成失败，可以重试或返回修改。")).toBeVisible();
    await page.getByRole("button", { name: "重试生成" }).click();

    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    expect(uploadCalls).toBe(1);
    expect(storyWorldBodies).toHaveLength(2);
    expect(storyWorldBodies[0]).toMatchObject({ sessionId: "session-1", uploadedPhotoIds: ["media-photo-1"] });
    expect(storyWorldBodies[1]).toMatchObject({ sessionId: "session-1", uploadedPhotoIds: ["media-photo-1"] });
  });

  test("returns to input and ignores a late story-world response", async ({ page }) => {
    const storyWorldGate = deferred<void>();

    await mockAuthenticated(page);
    await page.route("**/api/story-world", async (route) => {
      await storyWorldGate.promise;
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            characterAssets: [{ id: "character-artifact-1", state: "ready", type: "character_asset", version: 1 }],
            sceneAssets: [{ id: "scene-artifact-1", state: "ready", type: "scene_asset", version: 1 }],
            script: { id: "script-artifact-1", state: "ready", type: "script", version: 1 }
          },
          ok: true,
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("这是我自己写的一段，不要丢");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await expect(page.getByTestId("story-world-generating")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/storycam\/input$/);
    await expect(page.getByLabel("你的这一幕")).toHaveValue("这是我自己写的一段，不要丢");

    storyWorldGate.resolve();

    await expect(page.getByRole("heading", { name: "私人小剧场相机" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "确认故事世界" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/storycam\/input$/);
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function storyWorldFixture() {
  return {
    characterAssets: [
      {
        emotionalBaseline: "克制、犹豫、把情绪藏在动作里",
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
        atmosphere: "潮湿、安静、私人回忆感",
        keyObjects: ["便利店玻璃门"],
        light: "冷白便利店灯混合暖色街灯",
        location: "雨夜街角便利店门口",
        name: "便利店外的玻璃反光",
        spatialLogic: "她在门外低头删短信，他从店里出来，倒影在玻璃上短暂重叠",
        timeOfDay: "night"
      }
    ],
    script: {
      beats: ["雨夜删改短信", "便利店门铃响起", "玻璃倒影短暂重叠"],
      logline: "她在雨夜便利店门口，把一条没有发出的告白短信删了又写。",
      summary: "冷白灯、雨水和玻璃反光让两个人短暂同框，故事停在没有说出口的那一秒。",
      title: "雨夜未发送",
      version: 1
    }
  };
}
