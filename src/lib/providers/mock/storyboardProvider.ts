import {
  coreStoryboardGroupSchema,
  storyboardFrameSchema,
  storyboardScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import type {
  CoreStoryboardGroup,
  ExpandedStoryboardCard,
  StoryboardFrame,
  StoryboardScript
} from "@/features/storycam/domain/artifacts";
import {
  createDurationPlan,
  type DurationPreset,
  type StoryDensity
} from "@/features/storycam/domain/durationRules";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type { ProviderResult, TextGenerationProvider } from "@/lib/providers/types";
import type { MockStoryWorldOutput } from "./storyWorldProvider";
import { rainyKDramaStoryboardTitles } from "./fixtures/storyboards";

export type MockStoryboardInput = {
  coreGroupTargetCount?: 1 | 2 | 3;
  durationPreset?: DurationPreset;
  expansionCardTargetCount?: number;
  plannedDurationSeconds: number;
  sessionId: string;
  storyDensity?: StoryDensity;
  storyWorld: MockStoryWorldOutput;
};

export type MockStoryboardOutput = {
  coreStoryboardGroups: CoreStoryboardGroup[];
  expandedStoryboardCards: ExpandedStoryboardCard[];
  storyboardScript: StoryboardScript;
  storyboardScripts: StoryboardScript[];
};

export function createMockStoryboardProvider(): TextGenerationProvider<MockStoryboardInput, MockStoryboardOutput> {
  return {
    providerKind: "text",
    providerName: "mock",
    async generate(input) {
      return generateMockStoryboard(input);
    }
  };
}

function generateMockStoryboard(input: MockStoryboardInput): Promise<ProviderResult<MockStoryboardOutput>> {
  try {
    const durationPlan = createDurationPlan(input);
    const characterAssetIds = input.storyWorld.characterAssets.slice(0, 3).map((asset) => asset.id);
    const sceneAssetId = input.storyWorld.sceneAssets[0]?.id;

    if (!sceneAssetId || characterAssetIds.length === 0) {
      throw new Error("Mock storyboard requires story world character and scene assets.");
    }

    const storyboardScript = storyboardScriptSchema.parse({
      frames: buildMockStoryboardFrames(input.sessionId, {
        characterAssetIds,
        emotionalTurn: "想说出口",
        storyPurpose: "建立她和未发送短信之间的私人情绪。",
        title: "未发送的短信"
      }),
      id: "storyboard-script-rainy-kdrama",
      planSummary: `用 ${durationPlan.coreGroupTargetCount} 组各 15 秒的克制雨夜时刻讲完一次没有说出口的暗恋。`,
      plannedDurationSeconds: durationPlan.plannedDurationSeconds,
      rhythm: "慢进入，短暂停顿，安静离开",
      sessionId: input.sessionId,
      state: "ready",
      tone: "韩剧雨夜，私人回忆",
      version: 1
    });
    const coreStoryboardGroups = durationPlan.clipDurationTargets.map((duration, index) =>
      coreStoryboardGroupSchema.parse({
        characterAssetIds,
        emotionalTurn: index === 0 ? "想说出口" : index === 1 ? "靠近但错过" : "把话收回去",
        estimatedClipDurationSeconds: duration,
        expandedCardIds: [],
        id: `core-group-rainy-kdrama-${index + 1}`,
        sceneAssetId,
        sessionId: input.sessionId,
        state: "ready",
        storyPurpose: groupStoryPurpose(index),
        title: rainyKDramaStoryboardTitles[index] ?? rainyKDramaStoryboardTitles.at(-1),
        version: 1
      })
    );
    const storyboardScripts = coreStoryboardGroups.map((group, index) => {
      const frames = buildMockStoryboardFrames(input.sessionId, group);

      return storyboardScriptSchema.parse({
        frames,
        id: `storyboard-script-rainy-kdrama-${index + 1}`,
        mainImagePrompt: frames[0]?.imagePrompt,
        planSummary: group.storyPurpose,
        plannedDurationSeconds: 15,
        rhythm: index === 0 ? "停顿进入，手部小动作推进" : index === 1 ? "人物靠近，视线错开" : "动作收束，情绪留白",
        sessionId: input.sessionId,
        state: "ready",
        tone: "韩剧雨夜，克制真实",
        version: 1
      });
    });

    return Promise.resolve(
      providerSuccess(
        {
          providerKind: "text",
          providerName: "mock"
        },
        {
          coreStoryboardGroups: coreStoryboardGroups.map((group) => ({
            ...group,
            expandedCardIds: []
          })),
          expandedStoryboardCards: [],
          storyboardScript,
          storyboardScripts
        }
      )
    );
  } catch (error) {
    return Promise.resolve(
      providerFailure({ providerKind: "text", providerName: "mock" }, error, {
        errorCode: "MOCK_STORYBOARD_INVALID_OUTPUT",
        retryable: false
      })
    );
  }
}

function buildMockStoryboardFrames(
  sessionId: string,
  group: Pick<CoreStoryboardGroup, "characterAssetIds" | "emotionalTurn" | "storyPurpose" | "title">
): StoryboardFrame[] {
  const frames = [
    {
      beatType: "core",
      cameraAngle: "平视",
      canvasPosition: "center",
      durationSeconds: 3,
      title: group.title,
      visualContent: `${group.title}：雨夜便利店窗边，人物和核心道具在同一画面中形成中心构图。`
    },
    {
      beatType: "enter",
      cameraAngle: "平视",
      canvasPosition: "top-left",
      durationSeconds: 1.5,
      title: "环境建立",
      visualContent: "雨夜街角便利店外景，湿地反光拉开私人回忆的空间。"
    },
    {
      beatType: "action",
      cameraAngle: "微俯拍",
      canvasPosition: "top",
      durationSeconds: 1.5,
      title: "手指停顿",
      visualContent: "手机屏幕亮起，未发送的短信停在输入框里。"
    },
    {
      beatType: "reaction",
      cameraAngle: "平视",
      canvasPosition: "top-right",
      durationSeconds: 1.5,
      title: "门铃响起",
      visualContent: "便利店门被推开，玻璃倒影中出现另一个身影。"
    },
    {
      beatType: "atmosphere",
      cameraAngle: "低机位",
      canvasPosition: "left",
      durationSeconds: 1.5,
      title: "雨水落下",
      visualContent: "伞尖雨滴落在湿地，冷暖灯光在水面晕开。"
    },
    {
      beatType: "transition",
      cameraAngle: "平视",
      canvasPosition: "right",
      durationSeconds: 1.5,
      title: "擦肩靠近",
      visualContent: "人物从便利店门口经过，两人靠近却没有对视。"
    },
    {
      beatType: "emotion",
      cameraAngle: "近景",
      canvasPosition: "bottom-left",
      durationSeconds: 1.5,
      title: "表情收住",
      visualContent: "主角抬眼又低头，把情绪压回手里的手机。"
    },
    {
      beatType: "continuation",
      cameraAngle: "远景",
      canvasPosition: "bottom",
      durationSeconds: 1.5,
      title: "距离拉开",
      visualContent: "街道纵深里人影走远，便利店灯光留在雨幕里。"
    },
    {
      beatType: "reaction",
      cameraAngle: "特写",
      canvasPosition: "bottom-right",
      durationSeconds: 1.5,
      title: "屏幕暗下",
      visualContent: "手机屏幕暗下去，只剩雨声和玻璃反光。"
    }
  ] as const;

  return frames.map((frame, index) =>
    storyboardFrameSchema.parse({
      ...frame,
      frameNumber: index + 1,
      imagePrompt:
        index === 0
          ? buildMockMainImagePrompt(group.title, group.storyPurpose, group.emotionalTurn)
          : `Stylized comic animation storyboard frame ${index + 1} for "${group.title}", ${frame.visualContent}, fictional illustrated characters, rainy private-memory mood, consistent character wardrobe and convenience-store location, cinematic lighting, 16:9, no text, not photorealistic.`,
      narrativePurpose: index === 0 ? group.storyPurpose : "作为中心主图周围的连续分镜，补足动作、反应和氛围。",
      scene: `session ${sessionId} rainy convenience-store story world`,
      shotSize: index === 0 ? "中景" : index % 3 === 0 ? "近景" : "全景",
      sound: "雨声、便利店门铃和轻微脚步声",
      technicalNotes: "保持同一角色造型、便利店空间、雨夜冷暖混合光。",
      timeRange: `00:${String(index).padStart(2, "0")}-00:${String(index + 1).padStart(2, "0")}`,
      visibleCharacterAssetIds: group.characterAssetIds
    })
  );
}

function buildMockMainImagePrompt(title: string, storyPurpose: string, emotionalTurn: string) {
  return [
    `Core storyboard still: ${title}.`,
    storyPurpose,
    `Emotional turn: ${emotionalTurn}.`,
    "A stylized comic animation 16:9 frame, restrained rain-night private-memory mood, fictional illustrated characters, expressive small gestures, cinematic lighting, no text, not photorealistic."
  ].join(" ");
}

function groupStoryPurpose(index: number) {
  if (index === 0) {
    return "建立她和未发送短信之间的私人情绪。";
  }

  if (index === 1) {
    return "让对方靠近，但仍然不让告白真正发生。";
  }

  return "用删除短信完成这段记忆的收束。";
}
