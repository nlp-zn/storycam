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
  generateObject?: StoryCamGenerateObject;
  maxAttempts?: number;
  model: string;
};

const openRouterStoryWorldDraftSchema = z.object({
  characterAssets: z
    .array(
      z.object({
        consistencyNotes: z.array(z.string().min(1)).max(4).default([]),
        emotionalBaseline: z.string().min(1),
        name: z.string().min(1),
        props: z.array(z.string().min(1)).max(6).default([]),
        relationshipToUserStory: z.string().min(1),
        role: z.string().min(1),
        stableVisualDescription: z.string().min(1),
        wardrobe: z.string().min(1).optional()
      })
    )
    .min(1)
    .max(3),
  sceneAssets: z
    .array(
      z.object({
        atmosphere: z.string().min(1),
        keyObjects: z.array(z.string().min(1)).min(1).max(8),
        light: z.string().min(1),
        location: z.string().min(1),
        name: z.string().min(1),
        spatialLogic: z.string().min(1),
        timeOfDay: z.string().min(1)
      })
    )
    .min(1)
    .max(3),
  script: z.object({
    beats: z.array(z.string().min(1)).min(1).max(8),
    logline: z.string().min(1),
    summary: z.string().min(1),
    title: z.string().min(1)
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
    generateObject: options.generateObject,
    maxAttempts: options.maxAttempts,
    model: options.model,
    outputSchema: openRouterStoryWorldDraftSchema
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
      "严格返回符合 schema 的结构化对象。"
    ].join("\n"),
    temperature: 0.45
  };
}

function normalizeStoryWorldDraft(input: StoryWorldProviderInput, draft: OpenRouterStoryWorldDraft): StoryWorldProviderOutput {
  const referenceMediaIds = (input.uploadedPhotoRefs ?? []).map((ref) => ref.mediaAssetId);
  const script = storyScriptSchema.parse({
    ...draft.script,
    id: `script-${input.sessionId}`,
    sessionId: input.sessionId,
    state: "ready",
    version: 1
  });
  const characterAssets = draft.characterAssets.map((asset, index) =>
    characterAssetSchema.parse({
      ...asset,
      id: `character-${input.sessionId}-${index + 1}`,
      referenceMediaIds,
      sessionId: input.sessionId,
      state: "ready",
      version: 1
    })
  );
  const sceneAssets = draft.sceneAssets.map((asset, index) =>
    sceneAssetSchema.parse({
      ...asset,
      id: `scene-${input.sessionId}-${index + 1}`,
      referenceMediaIds,
      sessionId: input.sessionId,
      state: "ready",
      version: 1
    })
  );

  return storyWorldProviderOutputSchema.parse({
    characterAssets,
    sceneAssets,
    script
  });
}
