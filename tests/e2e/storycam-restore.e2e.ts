import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const imageDataUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%2300f0ff'/%3E%3C/svg%3E";
const refreshedImageDataUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%23ff4b89'/%3E%3C/svg%3E";

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
    await expect(page.getByRole("heading", { name: "最近项目" })).toBeVisible();
    await expect(page.getByRole("button", { name: "打开" })).toBeVisible();
    expect(currentRestoreCalls).toBe(0);

    await page.getByRole("button", { name: "打开" }).click();
    const recentProjectsDialog = page.getByRole("dialog", { name: "最近项目" });
    await expect(recentProjectsDialog).toBeVisible();
    await expect(recentProjectsDialog.getByRole("heading", { name: "雨夜未发送" })).toBeVisible();
    await recentProjectsDialog.getByRole("button", { name: "继续创作", exact: true }).click();

    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    await expect(page).toHaveURL(/\/storycam\/story-world$/);
  });

  test("restores a recent project directly from the inline preview card", async ({ page }) => {
    let restoreCalls = 0;
    await mockAuthenticated(page);
    await mockRecentProjects(page);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({ ok: true, restored: false })
      });
    });
    await page.route("**/api/storycam-sessions/session-restored-1/restore", async (route) => {
      restoreCalls += 1;
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
    await expect(page.getByRole("button", { name: "继续创作 雨夜未发送" })).toBeVisible();
    await expect.poll(() => restoreCalls).toBe(1);
    await page.getByRole("button", { name: "继续创作 雨夜未发送" }).click();

    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    await expect(page).toHaveURL(/\/storycam\/story-world$/);
    expect(restoreCalls).toBe(1);
  });

  test("recent project prefetch does not replace the verified current restore target", async ({ page }) => {
    let currentRestoreCalls = 0;
    let prefetchRestoreCalls = 0;
    await mockAuthenticated(page);
    await page.route("**/api/storycam-sessions/recent?*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          ok: true,
          projects: [
            recentProject({ sessionId: "session-restored-1", title: "第一项目" }),
            recentProject({ sessionId: "session-restored-2", title: "第二项目" })
          ]
        })
      });
    });
    await page.route("**/api/storycam-sessions/current", async (route) => {
      currentRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          coreGroupTargetCount: 1,
          currentStep: "story-world",
          ok: true,
          restored: true,
          sessionId: "session-current",
          storyboard: null,
          storyWorld: restoredStoryWorld("session-current"),
          storyWorldConfirmed: false
        })
      });
    });
    await page.route("**/api/storycam-sessions/session-restored-1/restore", async (route) => {
      prefetchRestoreCalls += 1;
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
          storyWorld: restoredStoryWorld("session-restored-1"),
          storyWorldConfirmed: false
        })
      });
    });
    await page.route("**/api/storycam-sessions/session-restored-2/restore", async (route) => {
      prefetchRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          coreGroupTargetCount: 1,
          currentStep: "story-world",
          ok: true,
          restored: true,
          sessionId: "session-restored-2",
          storyboard: null,
          storyWorld: restoredStoryWorld("session-restored-2"),
          storyWorldConfirmed: false
        })
      });
    });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "继续创作 第一项目" })).toBeVisible();
    await expect(page.getByRole("button", { name: "继续创作 第二项目" })).toBeVisible();
    await expect.poll(() => prefetchRestoreCalls).toBe(2);

    await page.goto("/storycam/story-world");

    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    expect(currentRestoreCalls).toBe(1);
  });

  test("refreshes recent projects when the drawer opens from the input homepage", async ({ page }) => {
    let recentProjects: unknown[] = [];
    await mockAuthenticated(page);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({ ok: true, restored: false })
      });
    });
    await page.route("**/api/storycam-sessions/recent?*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          ok: true,
          projects: recentProjects
        })
      });
    });

    await page.goto("/");
    await expect(page.getByText("还没有可继续的项目。")).toBeVisible();

    recentProjects = [recentProject()];
    await page.getByRole("button", { name: "打开" }).click();

    const recentProjectsDialog = page.getByRole("dialog", { name: "最近项目" });
    await expect(recentProjectsDialog.getByRole("heading", { name: "雨夜未发送" })).toBeVisible();
  });

  test("does not duplicate recent project refreshes while one request is in flight", async ({ page }) => {
    let recentProjectCalls = 0;
    let releaseRecentProjects!: () => void;
    let markRecentProjectStarted!: () => void;
    const recentProjectsCanResolve = new Promise<void>((resolve) => {
      releaseRecentProjects = resolve;
    });
    const recentProjectStarted = new Promise<void>((resolve) => {
      markRecentProjectStarted = resolve;
    });

    await page.route("**/api/storycam-sessions/recent?*", async (route) => {
      recentProjectCalls += 1;
      markRecentProjectStarted();
      await recentProjectsCanResolve;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          ok: true,
          projects: []
        })
      });
    });

    await mockAuthenticated(page);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({ ok: true, restored: false })
      });
    });

    await page.goto("/");
    await recentProjectStarted;
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("pageshow"));
    });
    await page.waitForTimeout(50);
    expect(recentProjectCalls).toBe(1);

    releaseRecentProjects();
    await expect(page.getByText("还没有可继续的项目。")).toBeVisible();
  });

  test("keeps recent project thumbnail URLs stable across drawer refreshes", async ({ page }) => {
    let recentProjectCalls = 0;
    await mockAuthenticated(page);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({ ok: true, restored: false })
      });
    });
    await page.route("**/api/storycam-sessions/recent?*", async (route) => {
      recentProjectCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          ok: true,
          projects: [
            recentProject({
              thumbnail: {
                id: "media-character-1",
                mimeType: "image/png",
                signedUrl: recentProjectCalls === 1 ? imageDataUrl : refreshedImageDataUrl,
                signedUrlExpiresIn: 300
              }
            })
          ]
        })
      });
    });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "继续创作 雨夜未发送" })).toBeVisible();
    await page.getByRole("button", { name: "打开" }).click();

    const thumbnail = page.getByAltText("雨夜未发送 缩略图");
    await expect(thumbnail).toHaveAttribute("src", imageDataUrl);
  });

  test("shows cached recent projects immediately while a stale refresh is pending", async ({ page }) => {
    let recentProjectCalls = 0;
    let releaseRecentProjects!: () => void;
    let markStaleRefreshStarted!: () => void;
    const staleRefreshCanResolve = new Promise<void>((resolve) => {
      releaseRecentProjects = resolve;
    });
    const staleRefreshStarted = new Promise<void>((resolve) => {
      markStaleRefreshStarted = resolve;
    });

    await mockAuthenticated(page);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({ ok: true, restored: false })
      });
    });
    await page.route("**/api/storycam-sessions/recent?*", async (route) => {
      recentProjectCalls += 1;

      if (recentProjectCalls > 1) {
        markStaleRefreshStarted();
        await staleRefreshCanResolve;
      }

      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          ok: true,
          projects: [
            recentProject({
              sessionId: recentProjectCalls === 1 ? "cached-session" : "refreshed-session",
              title: recentProjectCalls === 1 ? "缓存项目" : "刷新项目"
            })
          ]
        })
      });
    });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "继续创作 缓存项目" })).toBeVisible();
    await staleRecentProjectsCache(page);

    await page.reload();
    await staleRefreshStarted;

    await expect(page.getByRole("button", { name: "继续创作 缓存项目" })).toBeVisible();
    await expect(page.getByText("正在载入最近项目。")).toBeHidden();

    releaseRecentProjects();

    await expect(page.getByRole("button", { name: "继续创作 刷新项目" })).toBeVisible();
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

  test("keeps the current story world route when refreshing a completed project", async ({ page }) => {
    await mockAuthenticated(page);
    await mockRestore(page, restoredCompletedProject());

    await page.goto("/storycam/story-world");

    await expect(page.getByRole("heading", { name: "确认故事世界" })).toBeVisible();
    await expect(page).toHaveURL(/\/storycam\/story-world$/);
  });

  test("keeps the current core storyboard route when refreshing a completed project", async ({ page }) => {
    await mockAuthenticated(page);
    await mockRestore(page, restoredCompletedProject());

    await page.goto("/storycam/core-storyboard");

    await expect(page.getByRole("heading", { name: "核心分镜" })).toBeVisible();
    await expect(page).toHaveURL(/\/storycam\/core-storyboard$/);
  });

  test("keeps restored media signed URLs from session storage across a page reload", async ({ page }) => {
    let currentRestoreCalls = 0;
    let selectedRestoreCalls = 0;
    await mockAuthenticated(page);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      currentRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(
          restoredCompletedProject({
            storyboard: restoredStoryboard({ coreSignedUrl: imageDataUrl })
          })
        )
      });
    });
    await page.route("**/api/storycam-sessions/session-restored-2/restore", async (route) => {
      selectedRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(
          restoredCompletedProject({
            storyboard: restoredStoryboard({ coreSignedUrl: refreshedImageDataUrl })
          })
        )
      });
    });

    await page.goto("/storycam/core-storyboard");
    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveAttribute("src", imageDataUrl);

    await page.reload();

    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveAttribute("src", imageDataUrl);
    expect(currentRestoreCalls).toBe(1);
    await expect.poll(() => selectedRestoreCalls).toBe(1);
  });

  test("renders cached core storyboard immediately while network restore is pending", async ({ page }) => {
    let releaseNetworkRestore!: () => void;
    let markNetworkRestoreStarted!: () => void;
    const networkRestoreCanResolve = new Promise<void>((resolve) => {
      releaseNetworkRestore = resolve;
    });
    const networkRestoreStarted = new Promise<void>((resolve) => {
      markNetworkRestoreStarted = resolve;
    });

    await mockAuthenticated(page);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(
          restoredCompletedProject({
            storyboard: restoredStoryboard({ coreSignedUrl: imageDataUrl })
          })
        )
      });
    });
    await page.route("**/api/storycam-sessions/session-restored-2/restore", async (route) => {
      markNetworkRestoreStarted();
      await networkRestoreCanResolve;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(
          restoredCompletedProject({
            storyboard: restoredStoryboard({ coreSignedUrl: refreshedImageDataUrl })
          })
        )
      });
    });

    await page.goto("/storycam/core-storyboard");
    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveAttribute("src", imageDataUrl);

    await page.reload();
    await networkRestoreStarted;

    await expect(page.getByRole("heading", { name: "核心分镜" })).toBeVisible();
    await expect(page.getByText("正在恢复你上次生成的故事。")).toBeHidden();
    releaseNetworkRestore();
  });

  test("clears cached storyboard when network restore confirms there is no current project", async ({ page }) => {
    let currentRestoreCalls = 0;
    let selectedRestoreCalls = 0;
    let releaseSelectedRestore!: () => void;
    let markSelectedRestoreStarted!: () => void;
    const selectedRestoreCanResolve = new Promise<void>((resolve) => {
      releaseSelectedRestore = resolve;
    });
    const selectedRestoreStarted = new Promise<void>((resolve) => {
      markSelectedRestoreStarted = resolve;
    });

    await mockAuthenticated(page);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      currentRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(currentRestoreCalls === 1 ? restoredCompletedProject() : { ok: true, restored: false })
      });
    });
    await page.route("**/api/storycam-sessions/session-restored-2/restore", async (route) => {
      selectedRestoreCalls += 1;
      markSelectedRestoreStarted();
      await selectedRestoreCanResolve;
      await route.fulfill({
        contentType: "application/json",
        status: 404,
        body: JSON.stringify({
          error: "not_found",
          redactedError: "StoryCam project was not found.",
          redactionApplied: true
        })
      });
    });

    await page.goto("/storycam/core-storyboard");
    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveAttribute("src", imageDataUrl);

    await page.reload();
    await selectedRestoreStarted;
    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveAttribute("src", imageDataUrl);

    releaseSelectedRestore();

    await expect(page.getByRole("heading", { name: "私人小剧场相机" })).toBeVisible();
    await expect(page.getByText("上次项目已不可用，可以重新开始。")).toBeVisible();
    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveCount(0);
    await expect(page).toHaveURL(/\/storycam\/input$/);
    expect(currentRestoreCalls).toBe(2);
    expect(selectedRestoreCalls).toBe(1);
  });

  test("does not extend reused signed URL cache expiry across a network restore", async ({ page }) => {
    await mockAuthenticated(page);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(
          restoredCompletedProject({
            storyboard: restoredStoryboard({ coreSignedUrl: imageDataUrl, coreSignedUrlExpiresIn: 35 })
          })
        )
      });
    });
    await page.route("**/api/storycam-sessions/session-restored-2/restore", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(
          restoredCompletedProject({
            storyboard: restoredStoryboard({ coreSignedUrl: refreshedImageDataUrl, coreSignedUrlExpiresIn: 35 })
          })
        )
      });
    });

    await page.goto("/storycam/core-storyboard");
    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveAttribute("src", imageDataUrl);
    const originalExpiresAt = await restoreCacheExpiresAt(page, "session-restored-2");

    await page.waitForTimeout(1_500);
    await page.reload();

    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveAttribute("src", imageDataUrl);
    const refreshedExpiresAt = await restoreCacheExpiresAt(page, "session-restored-2");
    expect(refreshedExpiresAt).toBeLessThanOrEqual(originalExpiresAt);
  });

  test("refreshes restored media signed URLs after the session storage cache expires", async ({ page }) => {
    let currentRestoreCalls = 0;
    let selectedRestoreCalls = 0;
    await mockAuthenticated(page);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      currentRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(
          restoredCompletedProject({
            storyboard: restoredStoryboard({ coreSignedUrl: imageDataUrl })
          })
        )
      });
    });
    await page.route("**/api/storycam-sessions/session-restored-2/restore", async (route) => {
      selectedRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(
          restoredCompletedProject({
            storyboard: restoredStoryboard({ coreSignedUrl: refreshedImageDataUrl })
          })
        )
      });
    });

    await page.goto("/storycam/core-storyboard");
    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveAttribute("src", imageDataUrl);
    await expireRestoreCache(page);
    await page.reload();

    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveAttribute("src", refreshedImageDataUrl);
    expect(currentRestoreCalls).toBe(1);
    expect(selectedRestoreCalls).toBe(1);
  });

  test("does not hydrate cached private restore data after the user becomes anonymous", async ({ page }) => {
    let isAuthenticated = true;
    let currentRestoreCalls = 0;
    let selectedRestoreCalls = 0;
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(
          isAuthenticated
            ? { authenticated: true, user: { email: "user@example.com", id: "user-1" } }
            : { authenticated: false, user: null }
        )
      });
    });
    await page.route("**/api/storycam-sessions/current", async (route) => {
      currentRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(restoredCompletedProject())
      });
    });
    await page.route("**/api/storycam-sessions/session-restored-2/restore", async (route) => {
      selectedRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(restoredCompletedProject())
      });
    });

    await page.goto("/storycam/core-storyboard");
    await expect(page.getByRole("heading", { name: "核心分镜" })).toBeVisible();
    await expect(page.getByAltText("未发送短信 主分镜图")).toBeVisible();

    isAuthenticated = false;
    await page.reload();

    await expect(page.getByRole("heading", { name: "私人小剧场相机" })).toBeVisible();
    await expect(page.getByAltText("未发送短信 主分镜图")).toHaveCount(0);
    expect(currentRestoreCalls).toBe(1);
    expect(selectedRestoreCalls).toBe(0);
  });

  test("falls back to the current session when the stored restore target is stale", async ({ page }) => {
    let staleRestoreCalls = 0;
    let currentRestoreCalls = 0;
    await mockAuthenticated(page);
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        "storycam:restore:v1:current-session-id",
        JSON.stringify({ sessionId: "session-deleted", userId: "user-1" })
      );
    });
    await page.route("**/api/storycam-sessions/session-deleted/restore", async (route) => {
      staleRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 404,
        body: JSON.stringify({
          error: "not_found",
          redactedError: "StoryCam project was not found.",
          redactionApplied: true
        })
      });
    });
    await page.route("**/api/storycam-sessions/current", async (route) => {
      currentRestoreCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify(restoredCompletedProject())
      });
    });

    await page.goto("/storycam/core-storyboard");

    await expect(page.getByRole("heading", { name: "核心分镜" })).toBeVisible();
    await expect(page.getByAltText("未发送短信 主分镜图")).toBeVisible();
    expect(staleRestoreCalls).toBe(1);
    expect(currentRestoreCalls).toBe(1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = window.sessionStorage.getItem("storycam:restore:v1:current-session-id");
          return raw ? (JSON.parse(raw) as { sessionId?: string }).sessionId : null;
        })
      )
      .toBe("session-restored-2");
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

  test("maps legacy clip review and export routes into the merged clip generation workbench", async ({ page }) => {
    await mockAuthenticated(page);
    await mockRestore(page, {
      clipJob: restoredClipJob(),
      coreGroupTargetCount: 1,
      currentStep: "export",
      finalWork: restoredFinalWork(),
      ok: true,
      restored: true,
      sessionId: "session-restored-2",
      storyboard: restoredStoryboard(),
      storyWorld: restoredStoryWorld(),
      storyWorldConfirmed: true
    });

    await page.goto("/storycam/export");

    await expect(page).toHaveURL(/\/storycam\/clip-generation$/);
    await expect(page.getByRole("heading", { name: "生成片段" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "账号内预览已保存" })).toBeVisible();
    await expect(page.locator("video.storycam-clip-video")).toBeVisible();
    await expect(page.getByRole("button", { name: "导出 MP4" })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "查看" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "打开最终作品" })).toHaveCount(0);
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
        projects: [recentProject()]
      })
    });
  });
}

