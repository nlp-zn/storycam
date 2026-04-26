import {
  coreStoryboardGroupSchema,
  expandedStoryboardCardSchema,
  storyboardScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import type {
  CoreStoryboardGroup,
  ExpandedStoryboardCard,
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
import { rainyKDramaExpansionCards, rainyKDramaStoryboardTitles } from "./fixtures/storyboards";

export type MockStoryboardInput = {
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
      id: "storyboard-script-rainy-kdrama",
      planSummary: "用几个克制的雨夜时刻讲完一次没有说出口的暗恋。",
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
    const expandedStoryboardCards = createExpansionCards(input, coreStoryboardGroups);

    return Promise.resolve(
      providerSuccess(
        {
          providerKind: "text",
          providerName: "mock"
        },
        {
          coreStoryboardGroups: coreStoryboardGroups.map((group) => ({
            ...group,
            expandedCardIds: expandedStoryboardCards
              .filter((card) => card.coreGroupId === group.id)
              .map((card) => card.id)
          })),
          expandedStoryboardCards,
          storyboardScript
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

function createExpansionCards(input: MockStoryboardInput, groups: CoreStoryboardGroup[]) {
  const targetCount = Math.min(8, Math.max(0, input.expansionCardTargetCount ?? 3));

  return Array.from({ length: targetCount }, (_, index) => {
    const fixture = rainyKDramaExpansionCards[index % rainyKDramaExpansionCards.length];
    const group = groups[index % groups.length];

    return expandedStoryboardCardSchema.parse({
      beatType: fixture.beatType,
      coreGroupId: group.id,
      description: fixture.description,
      guidance: fixture.guidance,
      id: `expanded-card-rainy-kdrama-${index + 1}`,
      sessionId: input.sessionId,
      sortOrder: index,
      state: "ready",
      title: fixture.title,
      version: 1
    });
  });
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
