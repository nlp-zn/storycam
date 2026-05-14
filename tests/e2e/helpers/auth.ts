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
  await page.route("**/api/storycam-discovery-samples", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        assets: Array.from({ length: 8 }, (_, index) => {
          const id = `sample-${String(index + 1).padStart(2, "0")}`;

          return {
            id,
            posterUrl: "/storycam/discovery/rainy-night-unsent.png",
            signedUrlExpiresIn: 300,
            videoUrl: "/storycam/discovery/videos/rainy-night-unsent.mp4"
          };
        }),
        ok: true,
        signedUrlExpiresIn: 300,
        unavailableIds: []
      })
    });
  });
}
