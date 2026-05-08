import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const imageDataUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%2300f0ff'/%3E%3C/svg%3E";

test.describe("StoryCam session restore", () => {
  test("does not auto-restore on the input homepage and restores a selected recent project", async ({ page }) => {
    let currentRestoreCalls = 0;
    await mockAuthenticated(page);
    await mockRecentProjects(page);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      currentRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({ ok: true, restored: false })
      });
    });
    await page.route("**/api/storycam-sessions/session-restored-1/restore", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          coreGroupTargetCount: 1,
          currentStep: "story-world",
          ok: true,
          restored: true,
          sessionId: "session-restored-1",
          storyboard: null,
          storyWorld: restoredStoryWorld(),
          storyWorldConfirmed: false
        })
      });
    });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "私人小剧场相机" })).toBeVisible();
    await expect(page).toHaveURL(/\/storycam\/input$/);
    await expect(page.getByRole("button", { name: /最近项目/ })).toBeVisible();
    expect(currentRestoreCalls).toBe(0);

    await page.getByRole("button", { name: /最近项目/ }).click();
    await expect(page.getByRole("dialog", { name: "最近项目" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "雨夜未发送" })).toBeVisible();
    await page.getByRole("button", { name: "继续创作" }).click();

    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    await expect(page).toHaveURL(/\/storycam\/story-world$/);
  });

  test("restores the latest story world on a direct downstream route without generating again", async ({ page }) => {
    let storyWorldCalls = 0;
    await mockAuthenticated(page);
    await mockRestore(page, {
      coreGroupTargetCount: 1,
      currentStep: "story-world",
      ok: true,
      restored: true,
      sessionId: "session-restored-1",
      storyboard: null,
      storyWorld: restoredStoryWorld(),
      storyWorldConfirmed: false
    });
    await page.route("**/api/story-world", async (route) => {
      storyWorldCalls += 1;
      await route.abort();
    });

    await page.goto("/storycam/story-world");

    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    await expect(page).toHaveURL(/\/storycam\/story-world$/);
    await expect(page.getByText("雨夜未发送", { exact: false })).toBeVisible();
    await expect(page.getByAltText("她 资产图")).toBeVisible();
    await expect(page.getByRole("button", { name: "转到核心分镜" })).toBeDisabled();
    expect(storyWorldCalls).toBe(0);
  });

  test("restores existing core storyboard groups and thumbnails", async ({ page }) => {
    let storyboardCalls = 0;
    await mockAuthenticated(page);
    await mockRestore(page, {
      coreGroupTargetCount: 2,
      currentStep: "core-storyboard",
      ok: true,
      restored: true,
      sessionId: "session-restored-2",
      storyboard: restoredStoryboard(),
      storyWorld: restoredStoryWorld(),
      storyWorldConfirmed: true
    });
    await page.route("**/api/storyboard", async (route) => {
      storyboardCalls += 1;
      await route.abort();
    });

    await page.goto("/storycam/core-storyboard");

    await expect(page.getByRole("heading", { name: "核心分镜" })).toBeVisible();
    await expect(page).toHaveURL(/\/storycam\/core-storyboard$/);
    await expect(page.getByText("1 组 · 约 15 秒内")).toBeVisible();
    await expect(page.getByRole("heading", { exact: true, name: "未发送短信" })).toBeVisible();
    await expect(page.getByRole("heading", { exact: true, name: "玻璃反光" })).toHaveCount(0);
    await expect(page.getByAltText("未发送短信 主分镜图")).toBeVisible();
    await expect(page.getByAltText("未发送短信 扩展分镜 1")).toBeVisible();
    expect(storyboardCalls).toBe(0);
  });
});

async function mockAuthenticated(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        authenticated: true,
        user: { email: "user@example.com", id: "user-1" }
      })
    });
  });
}

async function mockRestore(page: Page, body: unknown) {
  await page.route("**/api/storycam-sessions/current", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify(body)
    });
  });
}

async function mockRecentProjects(page: Page) {
  await page.route("**/api/storycam-sessions/recent?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        ok: true,
        projects: [
          {
            coreGroupTargetCount: 1,
            currentStep: "story-world",
            sessionId: "session-restored-1",
            summary: "冷白灯、雨水和玻璃反光让两个人短暂同框。",
            thumbnail: {
              id: "media-character-1",
              mimeType: "image/png",
              signedUrl: imageDataUrl,
              signedUrlExpiresIn: 300
            },
            title: "雨夜未发送",
            updatedAt: "2026-04-28T10:00:00.000Z"
          }
        ]
      })
    });
  });
}

function restoredStoryWorld() {
  return {
    assetImagesByArtifactId: {
      "character-artifact-1": {
        id: "media-character-1",
        mimeType: "image/png",
        signedUrl: imageDataUrl,
        signedUrlExpiresIn: 300
      }
    },
    artifacts: {
      characterAssets: [{ id: "character-artifact-1", state: "ready", type: "character_asset", version: 1 }],
      sceneAssets: [{ id: "scene-artifact-1", state: "ready", type: "scene_asset", version: 1 }],
      script: { id: "script-artifact-1", state: "ready", type: "script", version: 1 }
    },
    ok: true,
    sessionId: "session-restored-1",
    storyWorld: {
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
    }
  };
}

function restoredStoryboard() {
  return {
    artifacts: {
      coreStoryboardGroups: [
        { id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 },
        { id: "core-artifact-2", state: "ready", type: "core_storyboard_group", version: 1 }
      ],
      storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
      storyboardScripts: [
        { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
        { id: "storyboard-artifact-2", state: "ready", type: "storyboard_script", version: 1 }
      ]
    },
    durationPlan: {
      clipDurationTargets: [15, 15],
      coreGroupTargetCount: 2,
      plannedDurationSeconds: 30
    },
    ok: true,
    sessionId: "session-restored-2",
    storyboard: {
      coreStoryboardGroups: [
        {
          emotionalTurn: "想说出口",
          estimatedClipDurationSeconds: 15,
          expandedStoryboardImages: [
            {
              mediaId: "media-expanded-1",
              mimeType: "image/png",
              placeholder: false,
              signedUrl: imageDataUrl,
              signedUrlExpiresIn: 300,
              status: "ready"
            }
          ],
          representativeImage: {
            mediaId: "media-core-1",
            mimeType: "image/png",
            placeholder: false,
            signedUrl: imageDataUrl,
            signedUrlExpiresIn: 300,
            status: "ready"
          },
          scriptArtifact: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
          storyPurpose: "建立她和未发送短信之间的私人情绪。",
          title: "未发送短信",
          version: 1
        },
        {
          emotionalTurn: "靠近但错过",
          estimatedClipDurationSeconds: 15,
          expandedStoryboardImages: [],
          representativeImage: {
            mediaId: "media-core-2",
            mimeType: "image/png",
            placeholder: false,
            signedUrl: imageDataUrl,
            signedUrlExpiresIn: 300,
            status: "ready"
          },
          scriptArtifact: { id: "storyboard-artifact-2", state: "ready", type: "storyboard_script", version: 1 },
          storyPurpose: "让对方靠近，但仍然不让告白真正发生。",
          title: "玻璃反光",
          version: 1
        }
      ],
      storyboardScript: {
        planSummary: "用几个克制的雨夜时刻讲完一次没有说出口的暗恋。",
        plannedDurationSeconds: 30,
        rhythm: "慢进入，短暂停顿，安静离开",
        tone: "韩剧雨夜，私人回忆",
        version: 1
      }
    }
  };
}
