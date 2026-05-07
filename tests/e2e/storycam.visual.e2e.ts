import { expect, type Page, test } from "@playwright/test";
import { mockAuthenticated } from "./helpers/auth";

test.describe("StoryCam visual smoke", () => {
  test("homepage has visible non-empty desktop and mobile states", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "私人小剧场相机" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const desktopScreenshot = await page.screenshot();
    expect(desktopScreenshot.byteLength).toBeGreaterThan(20_000);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "生成故事雏形" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const mobileScreenshot = await page.screenshot();
    expect(mobileScreenshot.byteLength).toBeGreaterThan(20_000);
  });

  test("workflow states remain visible through upload, cancel, failure, retake, and final work", async ({ page }) => {
    let generateCalls = 0;

    await page.setViewportSize({ width: 1280, height: 920 });
    await installWorkflowRoutes(page, () => {
      generateCalls += 1;
      return `job-${generateCalls}`;
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByTestId("story-photo-input").setInputFiles({
      buffer: Buffer.from([137, 80, 78, 71]),
      mimeType: "image/png",
      name: "rainy-night-reference.png"
    });
    await expect(page.getByAltText("上传照片预览")).toBeVisible();

    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();
    await page.getByRole("button", { name: "打开扩展画布" }).click();
    await expect(page.getByRole("dialog", { name: /9 帧分镜画布/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("dialog", { name: /9 帧分镜画布/ }).getByRole("button", { name: "用这一组生成片段" }).click();
    await page.getByRole("button", { name: "确认发送生成片段" }).click();
    await expect(page.getByText("任务 job-1")).toBeVisible();
    await page.getByRole("button", { name: "取消生成" }).click();
    await expect(page.getByText("已取消", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "重试" }).click();
    await expect(page.getByText("生成失败", { exact: true })).toBeVisible();
    await expect(page.getByText("状态更新失败。")).toBeVisible();

    await page.getByRole("button", { name: "重试" }).click();
    await expect(page.getByRole("heading", { name: "片段已生成" })).toBeVisible();
    await expect(page.getByRole("button", { name: "重拍这个片段" })).toBeVisible();
    await expect(page.getByRole("button", { name: "生成最终作品" }).first()).toBeVisible();

    const clipReviewScreenshot = await page.screenshot();
    expect(clipReviewScreenshot.byteLength).toBeGreaterThan(20_000);
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "生成最终作品" }).first().click();
    await expect(page.getByRole("heading", { name: "账号内预览已保存" })).toBeVisible();
    await expect(page.getByText("打开最终作品")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

async function installWorkflowRoutes(page: Page, nextJobId: () => string) {
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
        sessionId: "session-visual",
        uploadedPhotoIds: ["media-photo-1"],
        uploadedPhotoRefs: [{ mediaAssetId: "media-photo-1" }]
      })
    });
  });

  await page.route("**/api/story-world", async (route) => {
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
        sessionId: "session-visual",
        storyWorld: storyWorldFixture()
      })
    });
  });

  await page.route("**/api/storyboard", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({
        artifacts: {
          coreStoryboardGroups: [{ id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }],
          expandedStoryboardCards: Array.from({ length: 8 }, (_, index) => ({
            id: `expanded-${index + 1}`,
            parentArtifactId: "core-artifact-1",
            state: "ready",
            type: "expanded_storyboard_card",
            version: 1
          })),
          storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
          storyboardScripts: [{ id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }]
        },
        durationPlan: {
          clipDurationTargets: [15],
          coreGroupTargetCount: 1,
          plannedDurationSeconds: 15
        },
        ok: true,
        sessionId: "session-visual",
        storyboard: storyboardFixture()
      })
    });
  });

  await page.route("**/api/storyboard-groups/*/expand", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({
        expandedStoryboardCards: Array.from({ length: 8 }, (_, index) => ({
          id: `expanded-${index + 1}`,
          parentArtifactId: "core-artifact-1",
          state: "ready",
          type: "expanded_storyboard_card",
          version: 1
        })),
        expandedStoryboardImages: Array.from({ length: 8 }, (_, index) => readyImage(`expanded-media-${index + 1}`)),
        expansionCards: Array.from({ length: 8 }, (_, index) => ({
          ...expansionCardFixture(index),
          image: readyImage(`expanded-media-${index + 1}`),
          sortOrder: index
        })),
        ok: true,
        sessionId: "session-visual"
      })
    });
  });

  await page.route("**/api/storyboard-groups/*/generate-clip", async (route) => {
    const jobId = nextJobId();

    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({
        confirmationSummary: "Use \"未发送短信\" to generate one private 15 second clip.",
        jobId,
        ok: true,
        status: "running"
      })
    });
  });

  await page.route("**/api/generation-jobs/job-*/cancel", async (route) => {
    const url = route.request().url();
    const jobId = url.includes("job-3") ? "job-3" : url.includes("job-2") ? "job-2" : "job-1";

    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        jobId,
        ok: true,
        status: "canceled"
      })
    });
  });

  await page.route("**/api/generation-jobs/job-*", async (route) => {
    const url = route.request().url();
    const jobId = url.includes("job-3") ? "job-3" : url.includes("job-2") ? "job-2" : "job-1";

    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        job: {
          attempts: jobId === "job-2" ? 1 : 0,
          id: jobId,
          ...(jobId === "job-3"
            ? {
                outputArtifactId: "clip-artifact-visual-final",
                outputPreview: {
                  durationSeconds: 15,
                  mimeType: "video/mp4",
                  signedUrl: "data:video/mp4;base64,AAAA",
                  signedUrlExpiresIn: 300
                }
              }
            : {}),
          providerKind: "video",
          providerName: "mock",
          redactedError: jobId === "job-2" ? "状态更新失败。" : undefined,
          sessionId: "session-visual",
          status: jobId === "job-3" ? "succeeded" : jobId === "job-2" ? "failed" : "running",
          type: "video_clip"
        },
        ok: true
      })
    });
  });

  await page.route("**/api/stitch-suggestion", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({
        ok: true,
        stitchSuggestion: { id: "stitch-suggestion-artifact-1", state: "ready", type: "stitch_suggestion", version: 1 }
      })
    });
  });

  await page.route("**/api/final-work", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({
        finalWork: { id: "final-work-artifact-with-a-long-visual-id", state: "ready", type: "final_work", version: 1 },
        media: { byteSize: 1024, id: "media-final-with-a-long-visual-id", kind: "final_work", mimeType: "video/mp4" },
        ok: true,
        preview: {
          durationSeconds: 15,
          mimeType: "video/mp4",
          signedUrl: "data:video/mp4;base64,AAAA",
          signedUrlExpiresIn: 300
        }
      })
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  expect(overflow).toBeLessThanOrEqual(1);
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

function storyboardFixture() {
  return {
    coreStoryboardGroups: [
      {
        emotionalTurn: "想说出口",
        estimatedClipDurationSeconds: 15,
        expandedStoryboardImages: Array.from({ length: 8 }, (_, index) => readyImage(`expanded-media-${index + 1}`)),
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

function readyImage(mediaId: string) {
  return {
    mediaId,
    mimeType: "image/png",
    placeholder: false,
    signedUrl: "data:image/png;base64,iVBORw0KGgo=",
    signedUrlExpiresIn: 300,
    status: "ready"
  };
}

function expansionCardFixture(index = 0) {
  return {
    beatType: "enter",
    description: "她停在便利店门外，雨伞压低，手机屏幕映出未发送的短信。",
    guidance: "动作很小，重点是手指停顿和雨声。",
    sortOrder: index,
    title: index === 0 ? "门外停住" : `扩展镜头 ${index + 1}`,
    version: 1
  };
}
