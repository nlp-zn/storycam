import { describe, expect, it } from "vitest";
import {
  characterAssetSchema,
  clipPromptPacketSchema,
  coreStoryboardGroupSchema,
  directorPacketSchema,
  expandedStoryboardCardSchema,
  finalWorkSchema,
  generatedClipSchema,
  sceneAssetSchema,
  storyboardScriptSchema,
  storyScriptSchema,
  versionedArtifactSchema
} from "./artifactSchemas";

const baseArtifact = {
  id: "artifact-1",
  sessionId: "session-1",
  state: "ready",
  version: 1
} as const;

const script = {
  ...baseArtifact,
  id: "script-1",
  title: "雨夜便利店",
  logline: "她在雨夜删改一条没有发出的告白短信。",
  summary: "便利店外的雨和玻璃反光，让两个人短暂重叠又错过。",
  visualStyle: "写实韩剧电影感，雨夜冷暖混合光，低饱和色彩",
  beats: ["删改短信", "门铃响起", "擦肩而过"],
  directorBrief: {
    dialogueStrategy: "少台词，用停顿和动作表达。",
    microRhythm: "0-3秒建立雨夜等待，3-8秒推进手机和门铃动作，8-12秒给反应，12-15秒留白收束。",
    shotDensity: "前慢后轻微加速，最后停住。",
    shotSizeFocus: "中景建立空间，近景落到手机和反应，结尾回到空镜。",
    soundStrategy: "雨声做底，门铃作为转折，配乐压低。",
    tone: "克制、遗憾、私人回忆",
    transitionStrategy: "动作之间自然衔接，结尾用停留而不是明显转场。",
    userFacingSummary: "这一段会先安静等待，再用门铃和玻璃反光完成错过。",
    visualMotifs: ["雨声", "玻璃反光", "未发送短信"]
  },
  qualityChecks: ["剧本已转成可见动作和可听声音。"]
};

const character = {
  ...baseArtifact,
  id: "character-1",
  name: "她",
  role: "暗恋者",
  relationshipToUserStory: "把没有说出口的情绪留在手机里",
  stableVisualDescription: "湿发、浅色风衣、握紧伞柄",
  emotionalBaseline: "克制、犹豫",
  props: ["手机", "透明伞"],
  referenceMediaIds: ["photo-1"],
  consistencyNotes: ["始终避免夸张表演"]
};

const scene = {
  ...baseArtifact,
  id: "scene-1",
  name: "便利店外",
  location: "雨夜街角便利店",
  timeOfDay: "night",
  light: "冷白便利店灯和暖色路灯",
  atmosphere: "潮湿、安静、私人回忆感",
  keyObjects: ["玻璃门", "伞", "手机屏幕"],
  referenceMediaIds: ["photo-2"],
  spatialLogic: "她在门外，他从店里走出，倒影短暂重叠",
  scenePanels: [
    {
      description: "雨夜街角便利店门口的完整空间关系。",
      keyObjects: ["便利店玻璃门", "雨棚", "街灯"],
      purpose: "建立故事发生的主空间。",
      shotType: "establishing",
      title: "便利店外景"
    },
    {
      description: "玻璃门上的两个人倒影短暂重叠。",
      keyObjects: ["玻璃门", "倒影"],
      purpose: "承接暗恋的错过感。",
      shotType: "medium",
      title: "玻璃倒影"
    },
    {
      description: "手机屏幕停在未发送短信。",
      keyObjects: ["手机屏幕", "雨滴"],
      purpose: "让观众看见没有说出口的话。",
      shotType: "detail",
      title: "未发送短信"
    },
    {
      description: "冷白便利店灯和暖色街灯交叠。",
      keyObjects: ["便利店灯", "街灯"],
      purpose: "固定整组场景的光线基调。",
      shotType: "lighting",
      title: "灯光关系"
    }
  ]
};

const storyboardScript = {
  ...baseArtifact,
  id: "storyboard-script-1",
  planSummary: "用三个核心时刻讲完错过。",
  tone: "韩剧雨夜，私人回忆",
  rhythm: "慢进入，短暂停顿，安静离开",
  plannedDurationSeconds: 15,
  frames: storyboardFrames()
};

