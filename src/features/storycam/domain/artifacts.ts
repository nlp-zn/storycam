import type { z } from "zod";
import type {
  artifactStateSchema,
  characterAssetSchema,
  clipPromptPacketSchema,
  coreStoryboardGroupSchema,
  directorPacketSchema,
  expandedStoryboardCardSchema,
  finalWorkSchema,
  generatedClipSchema,
  sceneAssetSchema,
  storyboardScriptSchema,
  storyScriptSchema,
  versionedArtifactSchema
} from "./artifactSchemas";

export const artifactStates = ["idle", "generating", "ready", "failed", "skipped", "stale"] as const;

export const artifactTypes = [
  "input",
  "script",
  "character_asset",
  "scene_asset",
  "storyboard_script",
  "core_storyboard_group",
  "expanded_storyboard_card",
  "clip_prompt_packet",
  "generated_clip",
  "stitch_suggestion",
  "final_work",
  "quality_check"
] as const;

export type ArtifactState = z.infer<typeof artifactStateSchema>;
export type VersionedArtifact = z.infer<typeof versionedArtifactSchema>;
export type StoryScript = z.infer<typeof storyScriptSchema>;
export type CharacterAsset = z.infer<typeof characterAssetSchema>;
export type SceneAsset = z.infer<typeof sceneAssetSchema>;
export type StoryboardScript = z.infer<typeof storyboardScriptSchema>;
export type CoreStoryboardGroup = z.infer<typeof coreStoryboardGroupSchema>;
export type ExpandedStoryboardCard = z.infer<typeof expandedStoryboardCardSchema>;
export type ClipPromptPacket = z.infer<typeof clipPromptPacketSchema>;
export type GeneratedClip = z.infer<typeof generatedClipSchema>;
export type FinalWork = z.infer<typeof finalWorkSchema>;
export type DirectorPacket = z.infer<typeof directorPacketSchema>;
