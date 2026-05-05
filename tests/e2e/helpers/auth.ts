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
  await page.route("**/api/storycam-sessions/current", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        ok: true,
        restored: false
      })
    });
  });
  await page.route("**/api/storycam-sessions/recent?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        ok: true,
        projects: []
      })
    });
  });
}
