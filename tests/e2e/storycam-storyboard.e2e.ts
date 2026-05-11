import { expect, test } from "@playwright/test";
import { mockAuthenticated } from "./helpers/auth";

test.describe("StoryCam core storyboard", () => {
  test("moves to core storyboard immediately while storyboard is still generating", async ({ page }) => {
    const storyboardGate = deferred<void>();
    const firstFrameGate = deferred<void>();
    let firstFrameWasRequested = false;

    await mockAuthenticated(page);
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
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });

    await page.route("**/api/storyboard", async (route) => {
      const body = route.request().postDataJSON() as { deferRepresentativeImages?: boolean };

      expect(body.deferRepresentativeImages).toBe(true);
      await storyboardGate.promise;
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            coreStoryboardGroups: [
              { id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }
            ],
            storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
            storyboardScripts: [
              { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }
            ]
          },
          durationPlan: {
            clipDurationTargets: [15],
            coreGroupTargetCount: 1,
            plannedDurationSeconds: 15
          },
          ok: true,
          sessionId: "session-1",
          storyboard: storyboardFixture(1, "placeholder")
        })
      });
    });
    await page.route("**/api/storyboard-groups/core-artifact-1/frames/1/regenerate-image", async (route) => {
      firstFrameWasRequested = true;
      await firstFrameGate.promise;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          frameNumber: 1,
          image: readyImage("media-main-1"),
          ok: true,
          sessionId: "session-1"
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();

    await expect(page).toHaveURL(/\/storycam\/core-storyboard$/);
    await expect(page.getByTestId("core-storyboard-card")).toBeVisible();
    await expect(page.getByTestId("core-storyboard-pending-board")).toBeVisible();
    await expect(page.getByTestId("core-storyboard-pending-script")).toBeVisible();
    await expect(page.getByRole("button", { name: "核心分镜生成中" })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "未发送短信" })).toHaveCount(0);

    storyboardGate.resolve();

    await expect(page.getByRole("heading", { name: "核心分镜" })).toBeVisible();
    await expect(page.getByRole("heading", { exact: true, name: "未发送短信" })).toBeVisible();
    await expect(page.getByText("分镜脚本")).toBeVisible();
    await expect(page.getByText("建立她和未发送短信之间的私人情绪。")).toBeVisible();
    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveCount(0);
    await expect.poll(() => firstFrameWasRequested).toBe(true);

    firstFrameGate.resolve();

    await expect(page.getByAltText("未发送短信 主分镜图")).toBeVisible();
  });

  test("keeps a retry path when the deferred main storyboard image request fails", async ({ page }) => {
    let firstFrameCalls = 0;

    await mockAuthenticated(page);
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
          sessionId: "session-1",
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
          storyboard: storyboardFixture(1, "placeholder")
        })
      });
    });
    await page.route("**/api/storyboard-groups/core-artifact-1/frames/1/regenerate-image", async (route) => {
      firstFrameCalls += 1;

      if (firstFrameCalls === 1) {
        await route.fulfill({
          contentType: "application/json",
          status: 500,
          body: JSON.stringify({ error: "temporary_failure" })
        });
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          frameNumber: 1,
          image: readyImage("media-main-retry"),
          ok: true,
          sessionId: "session-1"
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();

    await expect.poll(() => firstFrameCalls).toBe(1);
    await expect(page.getByRole("button", { name: "重生成第 01 帧" })).toBeVisible();
    await page.getByRole("button", { name: "重生成第 01 帧" }).click();
    await expect(page.getByAltText("未发送短信 主分镜图")).toBeVisible();
    expect(firstFrameCalls).toBe(2);
  });

  test("polls the deferred main storyboard image without restore overwriting the job", async ({ page }) => {
    let restoreCalls = 0;
    let pollCalls = 0;

    await mockAuthenticated(page);
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
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });
    await page.route("**/api/storyboard", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify(storyboardResponseFixture(storyboardFixture(1, "placeholder")))
      });
    });
    await page.route("**/api/storyboard-groups/core-artifact-1/frames/1/regenerate-image", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 202,
        body: JSON.stringify({
          frameNumber: 1,
          image: generatingImage("job-main-deferred"),
          ok: true,
          sessionId: "session-1"
        })
      });
    });
    await page.route("**/api/generation-jobs/job-main-deferred", async (route) => {
      pollCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          image: pollCalls === 1 ? generatingImage("job-main-deferred") : readyImage("media-main-deferred"),
          job: {
            attempts: 0,
            id: "job-main-deferred",
            outputArtifactId: "core-artifact-1",
            providerKind: "image",
            providerName: "inference_sh",
            sessionId: "session-1",
            status: pollCalls === 1 ? "running" : "succeeded",
            type: "storyboard_image"
          },
          ok: true
        })
      });
    });
    await page.route("**/api/storycam-sessions/session-1/restore", async (route) => {
      restoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          coreGroupTargetCount: 1,
          currentStep: "core-storyboard",
          ok: true,
          restored: true,
          sessionId: "session-1",
          storyboard: storyboardResponseFixture(storyboardFixture(1, "placeholder")),
          storyWorld: {
            artifacts: {
              characterAssets: [{ id: "character-artifact-1", state: "ready", type: "character_asset", version: 1 }],
              sceneAssets: [{ id: "scene-artifact-1", state: "ready", type: "scene_asset", version: 1 }],
              script: { id: "script-artifact-1", state: "ready", type: "script", version: 1 }
            },
            ok: true,
            sessionId: "session-1",
            storyWorld: storyWorldFixture()
          },
          storyWorldConfirmed: true
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();

    await expect(page.getByRole("heading", { exact: true, name: "未发送短信" })).toBeVisible();
    await expect(page.getByAltText("未发送短信 主分镜图")).toBeVisible({ timeout: 12_000 });
    expect(pollCalls).toBeGreaterThanOrEqual(2);
    expect(restoreCalls).toBeLessThanOrEqual(2);
  });

  test("keeps storyboard failures local and retries in the core layout", async ({ page }) => {
    let storyboardCalls = 0;

    await mockAuthenticated(page);
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
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });

    await page.route("**/api/storyboard", async (route) => {
      storyboardCalls += 1;

      if (storyboardCalls === 1) {
        await route.fulfill({
          contentType: "application/json",
          status: 500,
          body: JSON.stringify({ error: "storyboard_failed" })
        });
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            coreStoryboardGroups: [
              { id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }
            ],
            storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
            storyboardScripts: [
              { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }
            ]
          },
          durationPlan: {
            clipDurationTargets: [15],
            coreGroupTargetCount: 1,
            plannedDurationSeconds: 15
          },
          ok: true,
          sessionId: "session-1",
          storyboard: storyboardFixture(1, "placeholder")
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();

    await expect(page).toHaveURL(/\/storycam\/core-storyboard$/);
    await expect(page.getByTestId("core-storyboard-card")).toBeVisible();
    await expect(page.getByText("核心分镜生成失败，可以重试或返回故事世界。")).toBeVisible();
    await page.getByRole("button", { name: "重试生成" }).click();

    await expect(page.getByRole("heading", { exact: true, name: "未发送短信" })).toBeVisible();
    expect(storyboardCalls).toBe(2);
  });

  test("returns to story world and ignores a late storyboard response", async ({ page }) => {
    const storyboardGate = deferred<void>();

    await mockAuthenticated(page);
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
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });

    await page.route("**/api/storyboard", async (route) => {
      await storyboardGate.promise;
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            coreStoryboardGroups: [
              { id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }
            ],
            storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
            storyboardScripts: [
              { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }
            ]
          },
          durationPlan: {
            clipDurationTargets: [15],
            coreGroupTargetCount: 1,
            plannedDurationSeconds: 15
          },
          ok: true,
          sessionId: "session-1",
          storyboard: storyboardFixture(1, "placeholder")
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();
    await expect(page.getByTestId("core-storyboard-pending-board")).toBeVisible();

    await page.getByRole("button", { name: "返回故事世界" }).click();
    await expect(page).toHaveURL(/\/storycam\/story-world$/);
    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();

    storyboardGate.resolve();

    await expect(page.getByRole("heading", { name: "核心分镜" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/storycam\/story-world$/);
  });

  test("single core group polls its main storyboard image until ready", async ({ page }) => {
    await mockAuthenticated(page);
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
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });

    await page.route("**/api/storyboard", async (route) => {
      const body = route.request().postDataJSON() as { coreGroupTargetCount: number };

      expect(body.coreGroupTargetCount).toBe(1);
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            coreStoryboardGroups: [
              { id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }
            ],
            storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
            storyboardScripts: [
              { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }
            ]
          },
          durationPlan: {
            clipDurationTargets: [15],
            coreGroupTargetCount: 1,
            plannedDurationSeconds: 15
          },
          ok: true,
          sessionId: "session-1",
          storyboard: storyboardFixture(1, "generating")
        })
      });
    });

    const pollCounts = new Map<string, number>();
    await page.route("**/api/generation-jobs/job-main-*", async (route) => {
      const jobId = route.request().url().split("/").at(-1) ?? "";
      const nextCount = (pollCounts.get(jobId) ?? 0) + 1;
      pollCounts.set(jobId, nextCount);
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          image:
            nextCount === 1
              ? { jobId, placeholder: true, status: "generating" }
              : {
                  mediaId: `media-${jobId}`,
                  mimeType: "image/png",
                  placeholder: false,
                  signedUrl:
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%2300f0ff'/%3E%3C/svg%3E",
                  signedUrlExpiresIn: 300,
                  status: "ready"
                },
          job: {
            attempts: 0,
            id: jobId,
            outputArtifactId: "core-artifact-1",
            providerKind: "image",
            providerName: "inference_sh",
            sessionId: "session-1",
            status: nextCount === 1 ? "running" : "succeeded",
            type: "storyboard_image"
          },
          ok: true
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await expect(page.getByRole("button", { name: /2 组/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /3 组/ })).toHaveCount(0);
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();

    await expect(page.getByRole("heading", { name: "核心分镜" })).toBeVisible();
    await expect(page.getByAltText("未发送短信 主分镜图")).toBeVisible({ timeout: 12_000 });
    expect(pollCounts.get("job-main-1")).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("core-storyboard-card")).toHaveCount(1);
  });

  test("legacy multi-group responses render only the first MVP core group", async ({ page }) => {
    await mockAuthenticated(page);
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
          sessionId: "session-1",
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
            coreStoryboardGroups: [
              { id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 },
              { id: "core-artifact-2", state: "ready", type: "core_storyboard_group", version: 1 },
              { id: "core-artifact-3", state: "ready", type: "core_storyboard_group", version: 1 }
            ],
            storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
            storyboardScripts: [
              { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
              { id: "storyboard-artifact-2", state: "ready", type: "storyboard_script", version: 1 },
              { id: "storyboard-artifact-3", state: "ready", type: "storyboard_script", version: 1 }
            ]
          },
          durationPlan: {
            clipDurationTargets: [15, 15, 15],
            coreGroupTargetCount: 3,
            plannedDurationSeconds: 45
          },
          ok: true,
          sessionId: "session-1",
          storyboard: storyboardFixture(3, "placeholder")
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();

    await expect(page.getByRole("heading", { name: "核心分镜" })).toBeVisible();
    await expect(page.getByText("1 个核心分镜组，控制在 45 秒内。")).toHaveCount(0);
    await expect(page.getByText("1 组 · 约 15 秒内")).toBeVisible();
    await expect(page.getByRole("heading", { exact: true, name: "未发送短信" })).toBeVisible();
    await expect(page.getByRole("heading", { exact: true, name: "玻璃反光" })).toHaveCount(0);
    await expect(page.getByRole("heading", { exact: true, name: "擦肩而过" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "点击中心主图生成扩展分镜" })).toHaveCount(1);
    await expect(page.getByTestId("storyboard-frame-02")).toHaveCount(0);
    await expect(page.getByTestId("storyboard-frame-09")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "等待分镜完成" })).toBeDisabled();
    await expect(page.getByText("0 / 8 已完成")).toBeVisible();
  });

  test("shows an internal waiting state when storyboard images depend on unfinished story-world asset images", async ({ page }) => {
    let firstFrameCalls = 0;

    await mockAuthenticated(page);
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
          sessionId: "session-1",
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
            coreStoryboardGroups: [
              { id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }
            ],
            storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
            storyboardScripts: [
              { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }
            ]
          },
          durationPlan: {
            clipDurationTargets: [15],
            coreGroupTargetCount: 1,
            plannedDurationSeconds: 15
          },
          ok: true,
          sessionId: "session-1",
          storyboard: storyboardFixture(1, "waiting_for_asset_images")
        })
      });
    });
    await page.route("**/api/storyboard-groups/core-artifact-1/frames/1/regenerate-image", async (route) => {
      firstFrameCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          frameNumber: 1,
          image: firstFrameCalls === 1 ? placeholderImage("waiting_for_asset_images") : readyImage("media-main-after-assets"),
          ok: true,
          sessionId: "session-1"
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();

    await expect(page.getByText("等待角色/场景资产图")).toBeVisible();
    await expect(page.getByRole("button", { name: "点击中心主图生成扩展分镜" })).toBeDisabled();
    await expect(page.getByAltText("未发送短信 主分镜图")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: "点击中心主图生成扩展分镜" })).toBeEnabled();
    expect(firstFrameCalls).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("core-storyboard-card")).toHaveCount(1);
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

