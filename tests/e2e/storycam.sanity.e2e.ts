import { expect, test } from "@playwright/test";

test.describe("StoryCam app shell", () => {
  test("renders the creation surface", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "私人小剧场相机" })).toBeVisible();
    await expect(page.getByRole("button", { name: "生成故事雏形" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "StoryCam steps" })).toHaveCount(0);
    await expect(page.getByText("第一步：核心前提")).toBeVisible();
    await expect(page.getByTestId("story-idea-params").getByRole("button", { name: "移除 像私人回忆" })).toBeVisible();

    await page.getByRole("button", { name: "少说话" }).click();
    await expect(page.getByTestId("story-idea-params").getByRole("button", { name: "移除 少说话" })).toBeVisible();
  });

  test("exposes robots and sitemap routes", async ({ page }) => {
    await page.goto("/robots.txt");
    await expect(page.getByText("Sitemap:")).toBeVisible();

    await page.goto("/sitemap.xml");
    await expect(page.getByText("<urlset", { exact: false })).toBeVisible();
  });
});
