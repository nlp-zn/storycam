import { z } from "zod";
import {
  coreStoryboardGroupSchema,
  storyboardFrameSchema,
  storyboardScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import { defaultDirectorBrief } from "@/features/storycam/domain/directorQualityChecks";
import type { CoreStoryboardGroup, DirectorBrief, StoryboardFrame } from "@/features/storycam/domain/artifacts";
import { createDurationPlan } from "@/features/storycam/domain/durationRules";
import { isHanddrawnTravelVlogMode } from "@/features/storycam/domain/storyModes";
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
  visibleCharacterAssetIds: z.array(draftTextSchema).max(3).optional().catch(undefined),
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

export function buildOpenRouterStoryboardPrompt(input: MockStoryboardInput): OpenRouterStructuredPrompt {
  const durationPlan = createDurationPlan(input);
  const script = input.storyWorld.script;
  const isHanddrawnTravel = isHanddrawnTravelVlogMode(script.storyModeId);
  const directorBrief =
    script.directorBrief ??
    defaultDirectorBrief({
      lightweightChoices: [],
      summary: script.summary,
      title: script.title
    });
  const characters = input.storyWorld.characterAssets
    .map((asset, index) => `${index + 1}. id=${asset.id}；${asset.name}：${asset.role}；${asset.stableVisualDescription}`)
    .join("\n");
  const scenes = input.storyWorld.sceneAssets
    .map((asset, index) => `${index + 1}. ${asset.name}：${asset.location}；${asset.light}；${asset.spatialLogic}；keyObjects=${formatSceneKeyObjects(asset.keyObjects)}；scenePanels=${formatScenePanels(asset.scenePanels)}`)
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
      "导演简报（internal director brief）：",
      `tone: ${directorBrief.tone}`,
      `visualMotifs: ${directorBrief.visualMotifs.join(" / ")}`,
      `dialogueStrategy: ${directorBrief.dialogueStrategy}`,
      `soundStrategy: ${directorBrief.soundStrategy}`,
      `micro rhythm: ${directorBrief.microRhythm}`,
      `shotDensity: ${directorBrief.shotDensity}`,
      `shotSizeFocus: ${directorBrief.shotSizeFocus}`,
      `transitionStrategy: ${directorBrief.transitionStrategy}`,
      `userFacingSummary: ${directorBrief.userFacingSummary}`,
      "",
      `人物资产：\n${characters}`,
      "",
      `场景资产：\n${scenes}`,
      "",
      "输出要求：",
      "1. groups 数量必须等于目标核心分镜组数，MVP 当前固定为 1 组。",
      "2. 这一组是一段 15 秒内视频片段的拍摄脚本，不是单张装饰图。",
      "2a. 分镜脚本必须是已确认 story-world 剧本的改编；不得脱离上方角色资产和场景资产另造人物、地点、服装、道具或空间关系。",
      "2b. 场景资产里的 keyObjects 和 scenePanels 是连续性锚点；门、窗、墙缝、植物、花、招牌、光源、地标等固定物件在 9 帧中必须保持同一空间关系和所在侧，不得在不同帧移到另一面墙或另一侧。",
      "3. 该组必须包含 title、storyPurpose、emotionalTurn、planSummary、rhythm、tone、mainImagePrompt、frames。",
      "4. frames 必须正好 9 帧，frameNumber 为 1-9；第 1 帧 canvasPosition=center，是核心分镜主图；第 2-9 帧依次为 top-left/top/top-right/left/right/bottom-left/bottom/bottom-right。",
      "5. frames 每帧必须包含山隐九列分镜所需字段：timeRange、cameraAngle、shotSize、visualContent、scene、sound、technicalNotes、narrativePurpose，并补充 title、beatType、imagePrompt、visibleCharacterAssetIds。",
      "5a. visibleCharacterAssetIds 是本帧可见角色资产 id 数组；每帧只能引用上方人物资产的 id，不得写角色姓名、未知 id、主人/路人/人影等未建资产角色。",
      "5b. 如果剧情需要未列入人物资产的人物，请改写为离屏效果、物件变化、门/灯/声音/视线反应，不要让其身体、脸、背影、剪影、手或局部出现在 imagePrompt 或 visualContent 里。",
      "5c. 山隐切镜连接规则：相邻帧不要连续使用同一景别或相邻景别（例如中景接中近景、近景接特写也算太近），也不要连续使用同一摄影角度；每次切换景别至少跨一个级差，除非 technicalNotes 写明明确叙事理由。",
      "5d. 9 帧必须构成动作-反应、递进组、因果组或对比组中的至少一种镜头组逻辑；不要把相邻镜头硬凑在一起，每帧都要有承接上一帧的入口和留给下一帧的出口。",
      "5e. 风景或旅行场景不要连续堆同类风景图；用全景/近景/大特写/中远景/全景空镜等跨级景别或视角反差形成节奏，重要转折才使用跨级跳切或出彩构图。",
      "6. 用户可见字段必须使用简体中文：group 的 title、storyPurpose、emotionalTurn、planSummary、rhythm、tone，以及 frame 的 title、visualContent、scene、sound、technicalNotes、narrativePurpose、cameraAngle、shotSize。sound 必须写中文声音提示，不要输出英文音效列表。",
      "7. beatType、canvasPosition、visibleCharacterAssetIds 是结构化字段，按 schema 写；imagePrompt 是内部图像提示词，可以使用英文。",
      "8. rhythm、timeRange、durationSeconds、shotSize、cameraAngle、sound、narrativePurpose 必须受导演简报约束；15 秒内按 micro rhythm 完成建立状态、动作推进、反应/转折、留白收束。",
      "9. visualMotifs 至少一个必须落到 visualContent、sound 或 imagePrompt 中。",
      isHanddrawnTravel
        ? "10. imagePrompt 用英文写，适合图生图生成真实旅行 VLOG 分镜图；必须强调 real travel-location photography background / mobile VLOG still / one 2D hand-drawn illustrated traveler character / preserve actual destination architecture and natural light / fixed scene anchors keep the same side and object positions / background not comic, not anime, not painterly。"
        : "10. imagePrompt 用英文写，适合文生图生成 16:9 分镜图；必须强调 stylized comic animation storyboard frame、fictional illustrated characters、consistent character and scene assets、fixed scene anchors keep the same side and object positions、not photorealistic。",
      "11. mainImagePrompt 必须等于第 1 帧 imagePrompt 的核心含义。",
      "12. 不要输出内部 id、sessionId、state、version、provider 或 Markdown。"
    ].join("\n"),
    system: [
      "你是 StoryCam 的核心分镜脚本师，把私人故事世界拆成普通用户能确认的 1 个核心分镜组。",
      "story-world 的剧本、角色资产和场景资产是唯一事实来源；你的分镜只改编这些资产，不新增世界观。",
      "除内部 imagePrompt 外，所有普通用户会看到的分镜脚本文案都必须写成简体中文。",
      "你只写可拍摄的动作、表情、物件、光线和空间变化；不要暴露专业拍摄表格。",
      "这一组要能支撑中心主图和周围 8 张扩展分镜图，且最终作为一个视频片段生成单位。",
      "内部按山隐导演九列分镜思维组织：镜号、时长、摄影角度、景别、画面内容、场景、声音、备注、叙事目的。",
      "应用山隐切镜连接逻辑：动作-反应清楚，景别至少跨级变化，重复或相邻景别镜头必须有明确叙事理由。",
      "严格返回 SDK 结构化 JSON 输出要求的对象，不要包裹 Markdown，不要输出额外解释。"
    ].join("\n"),
    temperature: 0.25
  };
}

