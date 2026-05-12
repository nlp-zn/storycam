export const handdrawnTravelVlogModeId = "handdrawn-travel-vlog";
export const handdrawnTravelVlogPhotoReferenceNote = "由用户照片转译为手绘旅行角色，保持发型、眼镜、穿搭轮廓和站姿气质，不生成写实真人相似脸。";
export const handdrawnTravelVlogVisualStyle = "手绘旅行 VLOG：手绘角色叠加真实旅行地摄影感背景，角色非写实真人，场景保持真实旅行地摄影感。";

export const storyModeIds = [
  "personal-memory",
  "pet-theater",
  "novel-character",
  "emotion-short",
  handdrawnTravelVlogModeId
] as const;

export type StoryModeId = (typeof storyModeIds)[number];

export function parseStoryModeId(value: unknown): StoryModeId | undefined {
  if (value === undefined) {
    return undefined;
  }

  return storyModeIds.includes(value as StoryModeId) ? (value as StoryModeId) : undefined;
}

export function isHanddrawnTravelVlogMode(value: unknown): value is typeof handdrawnTravelVlogModeId {
  return value === handdrawnTravelVlogModeId;
}
