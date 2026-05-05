import { expect, test } from "@playwright/test";
import { mockAuthenticated } from "./helpers/auth";

test.describe("StoryCam expansion", () => {
  test("expansion canvas keeps the selected core group and stable waiting slots", async ({ page }) => {
    let expansionRequestedFor = "";
    let regenerateRequestedFor = "";

    await mockAuthenticated(page);
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
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          artifacts: {
            coreStoryboardGroups: [
              { id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }
            ],
            storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
            storyboardScripts: [
              { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }
            ]
          },
          durationPlan: {
            clipDurationTargets: [15],
            coreGroupTargetCount: 1,
            plannedDurationSeconds: 15
          },
          ok: true,
          sessionId: "session-1",
          storyboard: storyboardFixture()
        })
      });
    });

    await page.route("**/api/storyboard-groups/*/expand", async (route) => {
      expansionRequestedFor = route.request().url();
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          expandedStoryboardCards: [
            { id: "expanded-1", parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
            { id: "expanded-2", parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
            { id: "expanded-3", parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
            { id: "expanded-4", parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
            { id: "expanded-5", parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
            { id: "expanded-6", parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
            { id: "expanded-7", parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
            { id: "expanded-8", parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 }
          ],
          expandedStoryboardImages: [readyImage("media-frame-2"), ...Array.from({ length: 7 }, (_, index) => generatingImage(`job-frame-${index + 3}`))],
          expansionCards: expansionCardsFixture(),
          ok: true,
          sessionId: "session-1"
        })
      });
    });
    await page.route("**/api/storyboard-groups/*/frames/*/regenerate-image", async (route) => {
      regenerateRequestedFor = route.request().url();
      await route.fulfill({
        contentType: "application/json",
        status: 202,
        body: JSON.stringify({
          frameNumber: 6,
          image: { jobId: "job-frame-6", placeholder: true, status: "generating" },
          ok: true,
          sessionId: "session-1"
        })
      });
    });
    await page.route("**/api/generation-jobs/job-frame-6", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          image: { jobId: "job-frame-6", placeholder: true, status: "generating" },
          job: {
            attempts: 0,
            id: "job-frame-6",
            outputArtifactId: "expanded-5",
            providerKind: "image",
            providerName: "inference_sh",
            sessionId: "session-1",
            status: "running",
            type: "expanded_storyboard_image"
          },
          ok: true
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();
    await page.getByRole("button", { name: "打开 9 帧画布" }).click();

    await expect(page).toHaveURL(/\/storycam\/core-storyboard$/);
    const dialog = page.getByRole("dialog", { name: /未发送短信 9 帧分镜画布/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "未发送短信" }).first()).toBeVisible();
    await expect(dialog.getByTestId("storyboard-frame-01")).toBeVisible();
    await expect(dialog.getByTestId("storyboard-frame-02")).toHaveCount(0);
    await dialog.getByRole("button", { name: "点击中心主图生成扩展分镜" }).click();
    await expect(dialog.getByTestId("storyboard-frame-02").getByRole("heading", { name: "门外停住" })).toBeVisible();
    await expect(dialog.getByTestId("storyboard-frame-03").getByRole("heading", { name: "听见门铃" })).toBeVisible();
    await expect(dialog.getByTestId("storyboard-frame-04").getByRole("heading", { name: "删掉那句" })).toBeVisible();
    await expect(dialog.getByTestId("storyboard-frame-03").getByText("生成中")).toBeVisible();
    await expect(dialog.getByTestId("storyboard-frame-01").getByText("01")).toBeVisible();
    await expect(dialog.getByTestId("storyboard-frame-09").getByText("09")).toBeVisible();
    await dialog.getByRole("button", { name: "查看第 02 帧大图" }).click();
    const preview = page.getByRole("dialog", { name: /第 02 帧大图/ });
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("heading", { name: "门外停住" })).toBeVisible();
    await expect(preview.getByRole("button", { name: "下一张" })).toBeDisabled();
    await preview.getByRole("button", { name: "关闭" }).click();
    await expect(page.getByRole("button", { name: "收起" })).toBeVisible();
    expect(expansionRequestedFor).toContain("/api/storyboard-groups/core-artifact-1/expand");
    await dialog.getByRole("button", { name: "重生成第 06 帧" }).click();
    expect(regenerateRequestedFor).toContain("/api/storyboard-groups/core-artifact-1/frames/6/regenerate-image");
    await expect(dialog.getByRole("textbox")).toHaveCount(0);

    await dialog.getByRole("button", { name: "用这一组生成片段" }).click();
    await expect(page.getByText("用「未发送短信」生成一个约 15 秒的私人片段。")).toBeVisible();
    await expect(page.getByRole("button", { name: "确认发送生成片段" })).toBeVisible();
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

function storyboardFixture() {
  return {
    coreStoryboardGroups: [
      {
        emotionalTurn: "想说出口",
        estimatedClipDurationSeconds: 15,
        expandedStoryboardImages: [],
        representativeImage: placeholderImage(),
        scriptArtifact: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
        storyPurpose: "建立她和未发送短信之间的私人情绪。",
        title: "未发送短信",
        version: 1
      },
      {
        emotionalTurn: "靠近但错过",
        estimatedClipDurationSeconds: 15,
        expandedStoryboardImages: [],
        representativeImage: placeholderImage(),
        scriptArtifact: { id: "storyboard-artifact-2", state: "ready", type: "storyboard_script", version: 1 },
        storyPurpose: "让对方靠近，但仍然不让告白真正发生。",
        title: "玻璃反光",
        version: 1
      },
      {
        emotionalTurn: "把话收回去",
        estimatedClipDurationSeconds: 15,
        expandedStoryboardImages: [],
        representativeImage: placeholderImage(),
        scriptArtifact: { id: "storyboard-artifact-3", state: "ready", type: "storyboard_script", version: 1 },
        storyPurpose: "用删除短信完成这段记忆的收束。",
        title: "擦肩而过",
        version: 1
      }
    ],
    storyboardScript: {
      planSummary: "用几个克制的雨夜时刻讲完一次没有说出口的暗恋。",
      plannedDurationSeconds: 45,
      rhythm: "慢进入，短暂停顿，安静离开",
      tone: "韩剧雨夜，私人回忆",
      version: 1
    }
  };
}

function expansionCardsFixture() {
  return [
    {
      beatType: "enter",
      canvasPosition: "top-left",
      description: "她停在便利店门外，雨伞压低，手机屏幕映出未发送的短信。",
      frameNumber: 2,
      guidance: "动作很小，重点是手指停顿和雨声。",
      image: readyImage("media-frame-2"),
      imagePrompt: "Cinematic storyboard still frame 2.",
      sortOrder: 0,
      title: "门外停住",
      version: 1
    },
    {
      beatType: "reaction",
      canvasPosition: "top",
      description: "门铃响起，她下意识抬眼，又立刻低头。",
      frameNumber: 3,
      guidance: "不需要对白，用眼神和玻璃反光完成情绪。",
      image: generatingImage("job-frame-3"),
      imagePrompt: "Cinematic storyboard still frame 3.",
      sortOrder: 1,
      title: "听见门铃",
      version: 1
    },
    {
      beatType: "emotion",
      canvasPosition: "top-right",
      description: "两人的倒影短暂重叠，短信被删掉。",
      frameNumber: 4,
      guidance: "最后一秒留给空白屏幕和没说出口的呼吸。",
      image: generatingImage("job-frame-4"),
      imagePrompt: "Cinematic storyboard still frame 4.",
      sortOrder: 2,
      title: "删掉那句",
      version: 1
    },
    {
      beatType: "atmosphere",
      canvasPosition: "left",
      description: "雨水在伞面和便利店灯牌之间连成一层薄雾。",
      frameNumber: 5,
      guidance: "让环境替人物说话。",
      image: generatingImage("job-frame-5"),
      imagePrompt: "Cinematic storyboard still frame 5.",
      sortOrder: 3,
      title: "雨声压低",
      version: 1
    },
    {
      beatType: "action",
      canvasPosition: "right",
      description: "她把手机扣到掌心，伞柄轻轻偏向路边。",
      frameNumber: 6,
      guidance: "动作小，不夸张。",
      image: generatingImage("job-frame-6"),
      imagePrompt: "Cinematic storyboard still frame 6.",
      sortOrder: 4,
      title: "手机扣住",
      version: 1
    },
    {
      beatType: "transition",
      canvasPosition: "bottom-left",
      description: "车灯扫过玻璃，两人的倒影被雨线切开。",
      frameNumber: 7,
      guidance: "作为中心图后的转场补充。",
      image: generatingImage("job-frame-7"),
      imagePrompt: "Cinematic storyboard still frame 7.",
      sortOrder: 5,
      title: "车灯切开",
      version: 1
    },
    {
      beatType: "reaction",
      canvasPosition: "bottom",
      description: "她听到脚步声，却只看向伞尖滴落的水。",
      frameNumber: 8,
      guidance: "用回避表达紧张。",
      image: generatingImage("job-frame-8"),
      imagePrompt: "Cinematic storyboard still frame 8.",
      sortOrder: 6,
      title: "不敢抬头",
      version: 1
    },
    {
      beatType: "continuation",
      canvasPosition: "bottom-right",
      description: "街对面的人走远，手机屏幕暗下去。",
      frameNumber: 9,
      guidance: "给片段留一个安静结尾。",
      image: generatingImage("job-frame-9"),
      imagePrompt: "Cinematic storyboard still frame 9.",
      sortOrder: 7,
      title: "屏幕暗下",
      version: 1
    }
  ];
}

function placeholderImage() {
  return {
    placeholder: true,
    status: "placeholder"
  };
}

function generatingImage(jobId: string) {
  return {
    jobId,
    placeholder: true,
    status: "generating"
  };
}

function readyImage(mediaId: string) {
  return {
    mediaId,
    mimeType: "image/png",
    placeholder: false,
    signedUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%2300f0ff'/%3E%3C/svg%3E",
    signedUrlExpiresIn: 300,
    status: "ready"
  };
}
