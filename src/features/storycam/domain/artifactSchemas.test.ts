import { describe, expect, it } from "vitest";
import {
  characterAssetSchema,
  clipPromptPacketSchema,
  coreStoryboardGroupSchema,
  directorPacketSchema,
  finalWorkSchema,
  generatedClipSchema,
  sceneAssetSchema,
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
  beats: ["删改短信", "门铃响起", "擦肩而过"]
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
  spatialLogic: "她在门外，他从店里走出，倒影短暂重叠"
};

const storyboardScript = {
  ...baseArtifact,
  id: "storyboard-script-1",
  planSummary: "用三个核心时刻讲完错过。",
  tone: "韩剧雨夜，私人回忆",
  rhythm: "慢进入，短暂停顿，安静离开",
  plannedDurationSeconds: 12
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

describe("artifact schemas", () => {
  it("accepts valid StoryCam artifact payloads", () => {
    expect(storyScriptSchema.parse(script)).toMatchObject({ state: "ready", version: 1 });
    expect(characterAssetSchema.parse(character)).toMatchObject({ state: "ready", version: 1 });
    expect(sceneAssetSchema.parse(scene)).toMatchObject({ state: "ready", version: 1 });
    expect(coreStoryboardGroupSchema.parse(coreGroup)).toMatchObject({ state: "ready", version: 1 });
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
      directorTone: "更遗憾一点，少说话",
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
