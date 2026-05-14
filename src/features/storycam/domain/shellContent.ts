import { handdrawnTravelVlogModeId } from "./storyModes";

export const directorChoices = ["留白多一点", "像旧照片", "雨夜韩剧感", "靠小动作推进"] as const;

export const storyModeEntries = [
  {
    id: "personal-memory",
    label: "私人记忆",
    preferredAspectRatio: "16:9",
    requiresPhoto: false,
    requiresTravelDestination: false,
    sampleIdea: "我想把暗恋拍成韩剧雨夜",
    text: "把一句真实念头拍成 10-15 秒私人短片。",
    directorChoices,
    defaultChoices: ["留白多一点"]
  },
  {
    id: "pet-theater",
    label: "宠物小剧场",
    preferredAspectRatio: "16:9",
    requiresPhoto: false,
    requiresTravelDestination: false,
    sampleIdea: "我想拍一只小狗等主人回家的十秒小剧场",
    text: "让宠物变成这一幕里的主角。",
    directorChoices: ["低机位跟随", "日常观察感", "温暖回家感", "轻喜剧反应"],
    defaultChoices: ["低机位跟随"]
  },
  {
    id: "novel-character",
    label: "小说角色",
    preferredAspectRatio: "16:9",
    requiresPhoto: false,
    requiresTravelDestination: false,
    sampleIdea: "我想让我的小说女主第一次走进雨夜城市",
    text: "把角色出场拍成短短一段预告。",
    directorChoices: ["初登场感", "世界观更强", "预告片节奏", "英雄式剪影"],
    defaultChoices: ["初登场感"]
  },
  {
    id: "emotion-short",
    label: "情绪短片",
    preferredAspectRatio: "16:9",
    requiresPhoto: false,
    requiresTravelDestination: false,
    sampleIdea: "我想把一种说不出口的难过拍成风里的短片",
    text: "把一种情绪变成可看见的画面。",
    directorChoices: ["空镜多一点", "像一阵风", "声音先走", "情绪慢慢压上来"],
    defaultChoices: ["空镜多一点"]
  },
  {
    id: handdrawnTravelVlogModeId,
    label: "手绘旅行 VLOG",
    preferredAspectRatio: "9:16",
    requiresPhoto: true,
    requiresTravelDestination: true,
    sampleIdea: "我想把自己画成手绘角色，放进一段旅行 VLOG",
    text: "用一张照片生成手绘角色，放进真实旅行地。",
    directorChoices: ["手绘角色感", "真实旅行地", "轻剧情 VLOG", "自然走拍"],
    defaultChoices: ["手绘角色感"]
  }
] as const;

type DiscoveryEntryBase = {
  category: string;
  format: "landscape" | "portrait";
  id: string;
  slot: number;
  title: string;
};

export type DiscoverySampleEntry = DiscoveryEntryBase & {
  duration: string;
  kind: "sample";
};

export type DiscoveryPlaceholderEntry = DiscoveryEntryBase & {
  kind: "placeholder";
  note: string;
};

export type DiscoveryEntry = DiscoverySampleEntry | DiscoveryPlaceholderEntry;

export const discoveryEntries: readonly DiscoveryEntry[] = [
  {
    title: "雨夜未发送",
    category: "私人记忆",
    duration: "00:15",
    format: "landscape",
    id: "sample-03",
    kind: "sample",
    slot: 1
  },
  {
    title: "罗马假日·手绘漫游",
    category: "手绘旅行 VLOG",
    duration: "00:15",
    format: "portrait",
    id: "sample-02",
    kind: "sample",
    slot: 2
  },
  {
    title: "宠物醒来之前",
    category: "宠物小剧场",
    duration: "00:15",
    format: "landscape",
    id: "sample-08",
    kind: "sample",
    slot: 3
  },
  {
    title: "雨面心事",
    category: "私人记忆",
    duration: "00:15",
    format: "landscape",
    id: "sample-05",
    kind: "sample",
    slot: 4
  },
  {
    title: "转角楼梯",
    category: "手绘旅行 VLOG",
    duration: "00:15",
    format: "landscape",
    id: "sample-01",
    kind: "sample",
    slot: 5
  },
  {
    title: "街角慢走",
    category: "手绘旅行 VLOG",
    duration: "00:15",
    format: "landscape",
    id: "sample-07",
    kind: "sample",
    slot: 6
  },
  {
    title: "门口等你",
    category: "宠物小剧场",
    duration: "00:15",
    format: "portrait",
    id: "sample-04",
    kind: "sample",
    slot: 7
  },
  {
    title: "里斯本午后",
    category: "手绘旅行 VLOG",
    duration: "00:15",
    format: "portrait",
    id: "sample-06",
    kind: "sample",
    slot: 8
  },
  {
    title: "私人记忆展位",
    category: "即将补充",
    format: "landscape",
    id: "placeholder-memory",
    kind: "placeholder",
    note: "留给新的横版样片",
    slot: 9
  },
  {
    title: "情绪短片展位",
    category: "即将补充",
    format: "landscape",
    id: "placeholder-emotion",
    kind: "placeholder",
    note: "留给新的竖版/横版组合",
    slot: 10
  }
];

export const discoveryLayoutPresets = [
  [
    "sample-03",
    "sample-02",
    "sample-08",
    "sample-05",
    "sample-01",
    "sample-07",
    "sample-04",
    "sample-06",
    "placeholder-memory",
    "placeholder-emotion"
  ],
  [
    "sample-08",
    "sample-04",
    "sample-03",
    "sample-01",
    "sample-07",
    "sample-05",
    "sample-06",
    "sample-02",
    "placeholder-emotion",
    "placeholder-memory"
  ]
] as const;

export const storyAssets = [
  {
    label: "我的剧本",
    text: "雨夜的便利店外，她反复删改一条告白短信。门铃响起，他从店里出来，两个人隔着玻璃反光短暂重叠。"
  },
  {
    label: "人物",
    text: "她：把伞柄握得很紧。 他：从灯光里走出来，没有看见手机屏幕。"
  },
  {
    label: "地点",
    text: "便利店玻璃、路灯下的雨、没有递出去的伞。"
  }
] as const;

export const coreStoryboardGroups = [
  {
    title: "未发送短信",
    duration: "4-5 秒",
    description: "手机屏幕亮起，指尖停在发送键上。"
  },
  {
    title: "玻璃反光",
    duration: "4-5 秒",
    description: "两个人在玻璃倒影里短暂重叠。"
  },
  {
    title: "擦肩而过",
    duration: "4-5 秒",
    description: "伞柄留在画面边缘，手机慢慢黑掉。"
  }
] as const;

export const expansionCards = ["进入", "动作", "反应", "空镜", "转场", "续写"] as const;

export const workflowStages = [
  "输入创意",
  "故事世界",
  "核心分镜",
  "片段生成"
] as const;
