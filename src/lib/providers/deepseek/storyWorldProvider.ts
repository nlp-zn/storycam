import { z } from "zod";
import {
  characterAssetSchema,
  directorBriefSchema,
  sceneAssetSchema,
  scenePanelShotTypes,
  storyScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import { runStoryCamDirectorQualityChecks } from "@/features/storycam/domain/directorQualityChecks";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import {
  storyWorldProviderOutputSchema,
  type StoryWorldProviderInput,
  type StoryWorldProviderOutput
} from "@/lib/providers/storyWorld";
import type { ProviderResult, TextGenerationProvider } from "@/lib/providers/types";
import { normalizeStoryCamVisualStyle } from "@/lib/storycam/visualStylePolicy";
import { createOpenRouterFetch } from "@/server/ai/openrouterProxyFetch";

export type DeepSeekStoryWorldProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  fallbackModels?: string[];
  fetchDeepSeek?: typeof fetch;
  maxAttempts?: number;
  model: string;
};

type DeepSeekStoryWorldRequestInput = {
  input: StoryWorldProviderInput;
  model: string;
};

const deepSeekDefaultBaseUrl = "https://api.deepseek.com/beta";
const submitStoryWorldFunctionName = "submit_story_world";
const draftTextSchema = z.string().trim().min(1);
const deepSeekScenePanelDraftSchema = z.object({
  description: draftTextSchema,
  keyObjects: z.array(draftTextSchema).max(6),
  purpose: draftTextSchema,
  shotType: z.enum(scenePanelShotTypes),
  title: draftTextSchema
});
const deepSeekStoryWorldDraftSchema = z.object({
  characterAssets: z.array(
    z.object({
      consistencyNotes: z.array(draftTextSchema).max(4),
      emotionalBaseline: draftTextSchema,
      name: draftTextSchema,
      props: z.array(draftTextSchema).max(6),
      relationshipToUserStory: draftTextSchema,
      role: draftTextSchema,
      stableVisualDescription: draftTextSchema,
      wardrobe: z.string()
    })
  ).min(1).max(3),
  sceneAssets: z.array(
    z.object({
      atmosphere: draftTextSchema,
      keyObjects: z.array(draftTextSchema).max(8),
      light: draftTextSchema,
      location: draftTextSchema,
      name: draftTextSchema,
      scenePanels: z.array(deepSeekScenePanelDraftSchema).min(4).max(6),
      spatialLogic: draftTextSchema,
      timeOfDay: draftTextSchema
    })
  ).length(1),
  script: z.object({
    beats: z.array(draftTextSchema).min(1).max(8),
    directorBrief: directorBriefSchema,
    logline: draftTextSchema,
    summary: draftTextSchema,
    title: draftTextSchema,
    visualStyle: draftTextSchema
  })
});

type DeepSeekStoryWorldDraft = z.infer<typeof deepSeekStoryWorldDraftSchema>;
type DeepSeekStoryWorldCharacterDraft = DeepSeekStoryWorldDraft["characterAssets"][number];
type DeepSeekStoryWorldSceneDraft = DeepSeekStoryWorldDraft["sceneAssets"][number];

export function createDeepSeekStoryWorldProvider(
  options: DeepSeekStoryWorldProviderOptions
): TextGenerationProvider<StoryWorldProviderInput, StoryWorldProviderOutput> {
  const identity = {
    providerKind: "text" as const,
    providerName: "deepseek" as const
  };
  const baseUrl = options.baseUrl ?? deepSeekDefaultBaseUrl;
  const fetchDeepSeek = options.fetchDeepSeek ?? createDefaultDeepSeekFetch();
  const models = [options.model, ...(options.fallbackModels ?? [])];
  const maxAttempts = Math.max(1, options.maxAttempts ?? models.length);

  return {
    ...identity,
    async generate(input): Promise<ProviderResult<StoryWorldProviderOutput>> {
      let lastFailure: ProviderResult<StoryWorldProviderOutput> | undefined;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const model = models[Math.min(attempt, models.length - 1)];
        const result = await generateWithModel({
          apiKey: options.apiKey,
          baseUrl,
          fetchDeepSeek,
          input,
          model
        });

        if (result.ok) {
          return providerSuccess(identity, result.value);
        }

        lastFailure = result;
      }

      return lastFailure ?? providerFailure(identity, new Error("DeepSeek returned no result."), {
        errorCode: "DEEPSEEK_TEXT_PROVIDER_FAILED",
        retryable: true
      });
    }
  };
}

