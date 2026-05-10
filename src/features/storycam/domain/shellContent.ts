export const directorChoices = ["更遗憾一点", "像私人回忆", "少说话", "加旁白"] as const;

export const storyModeEntries = [
  {
    id: "personal-memory",
    label: "私人记忆",
    sampleIdea: "我想把暗恋拍成韩剧雨夜",
    text: "把一句真实念头拍成 10-15 秒私人短片。",
    directorChoices,
    defaultChoices: ["像私人回忆"]
  },
  {
    id: "pet-theater",
    label: "宠物小剧场",
    sampleIdea: "我想拍一只小狗等主人回家的十秒小剧场",
    text: "让宠物变成这一幕里的主角。",
    directorChoices: ["等它回头", "日常可爱", "少说话", "加旁白"],
    defaultChoices: ["等它回头"]
  },
  {
    id: "novel-character",
    label: "小说角色",
    sampleIdea: "我想让我的小说女主第一次走进雨夜城市",
    text: "把角色出场拍成短短一段预告。",
    directorChoices: ["初登场感", "世界观更强", "少说话", "加旁白"],
    defaultChoices: ["初登场感"]
  },
  {
    id: "emotion-short",
    label: "情绪短片",
    sampleIdea: "我想把一种说不出口的难过拍成风里的短片",
    text: "把一种情绪变成可看见的画面。",
    directorChoices: ["留白多一点", "像一阵风", "少说话", "加旁白"],
    defaultChoices: ["留白多一点"]
  }
] as const;

export const discoveryEntries = [
  {
    title: "雨夜未发送",
    duration: "00:32",
    imageSrc: "/storycam/discovery/rainy-night-unsent.png",
    size: "large"
  },
  {
    title: "宠物回家之前",
    duration: "00:41",
    imageSrc: "/storycam/discovery/pet-before-home.png",
    size: "large"
  },
  {
    title: "小说角色初登场",
    duration: "00:28",
    imageSrc: "/storycam/discovery/novel-character-arrival.png",
    size: "wide"
  },
  {
    title: "只差一句话",
    duration: "00:25",
    imageSrc: "/storycam/discovery/one-line-away.png",
    size: "small"
  },
  {
    title: "把难过留在风里",
    duration: "00:34",
    imageSrc: "/storycam/discovery/sadness-in-wind.png",
    size: "small"
  },
  {
    title: "旧房间里的光",
    duration: "00:36",
    imageSrc: "/storycam/discovery/old-room-light.png",
    size: "banner"
  }
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
