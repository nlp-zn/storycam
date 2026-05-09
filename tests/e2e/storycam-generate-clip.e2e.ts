import { expect, test } from "@playwright/test";
import { mockAuthenticated } from "./helpers/auth";

test.describe("StoryCam generate clip", () => {
  test("clip generation requires one-sentence confirmation and supports cancel and retry", async ({ page }) => {
    let generateCalls = 0;

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
            coreStoryboardGroups: [{ id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }],
            expandedStoryboardCards: expandedStoryboardCardRefs(),
            storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
            storyboardScripts: [{ id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }]
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
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          expandedStoryboardCards: [
            { id: "expanded-1", parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 }
          ],
          expansionCards: [expansionCardsFixture()[0]],
          ok: true,
          sessionId: "session-1"
        })
      });
    });

    await page.route("**/api/storyboard-groups/*/generate-clip", async (route) => {
      generateCalls += 1;
      const body = route.request().postDataJSON() as {
        confirmedArtifactVersions: Record<string, number>;
        providerSendConfirmed: boolean;
      };

      expect(body.providerSendConfirmed).toBe(true);
      expect(body.confirmedArtifactVersions).toEqual({
        "core-artifact-1": 1,
        ...Object.fromEntries(expandedStoryboardCardRefs().map((card) => [card.id, card.version]))
      });

      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          confirmationSummary: "Use \"未发送短信\" to generate one private 15 second clip.",
          jobId: `job-${generateCalls}`,
          ok: true,
          status: "queued"
        })
      });
    });

    await page.route("**/api/generation-jobs/job-*/cancel", async (route) => {
      const jobId = route.request().url().includes("job-2") ? "job-2" : "job-1";

      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          jobId,
          ok: true,
          status: "canceled"
        })
      });
    });

    await page.route("**/api/generation-jobs/job-*", async (route) => {
      const jobId = route.request().url().includes("job-2") ? "job-2" : "job-1";

      if (route.request().url().includes("/cancel")) {
        await route.fulfill({
          contentType: "application/json",
          status: 200,
          body: JSON.stringify({
            jobId,
            ok: true,
            status: "canceled"
          })
        });
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          job: {
            attempts: 0,
            id: jobId,
            providerKind: "video",
            providerName: "mock",
            sessionId: "session-1",
            status: "queued",
            type: "video_clip"
          },
          ok: true
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();
    await page.getByRole("button", { name: "用这一组生成片段" }).click();

    await expect(page.getByText("用「未发送短信」生成一个约 15 秒的私人片段。")).toBeVisible();
    expect(generateCalls).toBe(0);
    await expect(page.getByText("redactedPromptSummary")).toHaveCount(0);

    await page.getByRole("button", { name: "确认发送生成片段" }).click();
    await expect(page).toHaveURL(/\/storycam\/clip-generation$/);
    await expect(page.getByRole("heading", { name: "生成片段" })).toBeVisible();
    await expect(page.getByText("任务 job-1")).toBeVisible();
    expect(generateCalls).toBe(1);

    await page.getByRole("button", { name: "取消生成" }).click();
    await expect(page.getByText("已取消", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "重试" }).click();
    await expect(page.getByText("任务 job-2")).toBeVisible();
    expect(generateCalls).toBe(2);
  });

  test("deleting a story with a running clip job discards late clip results", async ({ page }) => {
    let cancelCalls = 0;
    let deleteCalls = 0;
    let releaseLateResult: (() => void) | undefined;
    const lateRequestStarted = new Promise<void>((resolve) => {
      page.route("**/api/generation-jobs/job-delete**", async (route) => {
        if (route.request().url().endsWith("/cancel")) {
          cancelCalls += 1;
          await route.fulfill({
            contentType: "application/json",
            status: 200,
            body: JSON.stringify({
              jobId: "job-delete",
              ok: true,
              status: "canceled"
            })
          });
          return;
        }

        resolve();
        await new Promise<void>((lateResolve) => {
          releaseLateResult = lateResolve;
        });
        await route.fulfill({
          contentType: "application/json",
          status: 200,
          body: JSON.stringify({
            job: {
              attempts: 1,
              id: "job-delete",
              outputArtifactId: "clip-artifact-late",
              providerKind: "video",
              providerName: "mock",
              sessionId: "session-delete",
              status: "succeeded",
              type: "video_clip"
            },
            ok: true
          })
        });
      });
    });

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
          sessionId: "session-delete",
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
            coreStoryboardGroups: [{ id: "core-artifact-1", state: "ready", type: "core_storyboard_group", version: 1 }],
            expandedStoryboardCards: expandedStoryboardCardRefs(),
            storyboardScript: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
            storyboardScripts: [{ id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 }]
          },
          durationPlan: {
            clipDurationTargets: [15],
            coreGroupTargetCount: 1,
            plannedDurationSeconds: 15
          },
          ok: true,
          sessionId: "session-delete",
          storyboard: storyboardFixture()
        })
      });
    });

    await page.route("**/api/storyboard-groups/*/expand", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          expandedStoryboardCards: [
            { id: "expanded-1", parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 }
          ],
          expansionCards: [expansionCardsFixture()[0]],
          ok: true,
          sessionId: "session-delete"
        })
      });
    });

    await page.route("**/api/storyboard-groups/*/generate-clip", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          confirmationSummary: "Use \"未发送短信\" to generate one private 15 second clip.",
          jobId: "job-delete",
          ok: true,
          status: "running"
        })
      });
    });

    await page.route("**/api/storycam-sessions/session-delete", async (route) => {
      deleteCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          bucketsTouched: ["storycam-generated"],
          ok: true,
          removedObjectCount: 1,
          sessionId: "session-delete",
          skippedObjectCount: 0
        })
      });
    });

    await page.goto("/");
    await page.getByLabel("你的这一幕").fill("我想把暗恋拍成韩剧雨夜，停在便利店门口");
    await page.getByRole("button", { name: "生成故事雏形" }).click();
    await page.getByRole("button", { name: "对，生成核心分镜" }).click();
    await page.getByRole("button", { name: "用这一组生成片段" }).click();
    await page.getByRole("button", { name: "确认发送生成片段" }).click();
    await expect(page.getByText("任务 job-delete")).toBeVisible();

    await lateRequestStarted;
    await page.getByRole("button", { name: "删除这个故事" }).click();
    await expect(page.getByText("这个故事已删除，可以重新开始。")).toBeVisible();

    expect(cancelCalls).toBe(1);
    expect(deleteCalls).toBe(1);

    releaseLateResult?.();
    await expect(page.getByRole("heading", { name: "私人小剧场相机" })).toBeVisible();
    await expect(page.getByText("clip-artifact-late")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "片段已生成" })).toHaveCount(0);
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
        expandedStoryboardImages: Array.from({ length: 8 }, (_, index) => readyImage(`media-expanded-${index + 1}`)),
        representativeImage: placeholderImage(),
        scriptArtifact: { id: "storyboard-artifact-1", state: "ready", type: "storyboard_script", version: 1 },
        storyPurpose: "建立她和未发送短信之间的私人情绪。",
        title: "未发送短信",
        version: 1
      }
    ],
    storyboardScript: {
      planSummary: "用几个克制的雨夜时刻讲完一次没有说出口的暗恋。",
      plannedDurationSeconds: 15,
      rhythm: "慢进入，短暂停顿，安静离开",
      tone: "韩剧雨夜，私人回忆",
      version: 1
    }
  };
}

function placeholderImage() {
  return {
    placeholder: true,
    status: "placeholder"
  };
}

function readyImage(mediaId: string) {
  return {
    mediaId,
    mimeType: "image/png",
    placeholder: false,
    signedUrl: `https://storycam.test/${mediaId}.png`,
    signedUrlExpiresIn: 300,
    status: "ready"
  };
}

function expandedStoryboardCardRefs() {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `expanded-${index + 1}`,
    parentArtifactId: "core-artifact-1",
    state: "ready",
    type: "expanded_storyboard_card",
    version: 1
  }));
}

function expansionCardsFixture() {
  return [
    {
      beatType: "enter",
      description: "她停在便利店门外，雨伞压低，手机屏幕映出未发送的短信。",
      guidance: "动作很小，重点是手指停顿和雨声。",
      sortOrder: 0,
      title: "门外停住",
      version: 1
    }
  ];
}