const coreGroup = {
  ...baseArtifact,
  id: "core-group-1",
  title: "玻璃反光",
  storyPurpose: "让两个人在没有相认时短暂同框",
  emotionalTurn: "靠近但没有真正发生",
  estimatedClipDurationSeconds: 4.5,
  characterAssetIds: ["character-1"],
  sceneAssetId: "scene-1",
  expandedCardIds: ["expanded-1"]
};

function storyboardFrames() {
  const positions = ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"];
  const beatTypes = ["core", "enter", "action", "reaction", "atmosphere", "transition", "emotion", "continuation", "reaction"];

  return positions.map((canvasPosition, index) => ({
    beatType: beatTypes[index],
    cameraAngle: index === 0 ? "平视" : "微俯拍",
    canvasPosition,
    durationSeconds: index === 0 ? 3 : 1.5,
    frameNumber: index + 1,
    imagePrompt: `Cinematic storyboard still frame ${index + 1}, rainy store glass, ordinary people, no text.`,
    narrativePurpose: index === 0 ? "建立中心视觉锚点。" : "补充动作反应链条。",
    scene: "雨夜街角便利店",
    shotSize: index === 0 ? "中景" : "近景",
    sound: "雨声和便利店门铃",
    technicalNotes: "保持雨夜冷暖混合光。",
    timeRange: `00:${String(index).padStart(2, "0")}-00:${String(index + 1).padStart(2, "0")}`,
    title: index === 0 ? "中心主图" : `扩展分镜 ${index}`,
    visibleCharacterAssetIds: ["character-1"],
    visualContent: index === 0 ? "雨夜便利店门口，人物低头看未发送短信。" : "围绕中心动作补充一个连续分镜画面。"
  }));
}

