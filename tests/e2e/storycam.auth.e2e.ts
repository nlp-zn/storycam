import { expect, test } from "@playwright/test";

test.describe("auth foundation", () => {
  test("shows Google login entry point", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "使用 Google 登录" })).toBeVisible();
    await expect(page.getByText("保存到你的账号")).toBeVisible();
  });

  test("keeps real creation disabled until the user signs in", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "生成故事雏形" })).toBeDisabled();
    await expect(page.getByText("登录后才能上传照片和生成真实故事。你可以先编辑想法。")).toBeVisible();
  });

  test("reports unauthenticated server state without exposing internals", async ({ request }) => {
    const response = await request.get("/api/auth/me");

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({
      authenticated: false,
      user: null
    });
  });
});