export function buildDeepSeekStoryWorldRequest({ input, model }: DeepSeekStoryWorldRequestInput) {
  const choices = input.lightweightChoices?.length ? input.lightweightChoices.join("、") : "留白多一点";
  const photoReferences = (input.uploadedPhotoRefs ?? []).map((ref) => ref.mediaAssetId);

  return {
    max_tokens: 4096,
    messages: [
      {
        content: [
          "你是 StoryCam 的私人故事剧本整理器，把普通用户的一句话变成可拍摄的故事世界。",
          "必须调用 submit_story_world，不要直接输出自然语言。",
          "这是剧本整理阶段，不是分镜拆解阶段；下一阶段 core storyboard 才会根据剧本生成分镜脚本、镜头组和主分镜图。",
          "script.summary 和 script.beats 只能写短剧本层面的剧情、角色动作、对白/可听声音、关键物件和环境变化。",
          "script.beats 是剧情节点/故事段落，不是镜头列表、分镜表或拍摄方案；每条用一句可读的剧情动作描述。",
          "同时对剧本做视听化微调：把心理和抽象情绪转成可见动作、关键物件、空间变化和可听声音。",
          "script.directorBrief 必须生成内部导演简报，字段包括 tone、visualMotifs、dialogueStrategy、soundStrategy、microRhythm、shotDensity、shotSizeFocus、transitionStrategy、userFacingSummary。",
          "directorBrief.microRhythm 必须按 15 秒微型节奏描述：0-3秒建立状态，3-8秒动作推进，8-12秒反应/转折，12-15秒留白收束。",
          "不要写镜头编号、景别、机位、运镜、构图、剪辑、转场指令，也不要出现“镜头”“画面”“特写”“推近”“切到”“第 X 镜”等分镜术语。",
          "script.visualStyle 必须定义为漫画电影/动画分镜风格；可以吸收用户的情绪、时代、类型片倾向，但必须转译为非写实真人的虚构漫画角色和动画场景。",
          "人物资产只输出主角级或关键对手戏人物，最多 3 个；不要为背景人群、路人、短暂提及人物建资产。",
          "凡是会正面出镜、持续互动或承担情感关系的角色，都必须同时生成人物资产；剧本后续不能依赖没有资产的可见人物来完成情绪。",
          "宠物故事里，如果主人会出现在门口、抚摸、团聚或与宠物同框，宠物和主人都必须同时生成人物资产；如果不建主人资产，就只能用离屏声音、门、灯光、物件变化表达主人。",
          "场景资产必须且只能输出 1 个。这个唯一场景要用 scenePanels 覆盖剧本需要的 4-6 个小切图：主场景、关键物件、光线、动作空间或转场角度。",
          "scenePanels 只能描述无人环境、关键物件、光线、空间动线和可供角色后续入画的位置；不要写可见人物、人物倒影、人物剪影、手、身体局部或人群。",
          "不要输出内部 id、sessionId、state、version、provider、prompt 或分镜表。",
          "产品主线是私人漫画电影，不生成写实真人短剧，不做真实人物或名人相似脸。"
        ].join("\n"),
        role: "system" as const
      },
      {
        content: [
          "把下面的私人念头整理成 StoryCam story world。",
          `用户输入：${input.idea}`,
          `拍法倾向：${choices}`,
          `上传照片引用数量：${photoReferences.length}`,
          photoReferences.length ? `照片媒体 ID：${photoReferences.join(", ")}` : "照片媒体 ID：无",
          "只通过 submit_story_world 的 arguments 返回结构化内容。"
        ].join("\n"),
        role: "user" as const
      }
    ],
    model,
    temperature: 0.2,
    thinking: {
      type: "disabled" as const
    },
    tool_choice: {
      function: {
        name: submitStoryWorldFunctionName
      },
      type: "function" as const
    },
    tools: [
      {
        function: {
          description: "Return the complete StoryCam story world draft.",
          name: submitStoryWorldFunctionName,
          parameters: deepSeekStoryWorldJsonSchema,
          strict: true
        },
        type: "function" as const
      }
    ]
  };
}

