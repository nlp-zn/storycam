import { describe, expect, it } from "vitest";
import { runStoryCamDirectorQualityChecks } from "./directorQualityChecks";
import type { StoryScript, StoryboardScript } from "./artifacts";

const canvasPositions = ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"] as const;

const script = {
  beats: ["她把手机扣在桌面上，便利店门铃响起。"],
  directorBrief: {
    dialogueStrategy: "少台词，以动作和停顿表达。",
    microRhythm: "0-3秒建立等待，3-8秒推进动作，8-12秒给反应，12-15秒留白。",
    shotDensity: "前慢后轻微加速。",
    shotSizeFocus: "中景到近景，结尾空镜。",
    soundStrategy: "雨声持续，门铃作为转折。",
    tone: "克制、私人、遗憾",
    transitionStrategy: "用声音先行连接。",
    userFacingSummary: "这一段会先安静等待，再用门铃收住。",
    visualMotifs: ["雨声", "门铃", "手机"]
  },
  id: "script-1",
  logline: "她在雨夜便利店门口删掉短信。",
  qualityChecks: [],
  sessionId: "session-1",
  state: "ready",
  summary: "她把手机扣在桌面上，便利店门铃响起。",
  title: "雨夜未发送",
  version: 1,
  visualStyle: "漫画电影/动画分镜风格"
} satisfies StoryScript;

const storyboardScript = {
  frames: Array.from({ length: 9 }, (_, index) => ({
    beatType: index === 0 ? "core" : "reaction",
    cameraAngle: "平视",
    canvasPosition: canvasPositions[index],
    durationSeconds: index === 0 ? 3 : 1.5,
    frameNumber: index + 1,
    imagePrompt: `Stylized comic animation storyboard frame with rain and phone ${index + 1}.`,
    narrativePurpose: index === 0 ? "建立手机和雨声的中心视觉母题。" : "补充动作和反应。",
    scene: "便利店门口",
    shotSize: index === 0 ? "中景" : "近景",
    sound: "雨声和门铃",
    technicalNotes: "保持动作连续。",
    timeRange: `00:${String(index).padStart(2, "0")}-00:${String(index + 1).padStart(2, "0")}`,
    title: index === 0 ? "中心主图" : `分镜 ${index + 1}`,
    visibleCharacterAssetIds: ["character-1"],
    visualContent: index === 0 ? "手机扣在桌面上，门口雨声持续。" : "角色听见门铃后停住。"
  })),
  id: "storyboard-script-1",
  planSummary: "用手机、雨声和门铃完成一次等待。",
  plannedDurationSeconds: 15,
  rhythm: "慢进入，动作推进，留白收束。",
  sessionId: "session-1",
  state: "ready",
  tone: "克制",
  version: 1
} satisfies StoryboardScript;

describe("director quality checks", () => {
  it("passes scripts and storyboard plans that carry the director brief into visible beats", () => {
    expect(runStoryCamDirectorQualityChecks({ allowedCharacterAssetIds: ["character-1"], script, storyboardScript })).toEqual([
      "剧本已转成可见动作、可听声音和 15 秒节奏。"
    ]);
  });

  it("flags missing director briefs, psychological prose, missing frame sound, unlisted characters, and motif drift", () => {
    const { directorBrief: _directorBrief, ...scriptWithoutBrief } = script;
    const brokenStoryboard = {
      ...storyboardScript,
      frames: storyboardScript.frames.map((frame, index) => ({
        ...frame,
        imagePrompt: "Stylized comic animation storyboard frame in a plain empty room, no symbolic objects.",
        narrativePurpose: index === 1 ? "" : "补充无关动作。",
        sound: index === 0 ? "" : "空调声",
        title: "空白分镜",
        visibleCharacterAssetIds: index === 0 ? ["unknown-character"] : frame.visibleCharacterAssetIds,
        visualContent: "她很难过。"
      }))
    } as StoryboardScript;

    const checks = runStoryCamDirectorQualityChecks({
      allowedCharacterAssetIds: ["character-1"],
      script: {
        ...scriptWithoutBrief,
        summary: "她意识到自己很难过。"
      },
      storyboardScript: brokenStoryboard
    });

    expect(checks).toEqual(
      expect.arrayContaining([
        "节奏提示缺失，已使用默认私人短片节奏。",
        "剧本仍含明显心理描写，需要转成可见动作或可听声音。",
        "分镜脚本存在缺少声音或叙事目的的帧。",
        "分镜脚本引用了未确认的人物资产。",
        "关键画面线索尚未明显落到分镜里。"
      ])
    );
  });
});
