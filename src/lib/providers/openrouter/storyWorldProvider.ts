import { z } from "zod";
import {
  characterAssetSchema,
  directorBriefSchema,
  sceneAssetSchema,
  scenePanelShotTypes,
  storyScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import { defaultDirectorBrief, runStoryCamDirectorQualityChecks } from "@/features/storycam/domain/directorQualityChecks";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import {
  storyWorldProviderOutputSchema,
  type StoryWorldProviderInput,
  type StoryWorldProviderOutput
} from "@/lib/providers/storyWorld";
import type { ProviderResult, TextGenerationProvider } from "@/lib/providers/types";
import { normalizeStoryCamVisualStyle } from "@/lib/storycam/visualStylePolicy";
import { handdrawnTravelVlogVisualStyle, isHanddrawnTravelVlogMode } from "@/features/storycam/domain/storyModes";
import { type StoryCamGenerateObject } from "@/server/ai/vercelAiClient";
import { createOpenRouterTextProvider, type OpenRouterStructuredPrompt } from "./textProvider";

export type OpenRouterStoryWorldProviderOptions = {
  apiKey: string;
  fallbackModels?: string[];
  generateObject?: StoryCamGenerateObject;
  maxAttempts?: number;
  model: string;
};

const draftTextSchema = z.string().trim().min(1).catch("");
const draftTextListSchema = (maxItems: number) => z.array(draftTextSchema).max(maxItems).catch([]);
const emptyDraftScript = {
  beats: [],
  directorBrief: undefined,
  logline: "",
  summary: "",
  title: "",
  visualStyle: ""
};
const draftScriptSchema = z
  .object({
    beats: draftTextListSchema(8),
    directorBrief: directorBriefSchema.optional().catch(undefined),
    logline: draftTextSchema,
    summary: draftTextSchema,
    title: draftTextSchema,
    visualStyle: draftTextSchema.optional().catch("")
  })
  .catch(emptyDraftScript);
const draftScenePanelSchema = z.object({
  description: draftTextSchema,
  keyObjects: draftTextListSchema(6),
  purpose: draftTextSchema,
  shotType: z.enum(scenePanelShotTypes).catch("detail"),
  title: draftTextSchema
});

const openRouterStoryWorldDraftSchema = z.object({
  characterAssets: z
    .array(
      z.object({
        consistencyNotes: draftTextListSchema(4),
        emotionalBaseline: draftTextSchema,
        name: draftTextSchema,
        props: draftTextListSchema(6),
        relationshipToUserStory: draftTextSchema,
        role: draftTextSchema,
        stableVisualDescription: draftTextSchema,
        wardrobe: draftTextSchema.optional()
      })
    )
    .max(3)
    .optional()
    .catch([]),
  sceneAssets: z
    .array(
      z.object({
        atmosphere: draftTextSchema,
        keyObjects: draftTextListSchema(8),
        light: draftTextSchema,
        location: draftTextSchema,
        name: draftTextSchema,
        scenePanels: z.array(draftScenePanelSchema).max(6).optional().catch([]),
        spatialLogic: draftTextSchema,
        timeOfDay: draftTextSchema
      })
    )
    .max(3)
    .optional()
    .catch([]),
  script: draftScriptSchema.optional().catch(emptyDraftScript)
});

type OpenRouterStoryWorldDraft = z.infer<typeof openRouterStoryWorldDraftSchema>;
type OpenRouterStoryWorldCharacterDraft = NonNullable<OpenRouterStoryWorldDraft["characterAssets"]>[number];
type OpenRouterStoryWorldSceneDraft = NonNullable<OpenRouterStoryWorldDraft["sceneAssets"]>[number];

export function createOpenRouterStoryWorldProvider(
  options: OpenRouterStoryWorldProviderOptions
): TextGenerationProvider<StoryWorldProviderInput, StoryWorldProviderOutput> {
  const identity = {
    providerKind: "text" as const,
    providerName: "openrouter" as const
  };
  const draftProvider = createOpenRouterTextProvider<StoryWorldProviderInput, OpenRouterStoryWorldDraft>({
    apiKey: options.apiKey,
    buildPrompt: buildOpenRouterStoryWorldPrompt,
    fallbackModels: options.fallbackModels,
    generateObject: options.generateObject,
    maxAttempts: options.maxAttempts,
    model: options.model,
    outputSchema: openRouterStoryWorldDraftSchema,
    schemaDescription:
      "A structured StoryCam story world draft containing a short script, character assets, and scene assets.",
    schemaName: "storycam_story_world_draft"
  });

  return {
    ...identity,
    async generate(input): Promise<ProviderResult<StoryWorldProviderOutput>> {
      const draftResult = await draftProvider.generate(input);

      if (!draftResult.ok) {
        return draftResult;
      }

      try {
        return providerSuccess(identity, normalizeStoryWorldDraft(input, draftResult.value));
      } catch (error) {
        return providerFailure(identity, error, {
          errorCode: "OPENROUTER_STORY_WORLD_INVALID_OUTPUT",
          retryable: true
        });
      }
    }
  };
}

export function buildOpenRouterStoryWorldPrompt(input: StoryWorldProviderInput): OpenRouterStructuredPrompt<StoryWorldProviderInput> {
  const choices = input.lightweightChoices?.length ? input.lightweightChoices.join("、") : "留白多一点";
  const photoReferences = (input.uploadedPhotoRefs ?? []).map((ref) => ref.mediaAssetId);
  const handdrawnTravelRules = isHanddrawnTravelVlogMode(input.storyModeId)
    ? [
        "",
        "手绘旅行 VLOG 模式额外要求：",
        `A. 旅行地：${input.travelDestination ?? "用户指定旅行地"}`,
        "B. 必须只生成 1 个可见主角人物资产：由用户上传照片转译出的手绘旅行者；其他人只能作为离屏声音、物件变化或空间反应，不得可见。",
        "C. 人物稳定视觉描述要说明：参考用户照片的发型、眼镜、穿搭轮廓、站姿和气质，但必须是手绘小人/漫画角色，不是真人相似脸。",
        "D. 场景资产是一个真实旅行地路线资产板，scenePanels 生成 4-6 个同一目的地内的真实地点小切图：入口、街道/建筑、地标/观景、光线、细节或转场。",
        "E. 剧本是轻剧情 VLOG：一次走路、停下、回头、拍照、发现小细节或情绪停顿，不是纯打卡合集。"
      ]
    : [];

  return {
    prompt: [
      "请根据以下私人故事念头，生成 StoryCam 的故事世界草稿。",
      "",
      `用户输入：${input.idea}`,
      `拍法倾向：${choices}`,
      `上传照片引用数量：${photoReferences.length}`,
      photoReferences.length ? `照片媒体 ID：${photoReferences.join(", ")}` : "照片媒体 ID：无",
      input.storyModeId ? `故事模式：${input.storyModeId}` : "故事模式：默认",
      input.travelDestination ? `旅行地：${input.travelDestination}` : "",
      "",
      "输出要求：",
      "1. 把粗糙文本整理成一个 8-15 秒私人短片可承载的短剧本。",
      "2. 这是剧本整理阶段，不是分镜拆解阶段；下一阶段 core storyboard 才会根据剧本生成分镜脚本、镜头组和主分镜图。",
      "3. script.summary 和 script.beats 只写短剧本层面的剧情、角色动作、对白/可听声音、关键物件和环境变化。",
      "4. script.beats 是剧情节点/故事段落，不是镜头列表、分镜表或拍摄方案；每条用一句可读的剧情动作描述。",
      "4a. 生成时先做视听化微调：把心理描写和抽象情绪转为可见动作、物件、空间变化和可听声音。",
      "4b. script.directorBrief 必须包含 tone、visualMotifs、dialogueStrategy、soundStrategy、microRhythm、shotDensity、shotSizeFocus、transitionStrategy、userFacingSummary。",
      "4c. directorBrief.microRhythm 必须按 15 秒微型节奏描述：0-3秒建立状态，3-8秒动作推进，8-12秒反应/转折，12-15秒留白收束。",
      "5. 不要写镜头编号、景别、机位、运镜、构图、剪辑、转场指令，也不要出现“镜头”“画面”“特写”“推近”“切到”“第 X 镜”等分镜术语。",
      "6. script.visualStyle 必须定义为漫画电影/动画分镜风格；可以吸收用户的情绪、时代、类型片倾向，但必须转译为非写实真人的虚构漫画角色和动画场景。",
      "7. 只生成 1-3 个主角级/关键对手戏人物资产，不要为背景人群、路人、短暂提及人物建资产。",
      "7a. 凡是会正面出镜、持续互动或承担情感关系的角色，都必须同时生成人物资产；剧本后续不能依赖没有资产的可见人物来完成情绪。",
      "7b. 宠物故事里，如果主人会出现在门口、抚摸、团聚或与宠物同框，宠物和主人都必须同时生成人物资产；如果不建主人资产，就只能用离屏声音、门、灯光、物件变化表达主人。",
      "8. 场景资产必须且只能生成 1 个；把剧本需要的全部环境角度放进这个 scene 的 scenePanels。",
      "9. scenePanels 生成 4-6 个小切图描述，覆盖主场景、关键物件、光线、空的动作空间或转场角度。",
      "10. scenePanels 只能描述无人环境、关键物件、光线、空间动线和可供角色后续入画的位置；不要写可见人物、人物倒影、人物剪影、手、身体局部或人群。",
      "11. 人物稳定视觉描述要包含外观、衣着、可重复道具或动作习惯。",
      "12. 地点资产要写清空间关系、光线、时间和关键物件。",
      "13. 不要输出内部 id、sessionId、state、version、provider、prompt 或分镜表。",
      ...handdrawnTravelRules
    ].join("\n"),
    system: [
      "你是 StoryCam 的私人故事剧本整理器，把普通用户的一句话变成可拍摄的故事世界。",
      "参考山音导演方法的前置剧本梳理：先判断叙事目的和情绪基调，再把粗糙文本整理成场景结构和核心事件；不要提前进入节奏规划、镜头组或分镜拆解。",
      "你需要在内部完成剧本视听化微调和 15 秒导演简报，但不要把专业表格暴露给用户。",
      "写作红线：不要写心理描写，不要用括号暗示，不要说教，不要把专业分镜术语暴露给用户。",
      "Story World 的 beats 是剧情节点，不是分镜；专业镜头语言只允许在后续 core storyboard provider 内部使用。",
      "台词和描述要口语、克制、具体；画面内容只写可见元素，声音只写可听元素。",
      "产品主线是私人漫画电影，不生成写实真人短剧，不做真实人物或名人相似脸。",
      "严格返回 SDK 结构化 JSON 输出要求的对象，不要包裹 Markdown，不要输出额外解释。"
    ].join("\n"),
    temperature: 0.3
  };
}

function normalizeStoryWorldDraft(input: StoryWorldProviderInput, draft: OpenRouterStoryWorldDraft): StoryWorldProviderOutput {
  const referenceMediaIds = (input.uploadedPhotoRefs ?? []).map((ref) => ref.mediaAssetId);
  const draftScript = draft.script ?? emptyDraftScript;
  const draftCharacterAssets = draft.characterAssets ?? [];
  const draftSceneAssets = draft.sceneAssets ?? [];
  const isHanddrawnTravel = isHanddrawnTravelVlogMode(input.storyModeId);
  const title = nonEmptyText(draftScript.title, "私人短片");
  const logline = nonEmptyText(draftScript.logline, input.idea);
  const summary = nonEmptyText(draftScript.summary, logline);
  const beats = nonEmptyList(draftScript.beats, [summary]);
  const visualStyle = normalizeStoryCamVisualStyle(
    isHanddrawnTravel
      ? handdrawnTravelVlogVisualStyle
      : nonEmptyText(draftScript.visualStyle, inferFallbackVisualStyle(input, { logline, summary, title }))
  );
  const directorBrief =
    draftScript.directorBrief ??
    defaultDirectorBrief({
      idea: input.idea,
      lightweightChoices: input.lightweightChoices,
      summary,
      title
    });
  const characterDrafts = (draftCharacterAssets.length ? draftCharacterAssets : [createFallbackCharacterDraft(input, summary)]).slice(
    0,
    isHanddrawnTravel ? 1 : 3
  );
  const sceneDrafts = draftSceneAssets.length ? [draftSceneAssets[0]] : [createFallbackSceneDraft(input, summary)];
  const script = storyScriptSchema.parse({
    beats,
    directorBrief,
    id: `script-${input.sessionId}`,
    logline,
    qualityChecks: runStoryCamDirectorQualityChecks({
      script: {
        beats,
        directorBrief,
        summary
      }
    }),
    sessionId: input.sessionId,
    state: "ready",
    ...(input.storyModeId ? { storyModeId: input.storyModeId } : {}),
    summary,
    title,
    version: 1,
    visualStyle
  });
  const characterAssets = characterDrafts.map((asset, index) =>
    characterAssetSchema.parse({
      consistencyNotes: nonEmptyList(asset.consistencyNotes, ["保持外观、衣着和动作习惯稳定"]),
      emotionalBaseline: nonEmptyText(asset.emotionalBaseline, "克制、真实，用可见动作表达情绪"),
      id: `character-${input.sessionId}-${index + 1}`,
      name: nonEmptyText(asset.name, index === 0 ? "主角" : `人物 ${index + 1}`),
      props: nonEmptyList(asset.props, ["与故事相关的随身物件"]),
      referenceMediaIds,
      relationshipToUserStory: nonEmptyText(asset.relationshipToUserStory, "承载用户故事里的核心情绪"),
      role: nonEmptyText(asset.role, index === 0 ? "主角" : "关系人物"),
      sessionId: input.sessionId,
      stableVisualDescription: nonEmptyText(
        asset.stableVisualDescription,
        isHanddrawnTravel
          ? "由上传照片转译出的手绘旅行者，保留发型、眼镜、穿搭轮廓、站姿和气质，但不是写实真人相似脸"
          : "虚构漫画角色外观，衣着朴素，动作克制，便于连续镜头保持一致"
      ),
      state: "ready",
      version: 1,
      ...(asset.wardrobe ? { wardrobe: asset.wardrobe } : {})
    })
  );
  const sceneAssets = sceneDrafts.map((asset, index) => {
    const fallbackName = fallbackSceneAssetName(input, index, isHanddrawnTravel);
    const location = sceneAssetLocation(input, asset, isHanddrawnTravel);

    return sceneAssetSchema.parse({
      atmosphere: nonEmptyText(asset.atmosphere, "安静、私人、带一点未说出口的情绪"),
      id: `scene-${input.sessionId}-${index + 1}`,
      keyObjects: nonEmptyList(asset.keyObjects, ["灯光", "门口", "随身物件"]),
      light: nonEmptyText(asset.light, "自然环境光混合一处可见实用光源"),
      location,
      name: nonEmptyText(asset.name, fallbackName),
      referenceMediaIds,
      scenePanels: scenePanelsForDraft(asset, input, summary),
      sessionId: input.sessionId,
      spatialLogic: nonEmptyText(asset.spatialLogic, "人物在空间中移动，关键物件保持可见"),
      state: "ready",
      timeOfDay: nonEmptyText(asset.timeOfDay, "day"),
      version: 1
    });
  });

  return storyWorldProviderOutputSchema.parse({
    characterAssets,
    sceneAssets,
    script
  });
}

function sceneAssetLocation(
  input: StoryWorldProviderInput,
  asset: OpenRouterStoryWorldSceneDraft,
  isHanddrawnTravel: boolean
): string {
  if (isHanddrawnTravel) {
    return nonEmptyText(input.travelDestination, nonEmptyText(asset.location, "用户指定旅行地"));
  }

  return nonEmptyText(asset.location, "与故事记忆相关的具体空间");
}

function fallbackSceneAssetName(input: StoryWorldProviderInput, index: number, isHanddrawnTravel: boolean): string {
  if (isHanddrawnTravel) {
    return `${input.travelDestination ?? "旅行地"}旅行路线`;
  }

  if (index === 0) {
    return "故事发生的地方";
  }

  return `地点 ${index + 1}`;
}

function nonEmptyText(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function nonEmptyList(values: string[] | undefined, fallback: string[]) {
  const cleaned = (values ?? []).map((value) => value.trim()).filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}

function inferFallbackVisualStyle(input: { idea: string; lightweightChoices?: string[] }, script: {
  logline: string;
  summary: string;
  title: string;
}) {
  const source = [input.idea, input.lightweightChoices?.join(" "), script.title, script.logline, script.summary].join(" ").toLowerCase();

  if (/(漫画|动漫|动画|二次元|anime|manga|comic)/i.test(source)) {
    return normalizeStoryCamVisualStyle("漫画/动画设定稿风格，干净线条，低饱和色彩，情绪克制");
  }

  if (/(绘本|童话|storybook|picture book)/i.test(source)) {
    return normalizeStoryCamVisualStyle("绘本式视觉风格，柔和纸感，温暖色彩，适合私人记忆");
  }

  if (/(胶片|复古|film|retro|vintage)/i.test(source)) {
    return normalizeStoryCamVisualStyle("复古胶片电影感，柔和颗粒，低对比光影，私人回忆质感");
  }

  return normalizeStoryCamVisualStyle();
}

function createFallbackCharacterDraft(input: StoryWorldProviderInput, summary: string): OpenRouterStoryWorldCharacterDraft {
  return {
    consistencyNotes: ["保持服装、发型和随身物件稳定"],
    emotionalBaseline: "克制、真实，用停顿和小动作表达情绪",
    name: "主角",
    props: ["随身物件"],
    relationshipToUserStory: summary,
    role: "主角",
    stableVisualDescription: `围绕“${input.idea.slice(0, 40)}”生成的虚构漫画角色形象，外观稳定，动作克制`,
    wardrobe: "日常衣着"
  };
}

function createFallbackSceneDraft(input: StoryWorldProviderInput, summary: string): OpenRouterStoryWorldSceneDraft {
  return {
    atmosphere: "私人、安静、带一点电影感",
    keyObjects: ["环境光", "门口", "随身物件"],
    light: "自然环境光混合一处可见实用光源",
    location: "与私人记忆相关的具体空间",
    name: "故事发生的地方",
    scenePanels: [],
    spatialLogic: summary || input.idea,
    timeOfDay: "day"
  };
}

function scenePanelsForDraft(asset: OpenRouterStoryWorldSceneDraft, input: StoryWorldProviderInput, summary: string) {
  const panels = (asset.scenePanels ?? []).filter(
    (panel) => panel.title && panel.description && panel.purpose && panel.keyObjects.length > 0
  );

  if (panels.length >= 4 && panels.length <= 6) {
    return panels;
  }

  const keyObjects = nonEmptyList(asset.keyObjects, ["环境光", "门口", "随身物件"]);
  const spatialLogic = nonEmptyText(asset.spatialLogic, summary || input.idea);

  return [
    {
      description: `${nonEmptyText(asset.location, "故事发生的地方")} 的完整空间关系。`,
      keyObjects: keyObjects.slice(0, 3),
      purpose: "建立故事发生的主场景。",
      shotType: "establishing" as const,
      title: nonEmptyText(asset.name, "主场景")
    },
    {
      description: nonEmptyText(asset.light, "自然环境光混合一处可见实用光源"),
      keyObjects: keyObjects.slice(0, 3),
      purpose: "固定整组场景的光线基调。",
      shotType: "lighting" as const,
      title: "光线关系"
    },
    {
      description: keyObjects.join("、"),
      keyObjects,
      purpose: "明确后续分镜需要保持一致的关键物件。",
      shotType: "detail" as const,
      title: "关键物件"
    },
    {
      description: spatialLogic,
      keyObjects: keyObjects.slice(0, 3),
      purpose: "为后续角色入画预留空的动作空间。",
      shotType: "medium" as const,
      title: "动作空间"
    }
  ];
}