function storyboardResponseFixture(storyboard: ReturnType<typeof storyboardFixture>) {
  return {
    artifacts: {
      coreStoryboardGroups: [
        { id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }
      ],
      storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
      storyboardScripts: [
        { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }
      ]
    },
    durationPlan: {
      clipDurationTargets: [15],
      coreGroupTargetCount: 1,
      plannedDurationSeconds: 15
    },
    ok: true,
    sessionId: "session-1",
    storyboard
  };
}

function storyboardFixture(count: 1 | 2 | 3, imageStatus: "generating" | "placeholder" | "waiting_for_asset_images") {
  const groups = [
    {
      emotionalTurn: "想说出口",
      estimatedClipDurationSeconds: 15,
      expandedStoryboardImages: [],
      representativeImage: imageStatus === "generating" ? generatingImage("job-main-1") : placeholderImage(imageStatus),
      scriptArtifact: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
      storyPurpose: "建立她和未发送短信之间的私人情绪。",
      title: "未发送短信",
      version: 1
    },
    {
      emotionalTurn: "靠近但错过",
      estimatedClipDurationSeconds: 15,
      expandedStoryboardImages: [],
      representativeImage: imageStatus === "generating" ? generatingImage("job-main-2") : placeholderImage(imageStatus),
      scriptArtifact: { id: "storyboard-artifact-2", state: "ready", type: "storyboard_script", version: 1 },
      storyPurpose: "让对方靠近，但仍然不让告白真正发生。",
      title: "玻璃反光",
      version: 1
    },
    {
      emotionalTurn: "把话收回去",
      estimatedClipDurationSeconds: 15,
      expandedStoryboardImages: [],
      representativeImage: placeholderImage(),
      scriptArtifact: { id: "storyboard-artifact-3", state: "ready", type: "storyboard_script", version: 1 },
      storyPurpose: "用删除短信完成这段记忆的收束。",
      title: "擦肩而过",
      version: 1
    }
  ].slice(0, count);

  return {
    coreStoryboardGroups: groups,
    storyboardScript: {
      planSummary: "用几个克制的雨夜时刻讲完一次没有说出口的暗恋。",
      plannedDurationSeconds: count * 15,
      rhythm: "慢进入，短暂停顿，安静离开",
      tone: "韩剧雨夜，私人回忆",
      version: 1
    }
  };
}

function placeholderImage(reason?: "placeholder" | "waiting_for_asset_images") {
  return {
    placeholder: true,
    ...(reason === "waiting_for_asset_images" ? { reason } : {}),
    status: "placeholder"
  };
}

function generatingImage(jobId: string) {
  return {
    jobId,
    placeholder: true,
    status: "generating"
  };
}

function readyImage(mediaId: string) {
  return {
    mediaId,
    mimeType: "image/png",
    placeholder: false,
    signedUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%2300f0ff'/%3E%3C/svg%3E",
    signedUrlExpiresIn: 300,
    status: "ready"
  };
}
