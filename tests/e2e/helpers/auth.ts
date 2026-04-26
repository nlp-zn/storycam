import type { Page } from "@playwright/test";

export async function mockAuthenticated(page: Page) {
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
