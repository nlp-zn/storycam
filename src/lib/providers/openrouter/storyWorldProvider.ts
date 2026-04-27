import { z } from "zod";
import {
  characterAssetSchema,
  sceneAssetSchema,
  storyScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import {
  storyWorldProviderOutputSchema,
  type StoryWorldProviderInput,
  type StoryWorldProviderOutput
} from "@/lib/providers/storyWorld";
import type { ProviderResult, TextGenerationProvider } from "@/lib/providers/types";
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
    .catch([]),
  sceneAssets: z
    .array(
      z.object({
        atmosphere: draftTextSchema,
        keyObjects: draftTextListSchema(8),
        light: draftTextSchema,
        location: draftTextSchema,
        name: draftTextSchema,
        spatialLogic: draftTextSchema,
        timeOfDay: draftTextSchema
      })
    )
    .max(3)
    .catch([]),
  script: z.object({
    beats: draftTextListSchema(8),
    logline: draftTextSchema,
    summary: draftTextSchema,
    title: draftTextSchema
  })
});

type OpenRouterStoryWorldDraft = z.infer<typeof openRouterStoryWorldDraftSchema>;

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
  const choices = input.lightweightChoices?.length ? input.lightweightChoices.join("、") : "像私人回忆";
  const photoReferences = (input.uploadedPhotoRefs ?? []).map((ref) => ref.mediaAssetId);

  return {
    prompt: [
      "请根据以下私人故事念头，生成 StoryCam 的故事世界草稿。",
      "",
      `用户输入：${input.idea}`,
      `拍法倾向：${choices}`,
      `上传照片引用数量：${photoReferences.length}`,
      photoReferences.length ? `照片媒体 ID：${photoReferences.join(", ")}` : "照片媒体 ID：无",
      "",
      "输出要求：",
      "1. 把粗糙文本整理成一个 8-15 秒私人短片可承载的短剧本。",
      "2. 所有 beat、人物、地点都必须能被摄影机拍到或被声音听到。",
      "3. 只生成 1-3 个主要人物资产和 1-3 个地点资产。",
      "4. 人物稳定视觉描述要包含外观、衣着、可重复道具或动作习惯。",
      "5. 地点资产要写清空间关系、光线、时间和关键物件。",
      "6. 不要输出内部 id、sessionId、state、version、provider、prompt 或分镜表。"
    ].join("\n"),
    system: [
      "你是 StoryCam 的私人故事剧本整理器，把普通用户的一句话变成可拍摄的故事世界。",
      "参考导演方法：先判断叙事目的和情绪基调，再把不可拍的心理活动翻译为可见动作、表情、物件和环境变化。",
      "写作红线：不要写心理描写，不要用括号暗示，不要说教，不要把专业分镜术语暴露给用户。",
      "台词和描述要口语、克制、具体；画面内容只写可见元素，声音只写可听元素。",
      "严格返回 SDK 结构化 JSON 输出要求的对象，不要包裹 Markdown，不要输出额外解释。"
    ].join("\n"),
    temperature: 0.3
  };
}

function normalizeStoryWorldDraft(input: StoryWorldProviderInput, draft: OpenRouterStoryWorldDraft): StoryWorldProviderOutput {
  const referenceMediaIds = (input.uploadedPhotoRefs ?? []).map((ref) => ref.mediaAssetId);
  const title = nonEmptyText(draft.script.title, "私人短片");
  const logline = nonEmptyText(draft.script.logline, input.idea);
  const summary = nonEmptyText(draft.script.summary, logline);
  const beats = nonEmptyList(draft.script.beats, [summary]);
  const characterDrafts = draft.characterAssets.length ? draft.characterAssets : [createFallbackCharacterDraft(input, summary)];
  const sceneDrafts = draft.sceneAssets.length ? draft.sceneAssets : [createFallbackSceneDraft(input, summary)];
  const script = storyScriptSchema.parse({
    beats,
    id: `script-${input.sessionId}`,
    logline,
    sessionId: input.sessionId,
    state: "ready",
    summary,
    title,
    version: 1
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
      stableVisualDescription: nonEmptyText(asset.stableVisualDescription, "普通人外观，衣着朴素，动作克制，便于连续镜头保持一致"),
      state: "ready",
      version: 1,
      ...(asset.wardrobe ? { wardrobe: asset.wardrobe } : {})
    })
  );
  const sceneAssets = sceneDrafts.map((asset, index) =>
    sceneAssetSchema.parse({
      atmosphere: nonEmptyText(asset.atmosphere, "安静、私人、带一点未说出口的情绪"),
      id: `scene-${input.sessionId}-${index + 1}`,
      keyObjects: nonEmptyList(asset.keyObjects, ["灯光", "门口", "随身物件"]),
      light: nonEmptyText(asset.light, "自然环境光混合一处可见实用光源"),
      location: nonEmptyText(asset.location, "与故事记忆相关的具体空间"),
      name: nonEmptyText(asset.name, index === 0 ? "故事发生的地方" : `地点 ${index + 1}`),
      referenceMediaIds,
      sessionId: input.sessionId,
      spatialLogic: nonEmptyText(asset.spatialLogic, "人物在空间中移动，关键物件保持可见"),
      state: "ready",
      timeOfDay: nonEmptyText(asset.timeOfDay, "day"),
      version: 1
    })
  );

  return storyWorldProviderOutputSchema.parse({
    characterAssets,
    sceneAssets,
    script
  });
}

function nonEmptyText(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function nonEmptyList(values: string[] | undefined, fallback: string[]) {
  const cleaned = (values ?? []).map((value) => value.trim()).filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}

function createFallbackCharacterDraft(input: StoryWorldProviderInput, summary: string): OpenRouterStoryWorldDraft["characterAssets"][number] {
  return {
    consistencyNotes: ["保持服装、发型和随身物件稳定"],
    emotionalBaseline: "克制、真实，用停顿和小动作表达情绪",
    name: "主角",
    props: ["随身物件"],
    relationshipToUserStory: summary,
    role: "主角",
    stableVisualDescription: `围绕“${input.idea.slice(0, 40)}”生成的普通人形象，外观稳定，动作克制`,
    wardrobe: "日常衣着"
  };
}

function createFallbackSceneDraft(input: StoryWorldProviderInput, summary: string): OpenRouterStoryWorldDraft["sceneAssets"][number] {
  return {
    atmosphere: "私人、安静、带一点电影感",
    keyObjects: ["环境光", "门口", "随身物件"],
    light: "自然环境光混合一处可见实用光源",
    location: "与私人记忆相关的具体空间",
    name: "故事发生的地方",
    spatialLogic: summary || input.idea,
    timeOfDay: "day"
  };
}
