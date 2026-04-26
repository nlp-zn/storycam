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

export const sceneAssetSchema = artifactIdentitySchema.extend({
  name: z.string().min(1),
  location: z.string().min(1),
  timeOfDay: z.string().min(1),
  light: z.string().min(1),
  atmosphere: z.string().min(1),
  keyObjects: z.array(z.string().min(1)).default([]),
  referenceMediaIds: z.array(idSchema).default([]),
  spatialLogic: z.string().min(1)
});

export const storyboardScriptSchema = artifactIdentitySchema.extend({
  planSummary: z.string().min(1),
  tone: z.string().min(1),
  rhythm: z.string().min(1),
  plannedDurationSeconds: z.number().int().min(8).max(15)
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
  beatType: z.enum(["enter", "action", "reaction", "atmosphere", "transition", "emotion", "continuation"]),
  title: z.string().min(1),
  description: z.string().min(1),
  guidance: z.string().min(1)
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
  sceneAssets: z.array(sceneAssetSchema).min(1).max(3),
  storyboardScript: storyboardScriptSchema.optional(),
  coreStoryboardGroups: z.array(coreStoryboardGroupSchema).max(3).default([]),
  expandedStoryboardCards: z.array(expandedStoryboardCardSchema).max(8).default([]),
  clipPromptPackets: z.array(clipPromptPacketSchema).default([]),
  generatedClips: z.array(generatedClipSchema).max(3).default([]),
  finalWork: finalWorkSchema.optional(),
  qualityChecks: z.array(z.string().min(1)).default([])
});
