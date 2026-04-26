import { expect, test } from "@playwright/test";

test.describe("StoryCam story input", () => {
  test("story input uploads a photo preview and calls story-world", async ({ page }) => {
    let uploadCalled = false;
    let storyWorldCalled = false;

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
          sessionId: "session-1"
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

    await expect(page.getByText("故事雏形已生成，剧本版本 1。")).toBeVisible();
    expect(uploadCalled).toBe(true);
    expect(storyWorldCalled).toBe(true);
  });
});
