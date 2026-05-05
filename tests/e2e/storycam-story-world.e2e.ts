import { expect, test } from "@playwright/test";
import { mockAuthenticated } from "./helpers/auth";

test.describe("StoryCam story world", () => {
  test("batch asset image polling keeps checking until generated images are ready", async ({ page }) => {
    await mockAuthenticated(page);
    await page.route("**/api/story-world", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            characterAssets: [
              { id: "character-artifact-1", state: "ready", type: "character_asset", version: 1 },
              { id: "character-artifact-2", state: "ready", type: "character_asset", version: 1 }
            ],
            sceneAssets: [{ id: "scene-artifact-1", state: "ready", type: "scene_asset", version: 1 }],
            script: { id: "script-artifact-1", state: "ready", type: "script", version: 1 }
          },
          ok: true,
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });
    await page.route("**/api/story-world/assets/generate-images", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 202,
        body: JSON.stringify({
          imagesByArtifactId: {
            "character-artifact-1": {
              assetArtifactId: "character-artifact-1",
              assetKind: "character",
              image: { jobId: "job-character-1", placeholder: true, status: "generating" }
            }
          },
          ok: true
        })
      });
    });

    let pollCount = 0;
    await page.route("**/api/generation-jobs/job-character-1", async (route) => {
      pollCount += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          image:
            pollCount === 1
              ? { jobId: "job-character-1", placeholder: true, status: "generating" }
              : {
                  mediaId: "media-character-image-1",
                  mimeType: "image/png",
                  placeholder: false,
                  signedUrl:
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%2300f0ff'/%3E%3C/svg%3E",
                  signedUrlExpiresIn: 300,
                  status: "ready"
                },
          job: {
            attempts: 0,
            id: "job-character-1",
            outputArtifactId: "character-artifact-1",
            providerKind: "image",
            providerName: "inference_sh",
            sessionId: "session-1",
            status: pollCount === 1 ? "running" : "succeeded",
            type: "story_world_asset_image"
          },
          ok: true
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    await page.getByRole("button", { name: "生成全部资产图" }).click();

    await expect(page.getByAltText("她 资产图")).toBeVisible({ timeout: 12_000 });
    expect(pollCount).toBeGreaterThanOrEqual(2);
  });

  test("story world must be confirmed before storyboard generation and edits stale downstream work", async ({ page }) => {
    await mockAuthenticated(page);
    await page.route("**/api/story-world", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            characterAssets: [
              { id: "character-artifact-1", state: "ready", type: "character_asset", version: 1 },
              { id: "character-artifact-2", state: "ready", type: "character_asset", version: 1 }
            ],
            sceneAssets: [{ id: "scene-artifact-1", state: "ready", type: "scene_asset", version: 1 }],
            script: { id: "script-artifact-1", state: "ready", type: "script", version: 1 }
          },
          ok: true,
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });

    await page.route("**/api/storyboard", async (route) => {
      const body = route.request().postDataJSON() as {
        confirmedArtifactVersions: Record<string, number>;
        sessionId: string;
      };

      expect(body.sessionId).toBe("session-1");
      expect(body.confirmedArtifactVersions).toEqual({
        "character-artifact-1": 1,
        "character-artifact-2": 1,
        "scene-artifact-1": 1,
        "script-artifact-1": 1
      });

      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            coreStoryboardGroups: [{ id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }],
            storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
            storyboardScripts: [{ id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }]
          },
          durationPlan: {
            clipDurationTargets: [15],
            coreGroupTargetCount: 1,
            plannedDurationSeconds: 15
          },
          ok: true,
          sessionId: "session-1",
          storyboard: storyboardFixture()
        })
      });
    });
    await page.route("**/api/story-world/assets/generate-image", async (route) => {
      const body = route.request().postDataJSON() as {
        assetArtifactId: string;
        assetKind: "character" | "scene";
        sessionId: string;
      };

      expect(body.sessionId).toBe("session-1");
      expect(body).toMatchObject(
        body.assetKind === "character"
          ? { assetArtifactId: "character-artifact-1", assetKind: "character" }
          : { assetArtifactId: "scene-artifact-1", assetKind: "scene" }
      );

      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          assetArtifactId: body.assetArtifactId,
          assetKind: body.assetKind,
          image: {
            mediaId: `media-${body.assetKind}-image-1`,
            mimeType: "image/png",
            placeholder: false,
            signedUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%2300f0ff'/%3E%3C/svg%3E",
            signedUrlExpiresIn: 300,
            status: "ready"
          },
          media: {
            id: `media-${body.assetKind}-image-1`,
            mimeType: "image/png",
            signedUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%2300f0ff'/%3E%3C/svg%3E",
            signedUrlExpiresIn: 300
          },
          ok: true
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();

    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    await expect(page.getByText("雨夜未发送", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /2 组/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /3 组/ })).toHaveCount(0);
    await expect(page.getByText("保存到你的账号")).toHaveCount(0);
    await expect(page.getByText("当前流程")).toHaveCount(0);
    await expect(page.getByText("片段时间线")).toHaveCount(0);
    await expect(page.getByText("步骤 2")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "转到输入创意" })).toHaveCount(0);
    await page.getByRole("button", { name: "返回首页" }).click();
    await expect(page.getByRole("heading", { name: "私人小剧场相机" })).toBeVisible();
    await expect(page).toHaveURL(/\/storycam\/input$/);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    await expect(page).toHaveURL(/\/storycam\/story-world$/);
    await expect(page.getByRole("button", { name: "转到核心分镜" })).toBeDisabled();
    await expect(page.getByText("我的剧本")).toBeVisible();
    await expect(page.getByText("剧情 1")).toBeVisible();
    await expect(page.getByText("第 1 拍")).toHaveCount(0);
    await expect(page.getByTestId("story-world-character-asset-card")).toHaveCount(2);
    await expect(page.getByTestId("story-world-character-asset-card").first().getByText("人物", { exact: true })).toBeVisible();
    await expect(page.getByTestId("story-world-scene-asset-card").first().getByText("地点", { exact: true })).toBeVisible();
    await expectStoryWorldLayoutScale(page);
    await page.getByTestId("story-world-character-asset-card").first().click();
    await expect(page.getByRole("dialog", { name: "她 资产生成" })).toBeVisible();
    await page.getByRole("button", { name: "生成资产图" }).click();
    await expect(page.getByAltText("她 生成资产")).toBeVisible();
    await page.getByRole("button", { name: "关闭资产生成窗口" }).click();
    await page.getByTestId("story-world-scene-asset-card").first().click();
    const sceneDialog = page.getByRole("dialog", { name: "便利店外的玻璃反光 资产生成" });
    await expect(sceneDialog).toBeVisible();
    await expect(sceneDialog.getByText("切图 1 · 主场景")).toBeVisible();
    await expect(sceneDialog.getByText("便利店外景", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "生成资产图" })).toBeInViewport();
    await page.getByRole("button", { name: "生成资产图" }).click();
    await expect(page.getByAltText("便利店外的玻璃反光 生成资产")).toBeVisible();
    await page.getByRole("button", { name: "关闭资产生成窗口" }).click();

    await page.getByRole("button", { name: "对，生成核心分镜" }).click();
    await expect(page.getByRole("heading", { name: "核心分镜" })).toBeVisible();
    await expect(page).toHaveURL(/\/storycam\/core-storyboard$/);

    await page.getByRole("button", { name: "转到故事世界" }).click();
    await page.getByRole("button", { name: "改剧本" }).click();
    await page.getByLabel("我的剧本内容").fill("她决定走进便利店，把伞递给他。");
    await page.getByRole("button", { name: "保存修改" }).click();

    await expect(page).toHaveURL(/\/storycam\/story-world$/);
    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    await expect(page.getByRole("button", { name: "转到核心分镜" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "对，生成核心分镜" })).toBeVisible();
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
      },
      {
        emotionalBaseline: "温和、迟疑，习惯先照顾别人的情绪",
        name: "他",
        props: ["便利店购物袋"],
        relationshipToUserStory: "让暗恋停在没有说出口的一秒",
        role: "被暗恋的人",
        stableVisualDescription: "深色外套，短发，被便利店冷白灯照亮侧脸",
        wardrobe: "深色夹克、白色内搭"
      }
    ],
    sceneAssets: [
      {
        atmosphere: "潮湿、安静、私人回忆感",
        keyObjects: ["便利店玻璃门"],
        light: "冷白便利店灯混合暖色街灯",
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
            description: "玻璃门上两个人的倒影短暂重叠。",
            keyObjects: ["玻璃门", "倒影"],
            purpose: "呈现两人靠近但没有真正相认。",
            shotType: "medium",
            title: "玻璃倒影"
          },
          {
            description: "手机屏幕停在未发送短信，雨滴落在手背上。",
            keyObjects: ["手机屏幕", "雨滴"],
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

async function expectStoryWorldLayoutScale(page: import("@playwright/test").Page) {
  const reviewBox = await page.getByTestId("story-world-review").boundingBox();
  const scriptBox = await page.getByTestId("story-world-script-card").boundingBox();
  const characterGridBox = await page.locator(".storycam-asset-grid--characters").boundingBox();
  const sceneGridBox = await page.locator(".storycam-asset-grid--scenes").boundingBox();
  const characterCards = page.getByTestId("story-world-character-asset-card");
  const characterBox = await characterCards.first().boundingBox();
  const secondCharacterBox = await characterCards.nth(1).boundingBox();
  const sceneBox = await page.getByTestId("story-world-scene-asset-card").first().boundingBox();
  const dockBox = await page.locator(".storycam-bottom-dock").boundingBox();
  const viewport = page.viewportSize();

  expect(reviewBox?.width).toBeLessThanOrEqual(1284);
  expect(scriptBox?.width).toBeGreaterThan(340);
  await expect(characterCards).toHaveCount(2);
  expect(characterBox?.width).toBeGreaterThan(230);
  expect(secondCharacterBox?.x).toBeGreaterThan((characterBox?.x ?? 0) + (characterBox?.width ?? 0) - 2);
  expect(((secondCharacterBox?.x ?? 0) + (secondCharacterBox?.width ?? 0)) - (characterBox?.x ?? 0)).toBeGreaterThan(
    (characterGridBox?.width ?? 0) * 0.75
  );
  expect(sceneBox?.width).toBeGreaterThan((sceneGridBox?.width ?? 0) * 0.9);
  expect(sceneBox?.width).toBeGreaterThan((characterBox?.width ?? 0) * 1.6);
  expect(dockBox?.width).toBeLessThan((viewport?.width ?? 1280) - 120);
}

function storyboardFixture() {
  return {
    coreStoryboardGroups: [
      {
        emotionalTurn: "想说出口",
        estimatedClipDurationSeconds: 15,
        expandedStoryboardImages: [],
        representativeImage: placeholderImage(),
        scriptArtifact: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
        storyPurpose: "建立她和未发送短信之间的私人情绪。",
        title: "未发送短信",
        version: 1
      }
    ],
    storyboardScript: {
      planSummary: "用几个克制的雨夜时刻讲完一次没有说出口的暗恋。",
      plannedDurationSeconds: 15,
      rhythm: "慢进入，短暂停顿，安静离开",
      tone: "韩剧雨夜，私人回忆",
      version: 1
    }
  };
}

function placeholderImage() {
  return {
    placeholder: true,
    status: "placeholder"
  };
}