function recentProject(overrides: Partial<ReturnType<typeof recentProjectShape>> = {}) {
  return {
    ...recentProjectShape(),
    ...overrides
  };
}

function recentProjectShape() {
  return {
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
    updatedAt: "2026-04-28T10:00:00.000Z",
    videoAspectRatio: "16:9"
  };
}

async function expireRestoreCache(page: Page) {
  await page.evaluate(() => {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);

      if (!key?.startsWith("storycam:restore:v1:session:")) {
        continue;
      }

      const raw = window.sessionStorage.getItem(key);

      if (!raw) {
        continue;
      }

      const entry = JSON.parse(raw) as { expiresAtMs: number };
      entry.expiresAtMs = Date.now() - 1000;
      window.sessionStorage.setItem(key, JSON.stringify(entry));
    }
  });
}

async function restoreCacheExpiresAt(page: Page, sessionId: string) {
  return page.evaluate((targetSessionId) => {
    const raw = window.sessionStorage.getItem(`storycam:restore:v1:session:${targetSessionId}`);

    if (!raw) {
      throw new Error("restore_cache_missing");
    }

    return (JSON.parse(raw) as { expiresAtMs: number }).expiresAtMs;
  }, sessionId);
}

async function staleRecentProjectsCache(page: Page) {
  await page.evaluate(() => {
    const raw = window.sessionStorage.getItem("storycam:recent-projects:v1:projects");

    if (!raw) {
      throw new Error("recent_projects_cache_missing");
    }

    const entry = JSON.parse(raw) as { fetchedAtMs: number };
    entry.fetchedAtMs = Date.now() - 46_000;
    window.sessionStorage.setItem("storycam:recent-projects:v1:projects", JSON.stringify(entry));
  });
}

