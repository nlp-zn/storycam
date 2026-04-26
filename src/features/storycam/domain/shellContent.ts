export const directorChoices = ["更遗憾一点", "像私人回忆", "少说话", "加旁白"] as const;

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
