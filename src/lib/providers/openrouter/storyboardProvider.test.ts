import { describe, expect, it, vi } from "vitest";
import { createMockStoryWorldProvider } from "@/lib/providers/mock/storyWorldProvider";
import { buildOpenRouterStoryboardPrompt, createOpenRouterStoryboardProvider } from "./storyboardProvider";

vi.mock("server-only", () => ({}));

async function createStoryWorld() {
  const result = await createMockStoryWorldProvider().generate({
    idea: "我想把暗恋拍成韩剧雨夜",
    sessionId: "session-1"
  });

  if (!result.ok) {
    throw new Error("Expected mock story world fixture to be valid.");
  }

  return result.value;
}

describe("openrouter storyboard provider", () => {
  it("normalizes structured storyboard output into one 15 second MVP core group", async () => {
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        groups: [
          {
            emotionalTurn: "她终于抬头",
            mainImagePrompt: "Cinematic storyboard still, rainy convenience store, ordinary person looks up.",
            planSummary: "在屋檐下建立那句没发出去的话。",
            rhythm: "停住，点亮屏幕，抬头",
            storyPurpose: "让暗恋的迟疑变成可见动作。",
            title: "屋檐下的停顿",
            tone: "雨夜，克制"
          },
          {
            emotionalTurn: "两个人短暂同框",
            mainImagePrompt: "Cinematic storyboard still, glass reflection overlaps two ordinary people.",
            planSummary: "让错过发生在玻璃倒影里。",
            rhythm: "门铃，回头，错开",
            storyPurpose: "把靠近和错过放在同一个画面里。",
            title: "玻璃倒影",
            tone: "安静，遗憾"
          }
        ]
      }
    });
    const provider = createOpenRouterStoryboardProvider({
      apiKey: "openrouter-secret",
      generateObject,
      model: "deepseek/deepseek-v4-flash"
    });

    const result = await provider.generate({
      coreGroupTargetCount: 2,
      plannedDurationSeconds: 12,
      sessionId: "session-1",
      storyWorld: await createStoryWorld()
    });

    expect(result).toMatchObject({
      ok: true,
      providerKind: "text",
      providerName: "openrouter",
      value: {
        coreStoryboardGroups: [
          expect.objectContaining({ estimatedClipDurationSeconds: 15, title: "屋檐下的停顿" })
        ],
        storyboardScript: expect.objectContaining({ plannedDurationSeconds: 15 }),
        storyboardScripts: [
          expect.objectContaining({
            frames: expect.arrayContaining([
              expect.objectContaining({ beatType: "core", canvasPosition: "center", frameNumber: 1 }),
              expect.objectContaining({ canvasPosition: "bottom-right", frameNumber: 9 })
            ]),
            mainImagePrompt: expect.any(String),
            plannedDurationSeconds: 15
          })
        ]
      }
    });
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: "storycam_core_storyboard_plan",
        system: expect.stringContaining("核心分镜脚本师")
      })
    );
  });

  it("builds prompts with the single-group 15 second MVP target", async () => {
    const prompt = buildOpenRouterStoryboardPrompt({
      coreGroupTargetCount: 3,
      plannedDurationSeconds: 12,
      sessionId: "session-1",
      storyWorld: await createStoryWorld()
    });

    expect(prompt.prompt).toContain("目标核心分镜组数：1");
    expect(prompt.prompt).toContain("每组时长：约 15 秒");
    expect(prompt.prompt).toContain("总计划时长：约 15 秒");
    expect(prompt.prompt).toContain("frames 必须正好 9 帧");
    expect(prompt.prompt).toContain("导演简报");
    expect(prompt.prompt).toContain("0-3秒");
    expect(prompt.prompt).toContain("micro rhythm");
    expect(prompt.prompt).toContain("visualMotifs");
    expect(prompt.prompt).toContain("visibleCharacterAssetIds");
    expect(prompt.prompt).toContain("每帧只能引用上方人物资产的 id");
    expect(prompt.prompt).toContain("用户可见字段必须使用简体中文");
    expect(prompt.prompt).toContain("sound 必须写中文声音提示");
    expect(prompt.prompt).toContain("imagePrompt 是内部图像提示词");
    expect(prompt.prompt).toContain("相邻帧不要连续使用同一景别或相邻景别");
    expect(prompt.prompt).toContain("每次切换景别至少跨一个级差");
    expect(prompt.prompt).toContain("动作-反应、递进组、因果组或对比组");
    expect(prompt.prompt).toContain("跨级景别或视角反差");
    expect(prompt.system).toContain("山隐导演九列分镜");
    expect(prompt.system).toContain("分镜脚本文案都必须写成简体中文");
  });

  it("builds handdrawn travel image prompts for real travel backgrounds with 2D drawn traveler", async () => {
    const storyWorld = await createStoryWorld();
    const prompt = buildOpenRouterStoryboardPrompt({
      plannedDurationSeconds: 15,
      sessionId: "session-1",
      storyWorld: {
        ...storyWorld,
        script: {
          ...storyWorld.script,
          storyModeId: "handdrawn-travel-vlog"
        }
      }
    });

    expect(prompt.prompt).toContain("real travel-location photography background");
    expect(prompt.prompt).toContain("one 2D hand-drawn illustrated traveler character");
    expect(prompt.prompt).toContain("preserve actual destination architecture and natural light");
    expect(prompt.prompt).toContain("background not comic, not anime, not painterly");
  });

  it("includes scene key objects and scene panels as fixed continuity anchors", async () => {
    const storyWorld = await createStoryWorld();
    const scene = storyWorld.sceneAssets[0];

    if (!scene) {
      throw new Error("Expected mock story world to include a scene asset.");
    }

    const prompt = buildOpenRouterStoryboardPrompt({
      plannedDurationSeconds: 15,
      sessionId: "session-1",
      storyWorld: {
        ...storyWorld,
        sceneAssets: [
          {
            ...scene,
            keyObjects: ["右侧墙缝里的紫色小花", "深绿色木门", "左侧下坡石阶"],
            scenePanels: [
              {
                description: "坡道右侧白墙根部有裂缝，紫色小花从裂缝处长出，旁边是深绿色木门。",
                keyObjects: ["紫色小花", "右侧墙缝", "深绿色木门"],
                purpose: "固定核心空间关系，避免后续分镜换边。",
                shotType: "detail",
                title: "墙缝小花"
              }
            ]
          }
        ]
      }
    });

    expect(prompt.prompt).toContain("右侧墙缝里的紫色小花");
    expect(prompt.prompt).toContain("墙缝小花/detail：坡道右侧白墙根部有裂缝");
    expect(prompt.prompt).toContain("场景资产里的 keyObjects 和 scenePanels 是连续性锚点");
    expect(prompt.prompt).toContain("不得在不同帧移到另一面墙或另一侧");
  });

  it("keeps provider English drift out of user-facing storyboard script fields", async () => {
    const storyWorld = await createStoryWorld();
    const knownCharacterId = storyWorld.characterAssets[0]?.id;

    if (!knownCharacterId) {
      throw new Error("Expected mock story world to include a character asset.");
    }

    const positions = ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"];
    const beatTypes = ["core", "enter", "action", "reaction", "atmosphere", "transition", "emotion", "continuation", "reaction"];
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        groups: [
          {
            emotionalTurn: "Quiet contemplation",
            frames: Array.from({ length: 9 }, (_, index) => ({
              beatType: beatTypes[index],
              cameraAngle: "low angle",
              canvasPosition: positions[index],
              durationSeconds: index === 0 ? 3 : 1.5,
              frameNumber: index + 1,
              imagePrompt: "Stylized comic animation storyboard frame, smartphone screen to frame the cat graffiti.",
              narrativePurpose: "Build the traveler's inner pause.",
              scene: "Lisbon viewpoint",
              shotSize: "medium shot",
              sound: "Light footsteps on cobblestones / distant tram bell ringing faintly / ambient street murmur",
              technicalNotes: "Keep the traveler still and the light soft.",
              timeRange: `00:${String(index).padStart(2, "0")}-00:${String(index + 1).padStart(2, "0")}`,
              title: index === 4 ? "Gazing at the Light" : `English Frame ${index + 1}`,
              visibleCharacterAssetIds: [knownCharacterId],
              visualContent: "The traveler stands at the viewpoint and looks toward the distant river."
            })),
            mainImagePrompt: "Stylized comic animation storyboard frame, smartphone screen to frame the cat graffiti.",
            planSummary: "A traveler stops at a viewpoint and feels the quiet light.",
            rhythm: "walk, pause, look up, quiet ending",
            storyPurpose: "Show the traveler reaching a quiet emotional edge.",
            title: "Reaching the Edge",
            tone: "soft travel melancholy"
          }
        ]
      }
    });
    const provider = createOpenRouterStoryboardProvider({
      apiKey: "openrouter-secret",
      generateObject,
      model: "deepseek/deepseek-v4-flash"
    });

    const result = await provider.generate({
      plannedDurationSeconds: 15,
      sessionId: "session-1",
      storyWorld
    });

    if (!result.ok) {
      throw new Error("Expected storyboard generation to normalize successfully.");
    }

    const visibleFields = result.value.storyboardScript.frames.flatMap((frame) => [
      frame.cameraAngle,
      frame.narrativePurpose,
      frame.scene,
      frame.shotSize,
      frame.sound,
      frame.technicalNotes,
      frame.title,
      frame.visualContent
    ]);
    const visibleText = visibleFields.join(" ");

    expect(result.value.coreStoryboardGroups[0]).toMatchObject({
      emotionalTurn: "从隐藏到想靠近",
      title: "核心分镜 1"
    });
    expect(result.value.storyboardScript.planSummary).toMatch(/[\u3400-\u9fff]/);
    expect(visibleFields.every((field) => /[\u3400-\u9fff]/.test(field))).toBe(true);
    expect(visibleText).not.toMatch(/Gazing|traveler|footsteps|viewpoint|medium shot|low angle/i);
    expect(result.value.storyboardScript.frames[0]?.imagePrompt).toContain("Stylized comic animation storyboard frame");
  });

  it("repairs flat repeated shot language into a more varied Shanyin-style rhythm", async () => {
    const storyWorld = await createStoryWorld();
    const knownCharacterId = storyWorld.characterAssets[0]?.id;
    const positions = ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"];
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        groups: [
          {
            emotionalTurn: "她意识到不能再等",
            frames: Array.from({ length: 9 }, (_, index) => ({
              beatType: index === 0 ? "core" : "action",
              cameraAngle: "平视",
              canvasPosition: positions[index],
              durationSeconds: index === 0 ? 3 : 1.5,
              frameNumber: index + 1,
              imagePrompt: "Stylized comic animation storyboard frame, same medium eye-level composition.",
              narrativePurpose: "推进同一个动作。",
              scene: "雨夜便利店门口",
              shotSize: "中景",
              sound: "雨声",
              technicalNotes: "保持连续。",
              timeRange: `00:${String(index).padStart(2, "0")}-00:${String(index + 1).padStart(2, "0")}`,
              title: index === 0 ? "门口停住" : `重复镜头 ${index + 1}`,
              visibleCharacterAssetIds: knownCharacterId ? [knownCharacterId] : [],
              visualContent: "角色在同一个位置重复停留。"
            })),
            mainImagePrompt: "Stylized comic animation storyboard frame, same medium eye-level composition.",
            planSummary: "一组重复镜头。",
            rhythm: "平平推进",
            storyPurpose: "表达等待。",
            title: "重复等待",
            tone: "克制"
          }
        ]
      }
    });
    const provider = createOpenRouterStoryboardProvider({
      apiKey: "openrouter-secret",
      generateObject,
      model: "deepseek/deepseek-v4-flash"
    });

    const result = await provider.generate({
      plannedDurationSeconds: 15,
      sessionId: "session-1",
      storyWorld
    });

    if (!result.ok) {
      throw new Error("Expected storyboard generation to normalize successfully.");
    }

    const shotPairs = result.value.storyboardScript.frames.map((frame) => `${frame.shotSize}/${frame.cameraAngle}`);

    expect(new Set(shotPairs).size).toBeGreaterThanOrEqual(5);
    expect(shotPairs.slice(1).every((pair, index) => pair !== shotPairs[index])).toBe(true);
    expect(result.value.storyboardScript.frames[1]?.technicalNotes).toContain("避免连续同景别或相邻景别");
    expect(result.value.storyboardScript.frames[1]?.imagePrompt).toContain("shot variation");
  });

  it("repairs adjacent shot sizes so neighboring frames do not sit on the same visual scale", async () => {
    const storyWorld = await createStoryWorld();
    const knownCharacterId = storyWorld.characterAssets[0]?.id;
    const positions = ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"];
    const adjacentShotSizes = ["中景", "中近景", "近景", "特写", "近景", "中近景", "中景", "中远景", "全景"];
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        groups: [
          {
            emotionalTurn: "她开始移动",
            frames: Array.from({ length: 9 }, (_, index) => ({
              beatType: index === 0 ? "core" : "action",
              cameraAngle: index % 2 === 0 ? "平视" : "微俯拍",
              canvasPosition: positions[index],
              durationSeconds: index === 0 ? 3 : 1.5,
              frameNumber: index + 1,
              imagePrompt: "Stylized comic animation storyboard frame, adjacent shot scale drift.",
              narrativePurpose: "推进同一个动作。",
              scene: "雨夜便利店门口",
              shotSize: adjacentShotSizes[index],
              sound: "雨声",
              technicalNotes: "保持连续。",
              timeRange: `00:${String(index).padStart(2, "0")}-00:${String(index + 1).padStart(2, "0")}`,
              title: `相邻景别 ${index + 1}`,
              visibleCharacterAssetIds: knownCharacterId ? [knownCharacterId] : [],
              visualContent: "角色在同一个空间里缓慢移动。"
            })),
            mainImagePrompt: "Stylized comic animation storyboard frame, adjacent shot scale drift.",
            planSummary: "一组景别太接近的镜头。",
            rhythm: "缓慢推进",
            storyPurpose: "表达犹豫里的移动。",
            title: "相邻景别修正",
            tone: "克制"
          }
        ]
      }
    });
    const provider = createOpenRouterStoryboardProvider({
      apiKey: "openrouter-secret",
      generateObject,
      model: "deepseek/deepseek-v4-flash"
    });

    const result = await provider.generate({
      plannedDurationSeconds: 15,
      sessionId: "session-1",
      storyWorld
    });

    if (!result.ok) {
      throw new Error("Expected storyboard generation to normalize successfully.");
    }

    const shotScaleDistances = result.value.storyboardScript.frames.slice(1).map((frame, index) => {
      const previous = result.value.storyboardScript.frames[index];

      return Math.abs(shotScaleForTest(frame.shotSize) - shotScaleForTest(previous.shotSize));
    });

    expect(shotScaleDistances.every((distance) => distance > 1)).toBe(true);
    expect(result.value.storyboardScript.frames[1]?.technicalNotes).toContain("避免连续同景别或相邻景别");
    expect(result.value.storyboardScript.frames[1]?.imagePrompt).toContain("shot variation");
  });

  it("keeps only confirmed visible character asset ids on storyboard frames", async () => {
    const storyWorld = await createStoryWorld();
    const knownCharacterId = storyWorld.characterAssets[0]?.id;
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        groups: [
          {
            emotionalTurn: "门开了",
            frames: [
              {
                beatType: "core",
                cameraAngle: "平视",
                canvasPosition: "center",
                durationSeconds: 3,
                frameNumber: 1,
                imagePrompt: "Stylized comic animation storyboard frame, only confirmed character assets visible.",
                narrativePurpose: "建立核心动作。",
                scene: "雨夜便利店门口",
                shotSize: "中景",
                sound: "门铃",
                technicalNotes: "保持角色资产一致。",
                timeRange: "00:00-00:03",
                title: "门口等待",
                visibleCharacterAssetIds: [knownCharacterId, "unlisted-owner"],
                visualContent: "主角看向门口。"
              },
              ...Array.from({ length: 8 }, (_, index) => ({
                beatType: "reaction",
                cameraAngle: "平视",
                canvasPosition: ["top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"][index],
                durationSeconds: 1.5,
                frameNumber: index + 2,
                imagePrompt: "Stylized comic animation storyboard frame, only confirmed character assets visible.",
                narrativePurpose: "补充动作。",
                scene: "雨夜便利店门口",
                shotSize: "近景",
                sound: "雨声",
                technicalNotes: "保持角色资产一致。",
                timeRange: `00:0${index + 3}-00:0${index + 4}`,
                title: `扩展 ${index + 2}`,
                ...(index === 0 ? { visibleCharacterAssetIds: [] } : {}),
                ...(index === 1 ? { visibleCharacterAssetIds: ["unlisted-owner"] } : {}),
                visualContent: "门口光线变化。"
              }))
            ],
            mainImagePrompt: "Stylized comic animation storyboard frame, only confirmed character assets visible.",
            planSummary: "等待门口的变化。",
            rhythm: "慢，停顿，轻微反应",
            storyPurpose: "让等待变成可见动作。",
            title: "门口等待",
            tone: "克制"
          }
        ]
      }
    });
    const provider = createOpenRouterStoryboardProvider({
      apiKey: "openrouter-secret",
      generateObject,
      model: "deepseek/deepseek-v4-flash"
    });

    const result = await provider.generate({
      plannedDurationSeconds: 15,
      sessionId: "session-1",
      storyWorld
    });

    expect(result.ok && result.value.storyboardScript.frames[0]?.visibleCharacterAssetIds).toEqual([knownCharacterId]);
    expect(result.ok && result.value.storyboardScript.frames[1]?.visibleCharacterAssetIds).toEqual([]);
    expect(result.ok && result.value.storyboardScript.frames[2]?.visibleCharacterAssetIds).toEqual([]);
    expect(result.ok && result.value.storyboardScript.frames[3]?.visibleCharacterAssetIds).toEqual(
      storyWorld.characterAssets.map((asset) => asset.id)
    );
  });
});

function shotScaleForTest(value: string) {
  const normalized = value.replace(/\s+/g, "").toLowerCase();

  if (normalized.includes("大特写") || normalized.includes("极特写")) {
    return 7;
  }

  if (normalized.includes("特写")) {
    return 6;
  }

  if (normalized.includes("近景")) {
    return normalized.includes("中近") ? 4 : 5;
  }

  if (normalized.includes("中景")) {
    return 3;
  }

  if (normalized.includes("中远")) {
    return 2;
  }

  if (normalized.includes("全景") || normalized.includes("空镜")) {
    return 1;
  }

  if (normalized.includes("远景")) {
    return 0;
  }

  throw new Error(`Unexpected shot size in test: ${value}`);
}
