import { expect, test, type Page } from "@playwright/test";

test.describe("auth foundation", () => {
  test("shows a single account login entry and removes the inert online badge", async ({ page }) => {
    await mockAnonymous(page);
    await page.goto("/");

    await expect(page.getByText("在线")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /账号/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "使用 Google 登录", exact: true })).toHaveCount(0);
    await expect(page.getByText("保存到你的账号")).toHaveCount(0);
  });

  test("starts Google OAuth from the account button with the current callback origin", async ({ page }) => {
    await mockAnonymous(page);
    await page.route("**/auth/v1/authorize**", async (route) => {
      await route.fulfill({
        body: "<!doctype html><title>OAuth</title>",
        contentType: "text/html",
        status: 200
      });
    });

    await page.goto("/");
    const callbackOrigin = new URL(page.url()).origin;
    await page.getByRole("button", { name: "账号，使用 Google 登录" }).click();
    await page.waitForURL(/\/auth\/v1\/authorize/);

    const oauthUrl = new URL(page.url());
    expect(oauthUrl.pathname).toBe("/auth/v1/authorize");
    expect(oauthUrl.searchParams.get("provider")).toBe("google");
    expect(oauthUrl.searchParams.get("redirect_to")).toBe(`${callbackOrigin}/auth/callback`);
  });

  test("keeps real creation disabled until the user signs in", async ({ page }) => {
    await mockAnonymous(page);
    await page.goto("/");

    await expect(page.getByRole("button", { name: "生成故事雏形" })).toBeDisabled();
    await expect(page.getByText("登录后才能上传照片和生成真实故事。你可以先编辑想法。")).toBeVisible();
  });

  test("shows a sign-out account action after authentication", async ({ page }) => {
    await mockAuthenticated(page);
    await page.goto("/");

    const accountButton = page.getByRole("button", { name: "账号 user@example.com" });
    await expect(accountButton).toBeVisible();
    await expect(accountButton).toBeEnabled();
    await expect(accountButton).not.toHaveText(/账号/);
    await expect(accountButton).not.toHaveText(/user@example\.com/);
    await expect(page.getByRole("menuitem", { name: "退出" })).toHaveCount(0);

    await accountButton.click();

    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByText("user@example.com")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "退出" })).toBeVisible();
  });

  test("signs out from the account button", async ({ page }) => {
    let isAuthenticated = true;
    await mockAuthState(page, () => isAuthenticated);
    await page.route("**/api/storycam-sessions/current", async (route) => {
      await route.fulfill({
        body: JSON.stringify({ ok: true, restored: false }),
        contentType: "application/json",
        status: 200
      });
    });
    await page.route("**/api/storycam-sessions/recent?*", async (route) => {
      await route.fulfill({
        body: JSON.stringify({ ok: true, projects: [] }),
        contentType: "application/json",
        status: 200
      });
    });
    await page.route("**/api/auth/sign-out", async (route) => {
      isAuthenticated = false;
      await route.fulfill({
        body: JSON.stringify({ ok: true }),
        contentType: "application/json",
        status: 200
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "账号 user@example.com" }).click();
    await page.getByRole("menuitem", { name: "退出" }).click();

    await expect(page.getByRole("button", { name: "账号，使用 Google 登录" })).toBeVisible();
    await expect(page.getByText("登录后才能上传照片和生成真实故事。你可以先编辑想法。")).toBeVisible();
  });

  test("reports anonymous server state without exposing internals or logging an error", async ({ request }) => {
    const response = await request.get("/api/auth/me", {
      headers: {
        cookie: "storycam_local_auth_bypass_disabled=1"
      }
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      user: null
    });
  });
});

async function mockAnonymous(page: Page) {
  await mockAuthState(page, () => false);
}

async function mockAuthenticated(page: Page) {
  await mockAuthState(page, () => true);
  await page.route("**/api/storycam-sessions/current", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ ok: true, restored: false }),
      contentType: "application/json",
      status: 200
    });
  });
  await page.route("**/api/storycam-sessions/recent?*", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ ok: true, projects: [] }),
      contentType: "application/json",
      status: 200
    });
  });
  await page.route("**/api/storycam-discovery-samples", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ assets: [], ok: true, signedUrlExpiresIn: 300, unavailableIds: [] }),
      contentType: "application/json",
      status: 200
    });
  });
}

async function mockAuthState(page: Page, isAuthenticated: () => boolean) {
  await page.route("**/api/auth/me", async (route) => {
    const authenticated = isAuthenticated();

    await route.fulfill({
      body: JSON.stringify(
        authenticated
          ? { authenticated: true, user: { email: "user@example.com", id: "user-1" } }
          : { authenticated: false, user: null }
      ),
      contentType: "application/json",
      status: 200
    });
  });
}
