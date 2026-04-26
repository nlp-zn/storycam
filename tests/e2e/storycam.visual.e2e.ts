import { expect, test } from "@playwright/test";

test.describe("StoryCam visual smoke", () => {
  test("homepage has visible non-empty desktop and mobile states", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "私人小剧场相机" })).toBeVisible();

    const desktopScreenshot = await page.screenshot();
    expect(desktopScreenshot.byteLength).toBeGreaterThan(20_000);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "生成故事雏形" })).toBeVisible();

    const mobileScreenshot = await page.screenshot();
    expect(mobileScreenshot.byteLength).toBeGreaterThan(20_000);
  });
});
