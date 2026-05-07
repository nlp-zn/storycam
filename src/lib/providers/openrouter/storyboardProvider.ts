import { z } from "zod";
import {
  coreStoryboardGroupSchema,
  storyboardFrameSchema,
  storyboardScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import type { CoreStoryboardGroup, StoryboardFrame } from "@/features/storycam/domain/artifacts";
import { createDurationPlan } from "@/features/storycam/domain/durationRules";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type { MockStoryboardInput, MockStoryboardOutput } from "@/lib/providers/mock/storyboardProvider";
import type { ProviderResult, TextGenerationProvider } from "@/lib/providers/types";
import { type StoryCamGenerateObject } from "@/server/ai/vercelAiClient";
import { createOpenRouterTextProvider, type OpenRouterStructuredPrompt } from "./textProvider";

export type OpenRouterStoryboardProviderOptions = {
  apiKey: string;
  fallbackModels?: string[];
  generateObject?: StoryCamGenerateObject;
  maxAttempts?: number;
  model: string;
};

const draftTextSchema = z.string().trim().min(1).catch("");
const draftFrameSchema = z.object({
  beatType: draftTextSchema,
  cameraAngle: draftTextSchema,
  canvasPosition: draftTextSchema,
  durationSeconds: z.number().positive().catch(1.5),
  frameNumber: z.number().int().min(1).max(9).catch(1),
  imagePrompt: draftTextSchema,
  narrativePurpose: draftTextSchema,
  scene: draftTextSchema,
  shotSize: draftTextSchema,
  sound: draftTextSchema,
  technicalNotes: draftTextSchema,
  timeRange: draftTextSchema,
  title: draftTextSchema,
  visualContent: draftTextSchema
});
const draftGroupSchema = z.object({
  emotionalTurn: draftTextSchema,
  frames: z.array(draftFrameSchema).length(9).optional().catch(undefined),
  mainImagePrompt: draftTextSchema,
  planSummary: draftTextSchema,
  rhythm: draftTextSchema,
  storyPurpose: draftTextSchema,
  title: draftTextSchema,
  tone: draftTextSchema
});
const openRouterStoryboardDraftSchema = z.object({
  groups: z.array(draftGroupSchema).min(1).max(3).catch([])
});

type OpenRouterStoryboardDraft = z.infer<typeof openRouterStoryboardDraftSchema>;
type OpenRouterStoryboardGroupDraft = OpenRouterStoryboardDraft["groups"][number];

export function createOpenRouterStoryboardProvider(
  options: OpenRouterStoryboardProviderOptions
): TextGenerationProvider<MockStoryboardInput, MockStoryboardOutput> {
  const identity = {
    providerKind: "text" as const,
    providerName: "openrouter" as const
  };
  const draftProvider = createOpenRouterTextProvider<MockStoryboardInput, OpenRouterStoryboardDraft>({
    apiKey: options.apiKey,
    buildPrompt: buildOpenRouterStoryboardPrompt,
    fallbackModels: options.fallbackModels,
    generateObject: options.generateObject,
    maxAttempts: options.maxAttempts,
    model: options.model,
    outputSchema: openRouterStoryboardDraftSchema,
    schemaDescription: "A structured StoryCam core storyboard plan with one group representing a 15 second MVP clip.",
    schemaName: "storycam_core_storyboard_plan"
  });

  return {
    ...identity,
    async generate(input): Promise<ProviderResult<MockStoryboardOutput>> {
      const draftResult = await draftProvider.generate(input);

      if (!draftResult.ok) {
        return draftResult;
      }

      try {
        return providerSuccess(identity, normalizeStoryboardDraft(input, draftResult.value));
      } catch (error) {
        return providerFailure(identity, error, {
          errorCode: "OPENROUTER_STORYBOARD_INVALID_OUTPUT",
          retryable: true
        });
      }
    }
  };
}

export function buildOpenRouterStoryboardPrompt(input: MockStoryboardInput): OpenRouterStructuredPrompt<MockStoryboardInput> {
  const durationPlan = createDurationPlan(input);
  const script = input.storyWorld.script;
  const characters = input.storyWorld.characterAssets
    .map((asset, index) => `${index + 1}. ${asset.name}：${asset.role}；${asset.stableVisualDescription}`)
    .join("\n");
  const scenes = input.storyWorld.sceneAssets
    .map((asset, index) => `${index + 1}. ${asset.name}：${asset.location}；${asset.light}；${asset.spatialLogic}`)
    .join("\n");

  return {
    prompt: [
      "请把已确认的 StoryCam 故事世界拆成一个核心分镜组。",
      "",
      `目标核心分镜组数：${durationPlan.coreGroupTargetCount}`,
      "每组时长：约 15 秒。",
      `总计划时长：约 ${durationPlan.plannedDurationSeconds} 秒。`,
      "",
      `剧本标题：${script.title}`,
      `一句话：${script.logline}`,
      `摘要：${script.summary}`,
      `节拍：${script.beats.join(" / ")}`,
      "",
      `人物资产：\n${characters}`,
      "",
      `场景资产：\n${scenes}`,
      "",
      "输出要求：",
      "1. groups 数量必须等于目标核心分镜组数，MVP 当前固定为 1 组。",
      "2. 这一组是一段 15 秒内视频片段的拍摄脚本，不是单张装饰图。",
      "2a. 分镜脚本必须是已确认 story-world 剧本的改编；不得脱离上方角色资产和场景资产另造人物、地点、服装、道具或空间关系。",
      "3. 该组必须包含 title、storyPurpose、emotionalTurn、planSummary、rhythm、tone、mainImagePrompt、frames。",
      "4. frames 必须正好 9 帧，frameNumber 为 1-9；第 1 帧 canvasPosition=center，是核心分镜主图；第 2-9 帧依次为 top-left/top/top-right/left/right/bottom-left/bottom/bottom-right。",
      "5. frames 每帧必须包含山隐九列分镜所需字段：timeRange、cameraAngle、shotSize、visualContent、scene、sound、technicalNotes、narrativePurpose，并补充 title、beatType、imagePrompt。",
      "6. imagePrompt 用英文写，适合文生图生成 16:9 分镜图；必须强调 stylized comic animation storyboard frame、fictional illustrated characters、consistent character and scene assets、not photorealistic。",
      "7. mainImagePrompt 必须等于第 1 帧 imagePrompt 的核心含义。",
      "8. 不要输出内部 id、sessionId、state、version、provider 或 Markdown。"
    ].join("\n"),
    system: [
      "你是 StoryCam 的核心分镜脚本师，把私人故事世界拆成普通用户能确认的 1 个核心分镜组。",
      "story-world 的剧本、角色资产和场景资产是唯一事实来源；你的分镜只改编这些资产，不新增世界观。",
      "你只写可拍摄的动作、表情、物件、光线和空间变化；不要暴露专业拍摄表格。",
      "这一组要能支撑中心主图和周围 8 张扩展分镜图，且最终作为一个视频片段生成单位。",
      "内部按山隐导演九列分镜思维组织：镜号、时长、摄影角度、景别、画面内容、场景、声音、备注、叙事目的。",
      "严格返回 SDK 结构化 JSON 输出要求的对象，不要包裹 Markdown，不要输出额外解释。"
    ].join("\n"),
    temperature: 0.25
  };
}

function normalizeStoryboardDraft(input: MockStoryboardInput, draft: OpenRouterStoryboardDraft): MockStoryboardOutput {
  const durationPlan = createDurationPlan(input);
  const characterAssetIds = input.storyWorld.characterAssets.slice(0, 3).map((asset) => asset.id);
  const sceneAssetId = input.storyWorld.sceneAssets[0]?.id;

  if (!sceneAssetId || characterAssetIds.length === 0) {
    throw new Error("Storyboard generation requires confirmed character and scene assets.");
  }

  const drafts = normalizedDraftGroups(draft.groups, durationPlan.coreGroupTargetCount);
  const coreStoryboardGroups = drafts.map((group, index) =>
    coreStoryboardGroupSchema.parse({
      characterAssetIds,
      emotionalTurn: nonEmptyText(group.emotionalTurn, "情绪发生一次可见转折"),
      estimatedClipDurationSeconds: 15,
      expandedCardIds: [],
      id: `core-group-${input.sessionId}-${index + 1}`,
      sceneAssetId,
      sessionId: input.sessionId,
      state: "ready",
      storyPurpose: nonEmptyText(group.storyPurpose, group.planSummary || input.storyWorld.script.summary),
      title: nonEmptyText(group.title, `核心分镜 ${index + 1}`),
      version: 1
    })
  );
  const storyboardScripts = drafts.map((group, index) => {
    const coreGroup = coreStoryboardGroups[index] ?? coreStoryboardGroups[0];

    if (!coreGroup) {
      throw new Error("Storyboard generation requires at least one core group.");
    }

    const frames = normalizeStoryboardFrames(group, coreGroup, input.sessionId);

    return storyboardScriptSchema.parse({
      id: `storyboard-script-${input.sessionId}-${index + 1}`,
      frames,
      mainImagePrompt: frames[0]?.imagePrompt ?? nonEmptyText(group.mainImagePrompt, fallbackImagePrompt(coreGroup.title)),
      planSummary: nonEmptyText(group.planSummary, coreGroup.storyPurpose),
      plannedDurationSeconds: 15,
      rhythm: nonEmptyText(group.rhythm, "停顿进入，动作推进，情绪留白"),
      sessionId: input.sessionId,
      state: "ready",
      tone: nonEmptyText(group.tone, "私人、克制、真实"),
      version: 1
    });
  });
  const storyboardScript = storyboardScriptSchema.parse({
    id: `storyboard-script-${input.sessionId}`,
    frames: storyboardScripts[0]?.frames,
    planSummary: storyboardScripts.map((script) => script.planSummary).join(" / "),
    plannedDurationSeconds: durationPlan.plannedDurationSeconds,
    rhythm: "15 秒内围绕一个可见情绪转折展开",
    sessionId: input.sessionId,
    state: "ready",
    tone: storyboardScripts[0]?.tone ?? "私人、克制、真实",
    version: 1
  });

  return {
    coreStoryboardGroups,
    expandedStoryboardCards: [],
    storyboardScript,
    storyboardScripts
  };
}

function normalizeStoryboardFrames(
  group: OpenRouterStoryboardGroupDraft,
  coreGroup: CoreStoryboardGroup,
  sessionId: string
): StoryboardFrame[] {
  const fallbackFrames = fallbackFramesForGroup(coreGroup, sessionId);
  const draftFrames = group.frames ?? [];

  return Array.from({ length: 9 }, (_, index) => {
    const fallback = fallbackFrames[index];
    const draft = draftFrames[index];

    return storyboardFrameSchema.parse({
      beatType: normalizeBeatType(draft?.beatType, fallback.beatType),
      cameraAngle: nonEmptyText(draft?.cameraAngle, fallback.cameraAngle),
      canvasPosition: normalizeCanvasPosition(draft?.canvasPosition, fallback.canvasPosition),
      durationSeconds: draft?.durationSeconds ?? fallback.durationSeconds,
      frameNumber: index + 1,
      imagePrompt: nonEmptyText(draft?.imagePrompt, fallback.imagePrompt),
      narrativePurpose: nonEmptyText(draft?.narrativePurpose, fallback.narrativePurpose),
      scene: nonEmptyText(draft?.scene, fallback.scene),
      shotSize: nonEmptyText(draft?.shotSize, fallback.shotSize),
      sound: nonEmptyText(draft?.sound, fallback.sound),
      technicalNotes: nonEmptyText(draft?.technicalNotes, fallback.technicalNotes),
      timeRange: nonEmptyText(draft?.timeRange, fallback.timeRange),
      title: nonEmptyText(draft?.title, fallback.title),
      visualContent: nonEmptyText(draft?.visualContent, fallback.visualContent)
    });
  });
}

function fallbackFramesForGroup(coreGroup: CoreStoryboardGroup, sessionId: string): StoryboardFrame[] {
  const positions = ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"] as const;
  const beatTypes = ["core", "enter", "action", "reaction", "atmosphere", "transition", "emotion", "continuation", "reaction"] as const;

  return positions.map((canvasPosition, index) =>
    storyboardFrameSchema.parse({
      beatType: beatTypes[index],
      cameraAngle: index === 0 ? "平视" : "微俯拍",
      canvasPosition,
      durationSeconds: index === 0 ? 3 : 1.5,
      frameNumber: index + 1,
      imagePrompt:
        index === 0
          ? fallbackImagePrompt(coreGroup.title)
          : `Stylized comic animation storyboard frame ${index + 1} for "${coreGroup.title}", ${coreGroup.storyPurpose}, fictional illustrated characters, visible action and reaction, consistent character and location assets, cinematic lighting, 16:9, no text, not photorealistic.`,
      narrativePurpose: index === 0 ? coreGroup.storyPurpose : "补充中心分镜周围的动作、反应和氛围连续性。",
      scene: `StoryCam confirmed scene for ${sessionId}`,
      shotSize: index === 0 ? "中景" : "近景",
      sound: "环境声与细微动作声",
      technicalNotes: "保持角色、服装、道具、场景与光线连续。",
      timeRange: `00:${String(index).padStart(2, "0")}-00:${String(index + 1).padStart(2, "0")}`,
      title: index === 0 ? coreGroup.title : `扩展分镜 ${index}`,
      visualContent: index === 0 ? coreGroup.storyPurpose : "围绕中心分镜展开一个可见的补充动作。"
    })
  );
}

function normalizeCanvasPosition(value: string | undefined, fallback: StoryboardFrame["canvasPosition"]) {
  const allowed = ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"];

  return allowed.includes(value ?? "") ? (value as StoryboardFrame["canvasPosition"]) : fallback;
}

function normalizeBeatType(value: string | undefined, fallback: StoryboardFrame["beatType"]) {
  const allowed = ["core", "enter", "action", "reaction", "atmosphere", "transition", "emotion", "continuation"];

  return allowed.includes(value ?? "") ? (value as StoryboardFrame["beatType"]) : fallback;
}

function normalizedDraftGroups(groups: OpenRouterStoryboardGroupDraft[], targetCount: 1 | 2 | 3) {
  return Array.from({ length: targetCount }, (_, index) => groups[index] ?? fallbackGroup(index));
}

function fallbackGroup(index: number): OpenRouterStoryboardGroupDraft {
  return {
    emotionalTurn: index === 0 ? "从隐藏到想靠近" : index === 1 ? "靠近后错过" : "把情绪收回去",
    mainImagePrompt: fallbackImagePrompt(`核心分镜 ${index + 1}`),
    planSummary: "用一个可见动作承载这段私人情绪。",
    rhythm: "停顿进入，动作推进，情绪留白",
    storyPurpose: "让观众看懂这段关系里的未说出口。",
    title: `核心分镜 ${index + 1}`,
    tone: "私人、克制、真实"
  };
}

function fallbackImagePrompt(title: string) {
  return `Stylized comic animation storyboard frame for "${title}", fictional illustrated people in a grounded private-memory scene, consistent character and location assets, restrained emotion, cinematic lighting, 16:9, no text, not photorealistic.`;
}

function nonEmptyText(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}
