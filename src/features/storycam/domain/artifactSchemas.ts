import { z } from "zod";
import { artifactStates, artifactTypes } from "./artifacts";

const idSchema = z.string().min(1);
const isoDateSchema = z.string().datetime({ offset: true });
const positiveVersionSchema = z.number().int().positive();

export const artifactStateSchema = z.enum(artifactStates);
export const artifactTypeSchema = z.enum(artifactTypes);

export const artifactIdentitySchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  state: artifactStateSchema,
  version: positiveVersionSchema
});

export const versionedArtifactSchema = artifactIdentitySchema.extend({
  type: artifactTypeSchema,
  parentArtifactId: idSchema.optional(),
  dependsOn: z.record(idSchema, positiveVersionSchema).optional(),
  data: z.unknown(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema
});

export const storyScriptSchema = artifactIdentitySchema.extend({
  title: z.string().min(1),
  logline: z.string().min(1),
  summary: z.string().min(1),
  visualStyle: z.string().min(1).optional(),
  beats: z.array(z.string().min(1)).min(1).max(8)
});

export const characterAssetSchema = artifactIdentitySchema.extend({
  name: z.string().min(1),
  role: z.string().min(1),
  relationshipToUserStory: z.string().min(1),
  stableVisualDescription: z.string().min(1),
  emotionalBaseline: z.string().min(1),
  wardrobe: z.string().optional(),
  props: z.array(z.string().min(1)).default([]),
  referenceMediaIds: z.array(idSchema).default([]),
  consistencyNotes: z.array(z.string().min(1)).default([])
});

export const scenePanelShotTypes = ["establishing", "wide", "medium", "detail", "lighting", "overhead", "transition"] as const;

export const scenePanelSchema = z.object({
  title: z.string().min(1),
  shotType: z.enum(scenePanelShotTypes),
  description: z.string().min(1),
  purpose: z.string().min(1),
  keyObjects: z.array(z.string().min(1)).default([])
});

export const sceneAssetSchema = artifactIdentitySchema.extend({
  name: z.string().min(1),
  location: z.string().min(1),
  timeOfDay: z.string().min(1),
  light: z.string().min(1),
  atmosphere: z.string().min(1),
  keyObjects: z.array(z.string().min(1)).default([]),
  referenceMediaIds: z.array(idSchema).default([]),
  spatialLogic: z.string().min(1),
  scenePanels: z.array(scenePanelSchema).default([])
});

const expandedStoryboardBeatTypes = ["enter", "action", "reaction", "atmosphere", "transition", "emotion", "continuation"] as const;
const storyboardFrameBeatTypes = ["core", ...expandedStoryboardBeatTypes] as const;
const storyboardFramePositions = [
  "center",
  "top-left",
  "top",
  "top-right",
  "left",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right"
] as const;

export const storyboardFrameSchema = z.object({
  frameNumber: z.number().int().min(1).max(9),
  canvasPosition: z.enum(storyboardFramePositions),
  timeRange: z.string().min(1),
  durationSeconds: z.number().positive().max(15),
  cameraAngle: z.string().min(1),
  shotSize: z.string().min(1),
  visualContent: z.string().min(1),
  scene: z.string().min(1),
  sound: z.string().min(1),
  technicalNotes: z.string().min(1),
  narrativePurpose: z.string().min(1),
  title: z.string().min(1),
  beatType: z.enum(storyboardFrameBeatTypes),
  imagePrompt: z.string().min(1)
});

export const storyboardScriptSchema = artifactIdentitySchema.extend({
  planSummary: z.string().min(1),
  tone: z.string().min(1),
  rhythm: z.string().min(1),
  plannedDurationSeconds: z.number().int().min(15).max(45),
  mainImagePrompt: z.string().min(1).optional(),
  frames: z.preprocess(
    (value) => (value === undefined ? fallbackStoryboardFrames() : value),
    z.array(storyboardFrameSchema).length(9)
  )
});

export const coreStoryboardGroupSchema = artifactIdentitySchema.extend({
  title: z.string().min(1),
  storyPurpose: z.string().min(1),
  emotionalTurn: z.string().min(1),
  estimatedClipDurationSeconds: z.number().positive(),
  characterAssetIds: z.array(idSchema).min(1).max(3),
  sceneAssetId: idSchema,
  expandedCardIds: z.array(idSchema).default([]),
  representativeImageMediaId: idSchema.optional()
});

export const expandedStoryboardCardSchema = artifactIdentitySchema.extend({
  coreGroupId: idSchema,
  sortOrder: z.number().int().nonnegative(),
  frameNumber: z.number().int().min(2).max(9).optional(),
  canvasPosition: z.enum(storyboardFramePositions).optional(),
  beatType: z.enum(expandedStoryboardBeatTypes),
  title: z.string().min(1),
  description: z.string().min(1),
  guidance: z.string().min(1),
  imagePrompt: z.string().min(1).optional(),
  mediaAssetId: idSchema.optional()
});

export const clipPromptPacketSchema = artifactIdentitySchema.extend({
  coreGroupId: idSchema,
  providerSendConfirmed: z.literal(true),
  confirmationSummary: z.string().min(1),
  inputArtifactVersions: z.record(idSchema, positiveVersionSchema),
  redactedPromptSummary: z.string().min(1),
  expandedCardIds: z.array(idSchema).default([])
});

export const generatedClipSchema = artifactIdentitySchema.extend({
  coreGroupId: idSchema,
  clipPromptPacketId: idSchema,
  mediaAssetId: idSchema,
  durationSeconds: z.number().positive(),
  providerName: z.string().min(1),
  jobId: idSchema,
  reviewState: z.enum(["pending", "accepted", "retry_requested"]).default("pending"),
  thumbnailMediaId: idSchema.optional()
});

export const finalWorkSchema = artifactIdentitySchema.extend({
  generatedClipIds: z.array(idSchema).min(1).max(3),
  mediaAssetId: idSchema,
  durationSeconds: z.number().positive(),
  stitchSuggestionId: idSchema.optional(),
  previewStatus: z.enum(["processing", "ready", "failed"])
});

export const directorPacketSchema = artifactIdentitySchema.extend({
  input: z.string().min(1),
  intent: z.string().min(1),
  directorTone: z.string().min(1),
  script: storyScriptSchema,
  characterAssets: z.array(characterAssetSchema).min(1).max(3),
  sceneAssets: z.array(sceneAssetSchema).length(1),
  storyboardScript: storyboardScriptSchema.optional(),
  coreStoryboardGroups: z.array(coreStoryboardGroupSchema).max(3).default([]),
  expandedStoryboardCards: z.array(expandedStoryboardCardSchema).max(8).default([]),
  clipPromptPackets: z.array(clipPromptPacketSchema).default([]),
  generatedClips: z.array(generatedClipSchema).max(3).default([]),
  finalWork: finalWorkSchema.optional(),
  qualityChecks: z.array(z.string().min(1)).default([])
});

function fallbackStoryboardFrames() {
  const positions = storyboardFramePositions;

  return Array.from({ length: 9 }, (_, index) => ({
    beatType: index === 0 ? "core" : expandedStoryboardBeatTypes[(index - 1) % expandedStoryboardBeatTypes.length],
    cameraAngle: index === 0 ? "平视" : "平视",
    canvasPosition: positions[index],
    durationSeconds: index === 0 ? 3 : 1.5,
    frameNumber: index + 1,
    imagePrompt: `Cinematic storyboard still frame ${index + 1}, ordinary people, consistent character and scene assets, 16:9, no text.`,
    narrativePurpose: index === 0 ? "建立核心分镜的中心视觉锚点。" : "补充分镜组中的连续动作和反应。",
    scene: "已确认的故事场景",
    shotSize: index === 0 ? "中景" : "近景",
    sound: "环境声",
    technicalNotes: "保持角色、服装、道具、场景与光线连续。",
    timeRange: `${String(Math.floor(index * 1.5)).padStart(2, "0")}:00-${String(Math.floor((index + 1) * 1.5)).padStart(2, "0")}:00`,
    title: index === 0 ? "中心主图" : `扩展分镜 ${index}`,
    visualContent: index === 0 ? "已确认的故事场景中，核心人物和关键道具形成中心主图。" : "围绕中心主图补充连续动作、反应或氛围画面。"
  }));
}
