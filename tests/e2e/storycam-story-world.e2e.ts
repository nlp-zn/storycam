import { expect, test } from "@playwright/test";

test.describe("StoryCam story world", () => {
  test("story world must be confirmed before storyboard generation and edits stale downstream work", async ({ page }) => {
    await page.route("**/api/story-world", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            characterAssets: [{ id: "character-artifact-1", state: "ready", type: "character_asset", version: 1 }],
            sceneAssets: [{ id: "scene-artifact-1", state: "ready", type: "scene_asset", version: 1 }],
            script: { id: "script-artifact-1", state: "ready", type: "script", version: 1 }
          },
          ok: true,
          sessionId: "session-1",
          storyWorld: storyWorldFixture()
        })
      });
    });

    await page.route("**/api/storyboard", async (route) => {
      const body = route.request().postDataJSON() as {
        confirmedArtifactVersions: Record<string, number>;
        sessionId: string;
      };

      expect(body.sessionId).toBe("session-1");
      expect(body.confirmedArtifactVersions).toEqual({
        "character-artifact-1": 1,
        "scene-artifact-1": 1,
        "script-artifact-1": 1
      });

      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            coreStoryboardGroups: [{ id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }],
            storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }
          },
          durationPlan: {
            clipDurationTargets: [4, 4, 4],
            coreGroupTargetCount: 3,
            plannedDurationSeconds: 12
          },
          ok: true,
          sessionId: "session-1"
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();

    await expect(page.getByRole("heading", { name: "雨夜未发送" })).toBeVisible();
    await expect(page.getByText("我的剧本")).toBeVisible();
    await expect(page.getByText("人物", { exact: true })).toBeVisible();
    await expect(page.getByText("地点", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "生成核心分镜" })).toBeDisabled();

    await page.getByRole("button", { name: "对，继续拍这一段" }).click();
    await expect(page.getByRole("button", { name: "生成核心分镜" })).toBeEnabled();
    await page.getByRole("button", { name: "生成核心分镜" }).click();
    await expect(page.getByText("分镜已准备好：3 个核心分镜组。")).toBeVisible();

    await page.getByRole("button", { name: "改剧本" }).click();
    await page.getByLabel("我的剧本内容").fill("她决定走进便利店，把伞递给他。");
    await page.getByRole("button", { name: "保存修改" }).click();

    await expect(page.getByText("分镜已过期，需要重新确认故事世界。")).toBeVisible();
    await expect(page.getByRole("button", { name: "生成核心分镜" })).toBeDisabled();
  });
});

function storyWorldFixture() {
  return {
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
  };
}
