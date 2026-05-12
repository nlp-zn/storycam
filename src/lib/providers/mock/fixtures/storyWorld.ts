import type { CharacterAsset, SceneAsset, StoryScript } from "@/features/storycam/domain/artifacts";

const baseArtifact = {
  sessionId: "session-1",
  state: "ready",
  version: 1
} as const;

export type MockStoryWorldFixture = {
  characterAssets: CharacterAsset[];
  sceneAssets: SceneAsset[];
  script: StoryScript;
};

export const rainyKDramaStoryWorldFixture = {
  script: {
    ...baseArtifact,
    beats: ["雨夜删改短信", "便利店门铃响起", "玻璃倒影短暂重叠"],
    id: "script-rainy-kdrama-crush",
    logline: "她在雨夜便利店门口，把一条没有发出的告白短信删了又写。",
    directorBrief: {
      dialogueStrategy: "少台词，用删短信、停顿和回头表达。",
      microRhythm: "0-3秒建立雨夜屋檐等待，3-8秒推进手机删改动作，8-12秒用门铃触发回头反应，12-15秒留在玻璃反光里。",
      shotDensity: "慢进入，门铃后轻微加密，最后停住。",
      shotSizeFocus: "中景建立便利店门口，近景落到手机和眼神，结尾回到玻璃反光空镜。",
      soundStrategy: "雨声持续，便利店门铃作为转折，低声配乐托住私人回忆感。",
      tone: "雨夜、克制、私人回忆",
      transitionStrategy: "用门铃和视线反应自然连接，不做强技术感转场。",
      userFacingSummary: "这一段会先安静等待，再用门铃和玻璃反光完成一次错过。",
      visualMotifs: ["雨声", "玻璃反光", "未发送短信"]
    },
    qualityChecks: ["剧本已转成可见动作和可听声音。", "剧本已转成 15 秒节奏。"],
    summary: "冷白灯、雨水和玻璃反光让两个人短暂同框，故事停在没有说出口的那一秒。",
    title: "雨夜未发送",
    visualStyle: "漫画电影/动画分镜风格，雨夜冷暖混合光，低饱和色彩，克制真实的私人回忆质感，非写实真人"
  },
  characterAssets: [
    {
      ...baseArtifact,
      emotionalBaseline: "克制、犹豫、把情绪藏在动作里",
      id: "character-rainy-crush-lead",
      name: "她",
      props: ["手机", "透明伞"],
      referenceMediaIds: [],
      relationshipToUserStory: "承载那段没有说出口的暗恋记忆",
      role: "暗恋者",
      stableVisualDescription: "虚构漫画角色，湿发贴在脸侧，浅色风衣，手指反复点亮手机屏幕",
      wardrobe: "浅色风衣、低饱和围巾",
      consistencyNotes: ["表演始终收住，不做大哭或奔跑"]
    },
    {
      ...baseArtifact,
      emotionalBaseline: "安静、迟疑，像是不确定是否该开口",
      id: "character-rainy-crush-counterpart",
      name: "他",
      props: ["深色折叠伞"],
      referenceMediaIds: [],
      relationshipToUserStory: "作为暗恋对象，让靠近和错过成为可见关系",
      role: "关键对手戏人物",
      stableVisualDescription: "虚构漫画角色，二十多岁，深色短发，深蓝外套，进出便利店时动作克制",
      wardrobe: "深蓝外套、黑色长裤",
      consistencyNotes: ["始终保持深色外套和安静站姿", "只作为关系人物出现，不喧宾夺主"]
    }
  ],
  sceneAssets: [
    {
      ...baseArtifact,
      atmosphere: "潮湿、安静、私人回忆感",
      id: "scene-rainy-convenience-store",
      keyObjects: ["便利店玻璃门", "伞面雨滴", "手机屏幕"],
      light: "冷白便利店灯混合暖色街灯",
      location: "雨夜街角便利店门口",
      name: "便利店外的玻璃反光",
      referenceMediaIds: [],
      scenePanels: [
        {
          description: "雨夜街角便利店门口，屋檐、玻璃门和街灯在同一个空间中。",
          keyObjects: ["便利店玻璃门", "屋檐", "街灯"],
          purpose: "建立整个故事发生的主场景。",
          shotType: "establishing",
          title: "便利店外景"
        },
        {
          description: "玻璃门上留出两道可供角色后续入画的冷白反光区域。",
          keyObjects: ["玻璃门", "冷白反光"],
          purpose: "预留两人靠近但没有真正相认的空间关系。",
          shotType: "medium",
          title: "玻璃倒影"
        },
        {
          description: "手机屏幕停在未发送短信，雨滴落在手背上。",
          keyObjects: ["手机屏幕", "雨滴"],
          purpose: "把暗恋情绪落到可见物件上。",
          shotType: "detail",
          title: "未发送短信"
        },
        {
          description: "冷白便利店灯和暖色街灯在湿地面上反光。",
          keyObjects: ["便利店灯", "街灯", "湿地面"],
          purpose: "固定整段短片的光线质感。",
          shotType: "lighting",
          title: "灯光反射"
        }
      ],
      spatialLogic: "她在门外低头删短信，他从店里出来，倒影在玻璃上短暂重叠",
      timeOfDay: "night"
    }
  ]
} satisfies MockStoryWorldFixture;

export const malformedStoryWorldFixture = {
  ...rainyKDramaStoryWorldFixture,
  script: {
    ...rainyKDramaStoryWorldFixture.script,
    beats: []
  }
};
