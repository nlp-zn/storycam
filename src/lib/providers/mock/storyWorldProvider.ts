import {
  characterAssetSchema,
  sceneAssetSchema,
  storyScriptSchema
} from "@/features/storycam/domain/artifactSchemas";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type {
  StoryWorldProviderInput,
  StoryWorldProviderOutput,
  UploadedPhotoReference
} from "@/lib/providers/storyWorld";
import { storyWorldProviderOutputSchema } from "@/lib/providers/storyWorld";
import type { ProviderResult, TextGenerationProvider } from "@/lib/providers/types";
import { handdrawnTravelVlogVisualStyle, isHanddrawnTravelVlogMode } from "@/features/storycam/domain/storyModes";
import { rainyKDramaStoryWorldFixture, type MockStoryWorldFixture } from "./fixtures/storyWorld";

export type { UploadedPhotoReference };
export type MockStoryWorldInput = StoryWorldProviderInput;
export type MockStoryWorldOutput = StoryWorldProviderOutput;

export function createMockStoryWorldProvider(
  fixture: MockStoryWorldFixture = rainyKDramaStoryWorldFixture
): TextGenerationProvider<MockStoryWorldInput, MockStoryWorldOutput> {
  return {
    providerKind: "text",
    providerName: "mock",
    async generate(input) {
      return generateMockStoryWorld(input, fixture);
    }
  };
}

function generateMockStoryWorld(
  input: MockStoryWorldInput,
  fixture: MockStoryWorldFixture
): Promise<ProviderResult<MockStoryWorldOutput>> {
  try {
    if (isHanddrawnTravelVlogMode(input.storyModeId)) {
      return Promise.resolve(providerSuccess({ providerKind: "text", providerName: "mock" }, mockHanddrawnTravelStoryWorld(input)));
    }

    const referenceMediaIds = (input.uploadedPhotoRefs ?? []).map((ref) => ref.mediaAssetId);
    const output = storyWorldProviderOutputSchema.parse({
      script: storyScriptSchema.parse({
        ...fixture.script,
        sessionId: input.sessionId
      }),
      characterAssets: fixture.characterAssets.map((asset) =>
        characterAssetSchema.parse({
          ...asset,
          referenceMediaIds,
          sessionId: input.sessionId
        })
      ),
      sceneAssets: fixture.sceneAssets.map((asset) =>
        sceneAssetSchema.parse({
          ...asset,
          referenceMediaIds,
          sessionId: input.sessionId
        })
      )
    });

    return Promise.resolve(providerSuccess({ providerKind: "text", providerName: "mock" }, output));
  } catch (error) {
    return Promise.resolve(
      providerFailure(
        {
          providerKind: "text",
          providerName: "mock"
        },
        error,
        {
          errorCode: "MOCK_STORY_WORLD_INVALID_FIXTURE",
          retryable: false
        }
      )
    );
  }
}

function mockHanddrawnTravelStoryWorld(input: MockStoryWorldInput): MockStoryWorldOutput {
  const referenceMediaIds = (input.uploadedPhotoRefs ?? []).map((ref) => ref.mediaAssetId);
  const destination = input.travelDestination ?? "真实旅行地";
  const output = storyWorldProviderOutputSchema.parse({
    script: storyScriptSchema.parse({
      beats: [
        `手绘旅行者走进${destination}的第一条街。`,
        "他在有光的墙边停下，举起小相机。",
        "风吹过路口，他回头看了一眼，继续往前走。"
      ],
      id: `script-${input.sessionId}`,
      logline: `一个由照片转成的手绘旅行者，在${destination}走出一段轻剧情 VLOG。`,
      qualityChecks: ["手绘旅行 VLOG 已保留故事世界确认；照片只用于角色手绘化参考。"],
      sessionId: input.sessionId,
      state: "ready",
      storyModeId: input.storyModeId,
      summary: `午后的${destination}有石板路、街角光线和远处景色。由照片转成的手绘旅行者慢慢走进这里，停下拍一张照，又在风里继续向前。`,
      title: "手绘旅行者的一小段路",
      version: 1,
      visualStyle: handdrawnTravelVlogVisualStyle
    }),
    characterAssets: [
      characterAssetSchema.parse({
        consistencyNotes: [
          "保持上传照片里的发型、眼镜、穿搭轮廓和站姿气质。",
          "始终是粗线条手绘旅行角色，不生成写实真人相似脸。"
        ],
        emotionalBaseline: "轻松、好奇，用走路、停下和回头表达情绪",
        id: `character-${input.sessionId}-travel-1`,
        name: "手绘旅行者",
        props: ["小相机"],
        referenceMediaIds,
        relationshipToUserStory: "由用户照片转译出的手绘旅行主角",
        role: "主角",
        sessionId: input.sessionId,
        stableVisualDescription: "由上传照片转译出的黑线手绘旅行者，保留发型、眼镜、穿搭轮廓、站姿和松弛气质",
        state: "ready",
        version: 1,
        wardrobe: "参考上传照片中的日常旅行穿搭轮廓"
      })
    ],
    sceneAssets: [
      sceneAssetSchema.parse({
        atmosphere: "阳光、松弛、真实旅行感",
        id: `scene-${input.sessionId}-travel-1`,
        keyObjects: ["石板路", "街角墙面", "远处景色"],
        light: "午后自然光",
        location: destination,
        name: `${destination}旅行路线`,
        referenceMediaIds: [],
        scenePanels: [
          {
            description: `${destination}的街道入口，空的石板路和建筑立面形成旅行路线起点。`,
            keyObjects: ["石板路", "建筑立面", "街道入口"],
            purpose: "建立旅行地。",
            shotType: "establishing",
            title: "路线入口"
          },
          {
            description: "有纹理的墙面、窗台和小物件形成可反复出现的旅行细节。",
            keyObjects: ["墙面", "窗台", "小物件"],
            purpose: "固定目的地细节。",
            shotType: "detail",
            title: "街角细节"
          },
          {
            description: "午后光线从街道一侧落下，地面保留空的角色入画位置。",
            keyObjects: ["午后光", "地面", "街角"],
            purpose: "固定光线。",
            shotType: "lighting",
            title: "午后光线"
          },
          {
            description: "空的观景位置和远处景色，预留手绘旅行者停下回头的位置。",
            keyObjects: ["观景位置", "远处景色"],
            purpose: "预留动作空间。",
            shotType: "wide",
            title: "远景停顿"
          }
        ],
        sessionId: input.sessionId,
        spatialLogic: "角色从街道入口走到街角墙面，再到能看到远处景色的位置。",
        state: "ready",
        timeOfDay: "afternoon",
        version: 1
      })
    ]
  });

  return output;
}
