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
    await expect(page.getByRole("button", { name: "移除 像私人回忆" })).toHaveAttribute("aria-pressed", "true");

    await ideaInput.fill("");
    await petMode.click();

    await expect(petMode).toHaveAttribute("aria-pressed", "true");
    await expect(ideaInput).toHaveValue("我想拍一只小狗等主人回家的十秒小剧场");
    await expect(page.getByRole("button", { name: "移除 等它回头" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { exact: true, name: "像私人回忆" })).toHaveCount(0);

    await ideaInput.fill("这是我自己写的一段，不要被模板覆盖");
    await novelMode.click();

    await expect(novelMode).toHaveAttribute("aria-pressed", "true");
    await expect(ideaInput).toHaveValue("这是我自己写的一段，不要被模板覆盖");
    await expect(page.getByRole("button", { name: "移除 初登场感" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("已切换方向，不会覆盖你的文字。")).toBeVisible();
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
      expect(body.lightweightChoices).toContain("像私人回忆");
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
});

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