function restoredCompletedProject(overrides: Partial<ReturnType<typeof restoredCompletedProjectShape>> = {}) {
  return {
    ...restoredCompletedProjectShape(),
    ...overrides
  };
}

function restoredCompletedProjectShape() {
  return {
    clipJob: restoredClipJob(),
    coreGroupTargetCount: 1,
    currentStep: "export",
    finalWork: restoredFinalWork(),
    ok: true,
    restored: true,
    sessionId: "session-restored-2",
    storyboard: restoredStoryboard(),
    storyWorld: restoredStoryWorld("session-restored-2"),
    storyWorldConfirmed: true
  };
}

function restoredStoryWorld(sessionId = "session-restored-1") {
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
    sessionId,
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

function restoredStoryboard(options: { coreSignedUrl?: string; coreSignedUrlExpiresIn?: number } = {}) {
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
            signedUrl: options.coreSignedUrl ?? imageDataUrl,
            signedUrlExpiresIn: options.coreSignedUrlExpiresIn ?? 300,
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

function restoredClipJob() {
  return {
    attempts: 0,
    id: "job-restored-final",
    outputArtifactId: "clip-artifact-restored",
    outputPreview: {
      durationSeconds: 15,
      mimeType: "video/mp4",
      signedUrl: "data:video/mp4;base64,AAAA",
      signedUrlExpiresIn: 300
    },
    providerKind: "video",
    providerName: "mock",
    sessionId: "session-restored-2",
    status: "succeeded",
    type: "video_clip"
  };
}

function restoredFinalWork() {
  return {
    finalWork: { id: "final-work-restored", state: "ready", type: "final_work", version: 1 },
    media: { byteSize: 1024, id: "media-final-restored", kind: "final_work", mimeType: "video/mp4" },
    ok: true,
    preview: {
      durationSeconds: 15,
      mimeType: "video/mp4",
      signedUrl: "data:video/mp4;base64,AAAA",
      signedUrlExpiresIn: 300
    }
  };
}