async function generateWithModel(input: {
  apiKey: string;
  baseUrl: string;
  fetchDeepSeek: typeof fetch;
  input: StoryWorldProviderInput;
  model: string;
}): Promise<ProviderResult<StoryWorldProviderOutput>> {
  const identity = {
    providerKind: "text" as const,
    providerName: "deepseek" as const
  };

  try {
    const response = await input.fetchDeepSeek(`${input.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      body: JSON.stringify(buildDeepSeekStoryWorldRequest({ input: input.input, model: input.model })),
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json"
      },
      method: "POST",
      signal: AbortSignal.timeout(90_000)
    });

    if (!response.ok) {
      return providerFailure(identity, new Error(`DeepSeek request failed with status ${response.status}.`), {
        errorCode: "DEEPSEEK_TEXT_PROVIDER_FAILED",
        retryable: true
      });
    }

    const responseJson = await response.json();
    const toolArguments = extractSubmitStoryWorldArguments(responseJson);
    const rawDraft = parseToolArguments(toolArguments);
    const draft = deepSeekStoryWorldDraftSchema.parse(rawDraft);

    return providerSuccess(identity, normalizeStoryWorldDraft(input.input, draft));
  } catch (error) {
    return providerFailure(identity, error, classifyDeepSeekStoryWorldError(error));
  }
}

function extractSubmitStoryWorldArguments(responseJson: unknown) {
  const choices = responseJson && typeof responseJson === "object" && "choices" in responseJson
    ? (responseJson as { choices?: unknown }).choices
    : undefined;
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined;
  const message = firstChoice && typeof firstChoice === "object" && "message" in firstChoice
    ? (firstChoice as { message?: unknown }).message
    : undefined;
  const toolCalls = message && typeof message === "object" && "tool_calls" in message
    ? (message as { tool_calls?: unknown }).tool_calls
    : undefined;
  const submitToolCall = Array.isArray(toolCalls)
    ? toolCalls.find((toolCall) => {
        const fn = toolCall && typeof toolCall === "object" && "function" in toolCall
          ? (toolCall as { function?: unknown }).function
          : undefined;

        return fn && typeof fn === "object" && (fn as { name?: unknown }).name === submitStoryWorldFunctionName;
      })
    : undefined;
  const fn = submitToolCall && typeof submitToolCall === "object" && "function" in submitToolCall
    ? (submitToolCall as { function?: unknown }).function
    : undefined;
  const toolArguments = fn && typeof fn === "object" && "arguments" in fn
    ? (fn as { arguments?: unknown }).arguments
    : undefined;

  if (typeof toolArguments !== "string" || !toolArguments.trim()) {
    throw new DeepSeekStoryWorldProviderError("DEEPSEEK_TOOL_CALL_MISSING");
  }

  return toolArguments;
}

function parseToolArguments(toolArguments: string) {
  try {
    return JSON.parse(toolArguments);
  } catch {
    throw new DeepSeekStoryWorldProviderError("DEEPSEEK_TOOL_ARGUMENTS_INVALID_JSON");
  }
}

function normalizeStoryWorldDraft(input: StoryWorldProviderInput, draft: DeepSeekStoryWorldDraft): StoryWorldProviderOutput {
  const referenceMediaIds = (input.uploadedPhotoRefs ?? []).map((ref) => ref.mediaAssetId);
  const script = storyScriptSchema.parse({
    beats: draft.script.beats,
    directorBrief: draft.script.directorBrief,
    id: `script-${input.sessionId}`,
    logline: draft.script.logline,
    qualityChecks: runStoryCamDirectorQualityChecks({
      script: {
        beats: draft.script.beats,
        directorBrief: draft.script.directorBrief,
        summary: draft.script.summary
      }
    }),
    sessionId: input.sessionId,
    state: "ready",
    summary: draft.script.summary,
    title: draft.script.title,
    version: 1,
    visualStyle: normalizeStoryCamVisualStyle(draft.script.visualStyle)
  });
  const characterAssets = draft.characterAssets.map((asset, index) => normalizeCharacterAsset(input, asset, index, referenceMediaIds));
  const sceneAssets = draft.sceneAssets.map((asset, index) => normalizeSceneAsset(input, asset, index, referenceMediaIds));

  return storyWorldProviderOutputSchema.parse({
    characterAssets,
    sceneAssets,
    script
  });
}

function normalizeCharacterAsset(
  input: StoryWorldProviderInput,
  asset: DeepSeekStoryWorldCharacterDraft,
  index: number,
  referenceMediaIds: string[]
) {
  return characterAssetSchema.parse({
    consistencyNotes: asset.consistencyNotes,
    emotionalBaseline: asset.emotionalBaseline,
    id: `character-${input.sessionId}-${index + 1}`,
    name: asset.name,
    props: asset.props,
    referenceMediaIds,
    relationshipToUserStory: asset.relationshipToUserStory,
    role: asset.role,
    sessionId: input.sessionId,
    stableVisualDescription: asset.stableVisualDescription,
    state: "ready",
    version: 1,
    wardrobe: asset.wardrobe
  });
}

function normalizeSceneAsset(
  input: StoryWorldProviderInput,
  asset: DeepSeekStoryWorldSceneDraft,
  index: number,
  referenceMediaIds: string[]
) {
  return sceneAssetSchema.parse({
    atmosphere: asset.atmosphere,
    id: `scene-${input.sessionId}-${index + 1}`,
    keyObjects: asset.keyObjects,
    light: asset.light,
    location: asset.location,
    name: asset.name,
    referenceMediaIds,
    scenePanels: asset.scenePanels,
    sessionId: input.sessionId,
    spatialLogic: asset.spatialLogic,
    state: "ready",
    timeOfDay: asset.timeOfDay,
    version: 1
  });
}

function classifyDeepSeekStoryWorldError(error: unknown) {
  if (error instanceof DeepSeekStoryWorldProviderError) {
    return {
      errorCode: error.code,
      retryable: true
    };
  }

  if (error instanceof z.ZodError) {
    return {
      errorCode: "DEEPSEEK_STORY_WORLD_INVALID_OUTPUT",
      retryable: true
    };
  }

  return {
    errorCode: "DEEPSEEK_TEXT_PROVIDER_FAILED",
    retryable: true
  };
}

function createDefaultDeepSeekFetch(): typeof fetch {
  return createOpenRouterFetch() ?? fetch;
}

class DeepSeekStoryWorldProviderError extends Error {
  constructor(readonly code: "DEEPSEEK_TOOL_ARGUMENTS_INVALID_JSON" | "DEEPSEEK_TOOL_CALL_MISSING") {
    super(`DeepSeek story world provider error: ${code}`);
    this.name = "DeepSeekStoryWorldProviderError";
  }
}

const stringSchema = { type: "string" } as const;
const stringArraySchema = (description: string) => ({
  description,
  items: stringSchema,
  type: "array" as const
});
const deepSeekStoryWorldJsonSchema = {
  additionalProperties: false,
  properties: {
    characterAssets: {
      items: {
        additionalProperties: false,
        properties: {
          consistencyNotes: stringArraySchema("1 to 4 concise visual consistency notes."),
          emotionalBaseline: stringSchema,
          name: stringSchema,
          props: stringArraySchema("0 to 6 visible props carried or used by the character."),
          relationshipToUserStory: stringSchema,
          role: stringSchema,
          stableVisualDescription: stringSchema,
          wardrobe: stringSchema
        },
        required: [
          "name",
          "role",
          "relationshipToUserStory",
          "stableVisualDescription",
          "emotionalBaseline",
          "wardrobe",
          "props",
          "consistencyNotes"
        ],
        type: "object" as const
      },
      description:
        "1 to 3 character assets. Include every key character that will be visibly on screen, repeatedly interact, or carry the emotional relationship; for pet stories, include both pet and owner when the owner appears on screen.",
      type: "array" as const
    },
    sceneAssets: {
      items: {
        additionalProperties: false,
        properties: {
          atmosphere: stringSchema,
          keyObjects: stringArraySchema("1 to 8 visible objects that anchor the scene."),
          light: stringSchema,
          location: stringSchema,
          name: stringSchema,
          scenePanels: {
            description:
              "Exactly 4 to 6 environment-only cut-in panels inside this single scene asset. Include establishing, object, light, empty action-space, or transition views as needed by the script. Do not describe visible people, human reflections, silhouettes, body parts, or crowds.",
            items: {
              additionalProperties: false,
              properties: {
                description: stringSchema,
                keyObjects: stringArraySchema("Visible objects in this panel."),
                purpose: stringSchema,
                shotType: {
                  description: "One of establishing, wide, medium, detail, lighting, overhead, transition.",
                  type: "string" as const
                },
                title: stringSchema
              },
              required: ["title", "shotType", "description", "purpose", "keyObjects"],
              type: "object" as const
            },
            type: "array" as const
          },
          spatialLogic: stringSchema,
          timeOfDay: stringSchema
        },
        required: ["name", "location", "timeOfDay", "light", "atmosphere", "keyObjects", "spatialLogic", "scenePanels"],
        type: "object" as const
      },
      description: "Exactly 1 scene asset. Put all environment needs into scenePanels instead of creating multiple scene assets.",
      type: "array" as const
    },
    script: {
      additionalProperties: false,
      properties: {
        beats: {
          description:
            "1 to 8 script-level story beats. These are narrative events, not shot lists, storyboard instructions, camera moves, framing, edits, or shot numbers.",
          items: stringSchema,
          type: "array" as const
        },
        directorBrief: {
          additionalProperties: false,
          description:
            "Internal StoryCam director brief. Keep it concise and do not expose professional terms in script.summary or script.beats.",
          properties: {
            dialogueStrategy: stringSchema,
            microRhythm: stringSchema,
            shotDensity: stringSchema,
            shotSizeFocus: stringSchema,
            soundStrategy: stringSchema,
            tone: stringSchema,
            transitionStrategy: stringSchema,
            userFacingSummary: stringSchema,
            visualMotifs: stringArraySchema("1 to 6 recurring visible or audible motifs.")
          },
          required: [
            "tone",
            "visualMotifs",
            "dialogueStrategy",
            "soundStrategy",
            "microRhythm",
            "shotDensity",
            "shotSizeFocus",
            "transitionStrategy",
            "userFacingSummary"
          ],
          type: "object" as const
        },
        logline: stringSchema,
        summary: stringSchema,
        title: stringSchema,
        visualStyle: {
          description:
            "One concise shared visual style for both character and scene asset images. It must stay in StoryCam's comic film / animation storyboard direction, not live-action realism.",
          type: "string" as const
        }
      },
      required: ["title", "logline", "summary", "visualStyle", "beats", "directorBrief"],
      type: "object" as const
    }
  },
  required: ["script", "characterAssets", "sceneAssets"],
  type: "object" as const
};
