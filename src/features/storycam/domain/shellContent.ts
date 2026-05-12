export const directorChoices = ["留白多一点", "像旧照片", "雨夜韩剧感", "靠小动作推进"] as const;

export const storyModeEntries = [
  {
    id: "personal-memory",
    label: "私人记忆",
    sampleIdea: "我想把暗恋拍成韩剧雨夜",
    text: "把一句真实念头拍成 10-15 秒私人短片。",
    directorChoices,
    defaultChoices: ["留白多一点"]
  },
  {
    id: "pet-theater",
    label: "宠物小剧场",
    sampleIdea: "我想拍一只小狗等主人回家的十秒小剧场",
    text: "让宠物变成这一幕里的主角。",
    directorChoices: ["低机位跟随", "日常观察感", "温暖回家感", "轻喜剧反应"],
    defaultChoices: ["低机位跟随"]
  },
  {
    id: "novel-character",
    label: "小说角色",
    sampleIdea: "我想让我的小说女主第一次走进雨夜城市",
    text: "把角色出场拍成短短一段预告。",
    directorChoices: ["初登场感", "世界观更强", "预告片节奏", "英雄式剪影"],
    defaultChoices: ["初登场感"]
  },
  {
    id: "emotion-short",
    label: "情绪短片",
    sampleIdea: "我想把一种说不出口的难过拍成风里的短片",
    text: "把一种情绪变成可看见的画面。",
    directorChoices: ["空镜多一点", "像一阵风", "声音先走", "情绪慢慢压上来"],
    defaultChoices: ["空镜多一点"]
  }
] as const;

type DiscoveryEntry = {
  category: string;
  duration: string;
  format: "landscape" | "portrait";
  imageSrc: string;
  title: string;
  videoSrc: string | null;
};

export const discoveryEntries: readonly DiscoveryEntry[] = [
  {
    title: "雨夜未发送",
    category: "私人记忆",
    duration: "00:32",
    format: "landscape",
    imageSrc: "/storycam/discovery/rainy-night-unsent.png",
    videoSrc: "/storycam/discovery/videos/rainy-night-unsent.mp4"
  },
  {
    title: "宠物回家之前",
    category: "宠物小剧场",
    duration: "00:41",
    format: "landscape",
    imageSrc: "/storycam/discovery/pet-before-home.png",
    videoSrc: "/storycam/discovery/videos/pet-before-home.mp4"
  },
  {
    title: "小说角色初登场",
    category: "小说角色",
    duration: "00:28",
    format: "landscape",
    imageSrc: "/storycam/discovery/novel-character-arrival.png",
    videoSrc: "/storycam/discovery/videos/novel-character-arrival.mp4"
  },
  {
    title: "旧房间里的光",
    category: "情绪短片",
    duration: "00:36",
    format: "portrait",
    imageSrc: "/storycam/discovery/old-room-light.png",
    videoSrc: "/storycam/discovery/videos/old-room-light-portrait.mp4"
  },
  {
    title: "竹林里的背影",
    category: "小说角色",
    duration: "00:35",
    format: "portrait",
    imageSrc: "/storycam/discovery/sadness-in-wind.png",
    videoSrc: "/storycam/discovery/videos/bamboo-shadow-portrait.mp4"
  },
  {
    title: "只差一句话",
    category: "私人记忆",
    duration: "00:25",
    format: "landscape",
    imageSrc: "/storycam/discovery/one-line-away.png",
    videoSrc: "/storycam/discovery/videos/one-line-away.mp4"
  },
  {
    title: "把难过留在风里",
    category: "情绪短片",
    duration: "00:34",
    format: "landscape",
    imageSrc: "/storycam/discovery/sadness-in-wind.png",
    videoSrc: "/storycam/discovery/videos/sadness-in-wind.mp4"
  },
  {
    title: "玩具城市漫游",
    category: "幻想日常",
    duration: "00:30",
    format: "landscape",
    imageSrc: "/storycam/discovery/pet-before-home.png",
    videoSrc: "/storycam/discovery/videos/toy-city.mp4"
  },
  {
    title: "清晨的秘密基地",
    category: "私人记忆",
    duration: "00:29",
    format: "landscape",
    imageSrc: "/storycam/discovery/old-room-light.png",
    videoSrc: "/storycam/discovery/videos/morning-hideout.mp4"
  },
  {
    title: "她在镜前停顿",
    category: "情绪短片",
    duration: "00:27",
    format: "portrait",
    imageSrc: "/storycam/discovery/one-line-away.png",
    videoSrc: "/storycam/discovery/videos/mirror-pause-portrait.mp4"
  }
];

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
