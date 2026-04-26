import { expect, test } from "@playwright/test";

test.describe("auth foundation", () => {
  test("shows Google login entry point", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "使用 Google 登录" })).toBeVisible();
    await expect(page.getByText("保存到你的账号")).toBeVisible();
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
