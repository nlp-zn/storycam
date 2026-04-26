import { expect, test } from "@playwright/test";

test.describe("StoryCam app shell", () => {
  test("renders the creation surface", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "私人小剧场相机" })).toBeVisible();
    await expect(page.getByRole("button", { name: "生成故事世界" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "故事世界" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "片段时间线" })).toBeVisible();
  });

  test("exposes robots and sitemap routes", async ({ page }) => {
    await page.goto("/robots.txt");
    await expect(page.getByText("Sitemap:")).toBeVisible();

    await page.goto("/sitemap.xml");
    await expect(page.getByText("<urlset", { exact: false })).toBeVisible();
  });
});