function formatSceneKeyObjects(values: string[]) {
  return values.length ? values.join(" / ") : "未列出";
}

function formatScenePanels(panels: Array<{ description: string; keyObjects: string[]; purpose: string; shotType: string; title: string }>) {
  if (!panels.length) {
    return "未列出";
  }

  return panels
    .map((panel) => {
      const keyObjects = panel.keyObjects.length ? panel.keyObjects.join(" / ") : "未列出";

      return `${panel.title}/${panel.shotType}：${panel.description}；purpose=${panel.purpose}；keyObjects=${keyObjects}`;
    })
    .join(" | ");
}

function normalizeStoryboardDraft(input: MockStoryboardInput, draft: OpenRouterStoryboardDraft): MockStoryboardOutput {
  const durationPlan = createDurationPlan(input);
  const characterAssetIds = input.storyWorld.characterAssets.slice(0, 3).map((asset) => asset.id);
  const sceneAssetId = input.storyWorld.sceneAssets[0]?.id;
  const directorBrief =
    input.storyWorld.script.directorBrief ??
    defaultDirectorBrief({
      summary: input.storyWorld.script.summary,
      title: input.storyWorld.script.title
    });

  if (!sceneAssetId || characterAssetIds.length === 0) {
    throw new Error("Storyboard generation requires confirmed character and scene assets.");
  }

  const drafts = normalizedDraftGroups(draft.groups, durationPlan.coreGroupTargetCount);
  const coreStoryboardGroups = drafts.map((group, index) =>
    coreStoryboardGroupSchema.parse({
      characterAssetIds,
      emotionalTurn: userVisibleChineseText(group.emotionalTurn, fallbackGroupEmotionalTurn(index)),
      estimatedClipDurationSeconds: 15,
      expandedCardIds: [],
      id: `core-group-${input.sessionId}-${index + 1}`,
      sceneAssetId,
      sessionId: input.sessionId,
      state: "ready",
      storyPurpose: userVisibleChineseText(
        group.storyPurpose,
        userVisibleChineseText(group.planSummary, "把已确认故事压缩成一个可见的情绪转折。")
      ),
      title: userVisibleChineseText(group.title, `核心分镜 ${index + 1}`),
      version: 1
    })
  );
  const storyboardScripts = drafts.map((group, index) => {
    const coreGroup = coreStoryboardGroups[index] ?? coreStoryboardGroups[0];

    if (!coreGroup) {
      throw new Error("Storyboard generation requires at least one core group.");
    }

    const frames = normalizeStoryboardFrames(group, coreGroup, input.sessionId, directorBrief);

    return storyboardScriptSchema.parse({
      id: `storyboard-script-${input.sessionId}-${index + 1}`,
      frames,
      mainImagePrompt: frames[0]?.imagePrompt ?? nonEmptyText(group.mainImagePrompt, fallbackImagePrompt(coreGroup.title)),
      planSummary: userVisibleChineseText(group.planSummary, coreGroup.storyPurpose),
      plannedDurationSeconds: 15,
      rhythm: userVisibleChineseText(
        group.rhythm,
        directorBrief.microRhythm,
        "0-3秒建立状态，3-8秒推进动作，8-12秒给反应，12-15秒留白收束。"
      ),
      sessionId: input.sessionId,
      state: "ready",
      tone: userVisibleChineseText(group.tone, directorBrief.tone, "私人、克制、真实"),
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
  sessionId: string,
  directorBrief: DirectorBrief
): StoryboardFrame[] {
  const fallbackFrames = fallbackFramesForGroup(coreGroup, sessionId, directorBrief);
  const draftFrames = group.frames ?? [];

  const frames = Array.from({ length: 9 }, (_, index) => {
    const fallback = fallbackFrames[index];
    const draft = draftFrames[index];
    const visibleCharacterAssetIds = normalizeVisibleCharacterAssetIds(
      draft?.visibleCharacterAssetIds,
      fallback.visibleCharacterAssetIds,
      coreGroup.characterAssetIds
    );

    return storyboardFrameSchema.parse({
      beatType: normalizeBeatType(draft?.beatType, fallback.beatType),
      cameraAngle: userVisibleChineseText(draft?.cameraAngle, fallback.cameraAngle, "平视"),
      canvasPosition: normalizeCanvasPosition(draft?.canvasPosition, fallback.canvasPosition),
      durationSeconds: draft?.durationSeconds ?? fallback.durationSeconds,
      frameNumber: index + 1,
      imagePrompt: nonEmptyText(draft?.imagePrompt, fallback.imagePrompt),
      narrativePurpose: userVisibleChineseText(draft?.narrativePurpose, fallback.narrativePurpose, "补足这一拍的叙事动作。"),
      scene: userVisibleChineseText(draft?.scene, fallback.scene, "已确认的故事场景"),
      shotSize: userVisibleChineseText(draft?.shotSize, fallback.shotSize, "中景"),
      sound: userVisibleChineseText(draft?.sound, fallback.sound, "环境声作为主要声音锚点，配乐保持低声。"),
      technicalNotes: userVisibleChineseText(draft?.technicalNotes, fallback.technicalNotes, "保持角色、服装、道具、场景与光线连续。"),
      timeRange: nonEmptyText(draft?.timeRange, fallback.timeRange),
      title: userVisibleChineseText(draft?.title, fallback.title, `分镜 ${String(index + 1).padStart(2, "0")}`),
      visibleCharacterAssetIds,
      visualContent: userVisibleChineseText(draft?.visualContent, fallback.visualContent, "围绕中心主图补充一个可见动作。")
    });
  });

  return applyShotRhythmGuard(frames);
}

function fallbackFramesForGroup(coreGroup: CoreStoryboardGroup, sessionId: string, directorBrief: DirectorBrief): StoryboardFrame[] {
  const positions = ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"] as const;
  const beatTypes = ["core", "enter", "action", "reaction", "atmosphere", "transition", "emotion", "continuation", "reaction"] as const;
  const motifLine = directorBrief.visualMotifs.join(", ");

  return positions.map((canvasPosition, index) => {
    const shotPlan = shanyinShotRhythmPlan(index);

    return storyboardFrameSchema.parse({
      beatType: beatTypes[index],
      cameraAngle: shotPlan.cameraAngle,
      canvasPosition,
      durationSeconds: index === 0 ? 3 : 1.5,
      frameNumber: index + 1,
      imagePrompt: fallbackFrameImagePrompt(index, coreGroup, motifLine, shotPlan),
      narrativePurpose: index === 0 ? coreGroup.storyPurpose : `${directorBrief.microRhythm} 补充中心分镜周围的动作、反应和氛围连续性。`,
      scene: `已确认故事场景 ${sessionId}`,
      shotSize: shotPlan.shotSize,
      sound: directorBrief.soundStrategy,
      technicalNotes: `${shotPlan.connectionNote} ${directorBrief.transitionStrategy} 保持角色、服装、道具、场景与光线连续。`,
      timeRange: `00:${String(index).padStart(2, "0")}-00:${String(index + 1).padStart(2, "0")}`,
      title: index === 0 ? coreGroup.title : `扩展分镜 ${index}`,
      visibleCharacterAssetIds: coreGroup.characterAssetIds,
      visualContent: fallbackVisualContent(index, coreGroup, directorBrief)
    });
  });
}

function applyShotRhythmGuard(frames: StoryboardFrame[]): StoryboardFrame[] {
  const repairedFrames: StoryboardFrame[] = [];

  for (const [index, frame] of frames.entries()) {
    const previous = repairedFrames[index - 1];
    const beforePrevious = repairedFrames[index - 2];

    if (!previous || !needsShotRhythmRepair(frame, previous, beforePrevious)) {
      repairedFrames.push(frame);
      continue;
    }

    const shotPlan = shanyinShotRhythmPlanForRepair(index, previous);

    repairedFrames.push(
      storyboardFrameSchema.parse({
        ...frame,
        cameraAngle: shotPlan.cameraAngle,
        imagePrompt: appendShotVariationCue(frame.imagePrompt, shotPlan.imagePromptCue),
        shotSize: shotPlan.shotSize,
        technicalNotes: appendTechnicalNote(frame.technicalNotes, `避免连续同景别或相邻景别，与上一帧跨级拉开景别和角度，${shotPlan.connectionNote}`)
      })
    );
  }

  return repairedFrames;
}

function needsShotRhythmRepair(frame: StoryboardFrame, previous: StoryboardFrame, beforePrevious?: StoryboardFrame) {
  if (sameOrAdjacentShotSize(frame, previous)) {
    return true;
  }

  if (sameShotPair(frame, previous)) {
    return true;
  }

  return Boolean(beforePrevious && sameShotSize(frame, previous) && sameShotSize(previous, beforePrevious));
}

function sameShotPair(left: StoryboardFrame, right: StoryboardFrame) {
  return sameShotSize(left, right) && normalizeShotText(left.cameraAngle) === normalizeShotText(right.cameraAngle);
}

function sameShotSize(left: StoryboardFrame, right: StoryboardFrame) {
  return normalizeShotText(left.shotSize) === normalizeShotText(right.shotSize);
}

function sameOrAdjacentShotSize(left: StoryboardFrame, right: StoryboardFrame) {
  const leftScale = shotScale(left.shotSize);
  const rightScale = shotScale(right.shotSize);

  if (leftScale === null || rightScale === null) {
    return sameShotSize(left, right);
  }

  return Math.abs(leftScale - rightScale) <= 1;
}

function shotScale(value: string): number | null {
  const normalized = normalizeShotText(value);

  if (normalized.includes("中远") || normalized.includes("mediumwide")) {
    return 2;
  }

  if (normalized.includes("中近") || normalized.includes("mediumclose")) {
    return 4;
  }

  if (normalized.includes("大特写") || normalized.includes("极特写") || normalized.includes("extremeclose")) {
    return 7;
  }

  if (normalized.includes("特写") || normalized.includes("closeup") || normalized.includes("detail")) {
    return 6;
  }

  if (normalized.includes("近景") || normalized.includes("near") || normalized.includes("close")) {
    return 5;
  }

  if (normalized.includes("中景") || normalized.includes("medium")) {
    return 3;
  }

  if (normalized.includes("全景") || normalized.includes("空镜") || normalized.includes("wide") || normalized.includes("establishing")) {
    return 1;
  }

  if (normalized.includes("远景") || normalized.includes("longshot")) {
    return 0;
  }

  return null;
}

function normalizeShotText(value: string) {
  return value.replace(/[\s_-]+/g, "").toLowerCase();
}

function shanyinShotRhythmPlanForRepair(index: number, previous: StoryboardFrame) {
  const preferred = shanyinShotRhythmPlan(index);

  if (isNonAdjacentShotPlan(preferred, previous, true)) {
    return preferred;
  }

  return (
    shanyinShotRhythmPlans.find((plan) => isNonAdjacentShotPlan(plan, previous, true)) ??
    shanyinShotRhythmPlans.find((plan) => isNonAdjacentShotPlan(plan, previous, false)) ??
    preferred
  );
}

function isNonAdjacentShotPlan(plan: ShanyinShotRhythmPlan, previous: StoryboardFrame, requireAngleChange: boolean) {
  const planScale = shotScale(plan.shotSize);
  const previousScale = shotScale(previous.shotSize);
  const hasScaleContrast = planScale === null || previousScale === null
    ? normalizeShotText(plan.shotSize) !== normalizeShotText(previous.shotSize)
    : Math.abs(planScale - previousScale) > 1;
  const hasAngleContrast = normalizeShotText(plan.cameraAngle) !== normalizeShotText(previous.cameraAngle);

  return hasScaleContrast && (!requireAngleChange || hasAngleContrast);
}

function appendShotVariationCue(imagePrompt: string, cue: string) {
  if (imagePrompt.includes("shot variation")) {
    return imagePrompt;
  }

  return `${imagePrompt} shot variation: ${cue}.`;
}

function appendTechnicalNote(value: string, note: string) {
  return value.includes(note) ? value : `${value} ${note}`;
}

function normalizeVisibleCharacterAssetIds(
  values: string[] | undefined,
  fallbackIds: string[] | undefined,
  allowedIds: string[]
) {
  const allowed = new Set(allowedIds);

  if (values !== undefined) {
    const requestedIds = values.map((value) => value.trim()).filter((value) => allowed.has(value));
    return Array.from(new Set(requestedIds)).slice(0, 3);
  }

  return (fallbackIds ?? allowedIds).filter((id) => allowed.has(id)).slice(0, 3);
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
  const emotionalTurn = fallbackGroupEmotionalTurn(index);

  return {
    emotionalTurn,
    mainImagePrompt: fallbackImagePrompt(`核心分镜 ${index + 1}`),
    planSummary: "用一个可见动作承载这段私人情绪。",
    rhythm: "停顿进入，动作推进，情绪留白",
    storyPurpose: "让观众看懂这段关系里的未说出口。",
    title: `核心分镜 ${index + 1}`,
    tone: "私人、克制、真实"
  };
}

type ShanyinShotRhythmPlan = {
  cameraAngle: string;
  connectionNote: string;
  imagePromptCue: string;
  shotSize: string;
};

const shanyinShotRhythmPlans: ShanyinShotRhythmPlan[] = [
  {
    cameraAngle: "平视",
    connectionNote: "中心主图用稳定中景建立空间和人物关系。",
    imagePromptCue: "center anchor, medium eye-level composition, clear spatial baseline",
    shotSize: "中景"
  },
  {
    cameraAngle: "微俯拍",
    connectionNote: "从中心中景切到全景，先交代人物所在的真实空间。",
    imagePromptCue: "wide establishing view, slight high angle, contrast with the center medium shot",
    shotSize: "全景"
  },
  {
    cameraAngle: "平视",
    connectionNote: "从全景推到近景，把注意力落回人物动作。",
    imagePromptCue: "close character action, eye-level, push in from the previous wide view",
    shotSize: "近景"
  },
  {
    cameraAngle: "低机位贴近",
    connectionNote: "用大特写或细节镜头承接动作，形成明显跨级景别反差。",
    imagePromptCue: "extreme detail close-up, low camera, strong contrast from the previous action shot",
    shotSize: "大特写"
  },
  {
    cameraAngle: "侧面平视",
    connectionNote: "从细节弹回中远景或侧面，展示动作对空间的影响。",
    imagePromptCue: "medium-wide side view, spatial reaction after the detail shot",
    shotSize: "中远景"
  },
  {
    cameraAngle: "微俯拍",
    connectionNote: "再切近景呈现反应或关键物件，避免连续同类风景。",
    imagePromptCue: "near reaction shot, slight high angle, object or gesture focus",
    shotSize: "近景"
  },
  {
    cameraAngle: "高位俯拍",
    connectionNote: "用全景空镜或环境反应给节奏留白。",
    imagePromptCue: "wide environmental reaction or empty-frame beat, high angle breathing space",
    shotSize: "全景空镜"
  },
  {
    cameraAngle: "侧逆光",
    connectionNote: "从空镜切到特写，强调情绪或固定场景锚点。",
    imagePromptCue: "close-up emotional or landmark detail, side backlight, rhythmic contrast",
    shotSize: "特写"
  },
  {
    cameraAngle: "平视拉远",
    connectionNote: "结尾回到中景或中远景，收束动作并保留余味。",
    imagePromptCue: "medium pull-back ending, return to readable space after close detail",
    shotSize: "中景拉远"
  }
];

function shanyinShotRhythmPlan(index: number) {
  return shanyinShotRhythmPlans[index] ?? shanyinShotRhythmPlans[shanyinShotRhythmPlans.length - 1];
}

function fallbackFrameImagePrompt(index: number, coreGroup: CoreStoryboardGroup, motifLine: string, shotPlan: ShanyinShotRhythmPlan): string {
  if (index === 0) {
    return `${fallbackImagePrompt(coreGroup.title, motifLine)} shot variation: ${shotPlan.imagePromptCue}.`;
  }

  return `Stylized comic animation storyboard frame ${index + 1} for "${coreGroup.title}", ${coreGroup.storyPurpose}, visual motifs: ${motifLine}, ${shotPlan.imagePromptCue}, shot variation, fictional illustrated characters, visible action and reaction, consistent character and location assets, cinematic lighting, 16:9, no text, not photorealistic.`;
}

function fallbackVisualContent(index: number, coreGroup: CoreStoryboardGroup, directorBrief: DirectorBrief): string {
  const primaryMotif = directorBrief.visualMotifs[0] ?? "关键物件";

  if (index === 0) {
    return `${coreGroup.storyPurpose}，画面里落到${primaryMotif}。`;
  }

  return `围绕${primaryMotif}展开一个可见的补充动作。`;
}

function fallbackGroupEmotionalTurn(index: number): string {
  if (index === 0) {
    return "从隐藏到想靠近";
  }

  if (index === 1) {
    return "靠近后错过";
  }

  return "把情绪收回去";
}

function fallbackImagePrompt(title: string, visualMotifs = "key object, ambient light, pause") {
  return `Stylized comic animation storyboard frame for "${title}", visual motifs: ${visualMotifs}, fictional illustrated people in a grounded private-memory scene, consistent character and location assets, restrained emotion, cinematic lighting, 16:9, no text, not photorealistic.`;
}

function nonEmptyText(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function userVisibleChineseText(value: string | undefined, fallback: string, fallbackIfEnglish = fallback) {
  const fallbackText = nonEmptyText(fallbackIfEnglish, fallback);
  const text = nonEmptyText(value, fallbackText);

  if (containsCjk(text) || !containsLatinLetter(text)) {
    return text;
  }

  return containsCjk(fallbackText) || !containsLatinLetter(fallbackText) ? fallbackText : fallback;
}

function containsCjk(value: string) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(value);
}

function containsLatinLetter(value: string) {
  return /[A-Za-z]/.test(value);
}