describe("artifact schemas", () => {
  it("accepts valid StoryCam artifact payloads", () => {
    expect(storyScriptSchema.parse(script)).toMatchObject({ state: "ready", version: 1 });
    expect(characterAssetSchema.parse(character)).toMatchObject({ state: "ready", version: 1 });
    expect(sceneAssetSchema.parse(scene)).toMatchObject({ scenePanels: scene.scenePanels, state: "ready", version: 1 });
    expect(coreStoryboardGroupSchema.parse(coreGroup)).toMatchObject({ state: "ready", version: 1 });
  });

  it("keeps old scene assets restorable when they do not have scene panels yet", () => {
    const { scenePanels: _scenePanels, ...oldScene } = scene;

    expect(sceneAssetSchema.parse(oldScene)).toMatchObject({
      id: "scene-1",
      scenePanels: []
    });
  });

  it("keeps old script artifacts restorable when they do not have a visual style yet", () => {
    const { directorBrief: _directorBrief, qualityChecks: _qualityChecks, visualStyle: _visualStyle, ...oldScript } = script;

    expect(storyScriptSchema.parse(oldScript)).toMatchObject({
      id: "script-1",
      qualityChecks: [],
      title: "雨夜便利店"
    });
  });

  it("accepts the internal director brief on story scripts", () => {
    const parsed = storyScriptSchema.parse(script);

    expect(parsed.directorBrief).toMatchObject({
      microRhythm: expect.stringContaining("0-3秒"),
      shotSizeFocus: expect.stringContaining("中景"),
      userFacingSummary: expect.stringContaining("门铃")
    });
    expect(parsed.qualityChecks).toEqual(["剧本已转成可见动作和可听声音。"]);
  });

  it("accepts storyboard scripts with exactly nine structured frames", () => {
    const parsed = storyboardScriptSchema.parse(storyboardScript);

    expect(parsed.frames).toHaveLength(9);
    expect(parsed.frames[0]).toMatchObject({
      beatType: "core",
      canvasPosition: "center",
      frameNumber: 1,
      visibleCharacterAssetIds: ["character-1"]
    });
    expect(parsed.frames[8]).toMatchObject({
      canvasPosition: "bottom-right",
      frameNumber: 9
    });
  });

  it("keeps visible character asset ids on expanded storyboard cards", () => {
    expect(
      expandedStoryboardCardSchema.parse({
        ...baseArtifact,
        beatType: "reaction",
        coreGroupId: "core-group-1",
        description: "她看见玻璃门动了一下。",
        guidance: "只让已确认的人物资产出镜。",
        id: "expanded-1",
        imagePrompt: "Stylized comic storyboard frame, only confirmed character assets visible.",
        sortOrder: 0,
        title: "门口反应",
        visibleCharacterAssetIds: ["character-1"]
      }).visibleCharacterAssetIds
    ).toEqual(["character-1"]);
  });

  it("keeps old storyboard scripts restorable when they do not have frames yet", () => {
    const { frames: _frames, ...oldStoryboardScript } = storyboardScript;
    const parsed = storyboardScriptSchema.parse(oldStoryboardScript);

    expect(parsed.frames).toHaveLength(9);
    expect(parsed.frames[0]).toMatchObject({
      frameNumber: 1,
      visualContent: expect.stringContaining("中心主图")
    });
  });

  it("rejects storyboard scripts with an incomplete frame plan", () => {
    expect(() =>
      storyboardScriptSchema.parse({
        ...storyboardScript,
        frames: storyboardFrames().slice(0, 8)
      })
    ).toThrow();
  });

  it("keeps versioned artifacts explicit about state and version", () => {
    const parsed = versionedArtifactSchema.parse({
      ...baseArtifact,
      type: "character_asset",
      data: character,
      createdAt: "2026-04-26T03:00:00.000Z",
      updatedAt: "2026-04-26T03:01:00.000Z",
      dependsOn: { "script-1": 1 }
    });

    expect(parsed.state).toBe("ready");
    expect(parsed.version).toBe(1);
  });

  it("rejects malformed provider output", () => {
    expect(() =>
      coreStoryboardGroupSchema.parse({
        ...coreGroup,
        version: 0,
        estimatedClipDurationSeconds: -1,
        characterAssetIds: []
      })
    ).toThrow();

    expect(() =>
      characterAssetSchema.parse({
        ...character,
        stableVisualDescription: ""
      })
    ).toThrow();
  });

  it("requires provider-send confirmation for clip prompt packets", () => {
    expect(() =>
      clipPromptPacketSchema.parse({
        ...baseArtifact,
        id: "packet-1",
        coreGroupId: "core-group-1",
        providerSendConfirmed: false,
        confirmationSummary: "用玻璃反光这一组生成片段。",
        inputArtifactVersions: { "core-group-1": 1 },
        redactedPromptSummary: "韩剧雨夜，玻璃反光，4-5秒"
      })
    ).toThrow();
  });

  it("bounds generated clips and final work to the MVP clip group limits", () => {
    const generatedClip = generatedClipSchema.parse({
      ...baseArtifact,
      id: "clip-1",
      coreGroupId: "core-group-1",
      clipPromptPacketId: "packet-1",
      mediaAssetId: "media-clip-1",
      durationSeconds: 4.5,
      providerName: "mock",
      jobId: "job-1"
    });

    const finalWork = finalWorkSchema.parse({
      ...baseArtifact,
      id: "final-1",
      generatedClipIds: [generatedClip.id],
      mediaAssetId: "media-final-1",
      durationSeconds: 4.5,
      previewStatus: "ready"
    });

    expect(finalWork.generatedClipIds).toHaveLength(1);
    expect(() =>
      finalWorkSchema.parse({
        ...finalWork,
        generatedClipIds: ["a", "b", "c", "d"]
      })
    ).toThrow();
  });

  it("validates a director packet aggregate without requiring downstream artifacts yet", () => {
    const packet = directorPacketSchema.parse({
      ...baseArtifact,
      id: "director-packet-1",
      input: "我想把暗恋拍成韩剧雨夜",
      intent: "私人记忆预告片",
      directorTone: "留白多一点，像旧照片",
      script,
      characterAssets: [character],
      sceneAssets: [scene],
      storyboardScript,
      coreStoryboardGroups: [coreGroup]
    });

    expect(packet.coreStoryboardGroups).toHaveLength(1);
    expect(packet.generatedClips).toEqual([]);
  });
});
