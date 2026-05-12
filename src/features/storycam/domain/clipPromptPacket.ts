import { clipPromptPacketSchema } from "./artifactSchemas";
import type { ClipPromptPacket } from "./artifacts";
import {
  defaultStoryCamVideoAspectRatio,
  storyCamSeedanceOutputResolution,
  type StoryCamVideoAspectRatio,
  type StoryCamVideoOutputResolution
} from "./videoSettings";
import { assertCanGenerateClipFromPacket } from "./stalePropagation";

export type BuildClipPromptPacketPayloadInput = {
  coreGroupId: string;
  coreGroupTitle: string;
  estimatedClipDurationSeconds: number;
  aspectRatio?: StoryCamVideoAspectRatio;
  expandedCardIds?: string[];
  inputArtifactVersions: Record<string, number>;
  packetId: string;
  providerSendConfirmed: true;
  providerPrompt?: string;
  resolution?: StoryCamVideoOutputResolution;
  referenceImageMedia?: Array<{
    artifactId: string;
    frameNumber: number;
    kind: "core" | "expanded";
    mediaId: string;
  }>;
  sessionId: string;
  storyboardFrames?: Array<{
    frameNumber: number;
    summary: string;
    timeRange: string;
    title: string;
  }>;
  storyboardScriptId?: string;
  version: number;
};

export function buildClipPromptPacketPayload(input: BuildClipPromptPacketPayloadInput): ClipPromptPacket {
  const expandedCardCount = input.expandedCardIds?.length ?? 0;

  return clipPromptPacketSchema.parse({
    confirmationSummary: `Use "${input.coreGroupTitle}" to generate one private ${formatDuration(input.estimatedClipDurationSeconds)} clip.`,
    aspectRatio: input.aspectRatio ?? defaultStoryCamVideoAspectRatio,
    coreGroupId: input.coreGroupId,
    expandedCardIds: input.expandedCardIds ?? [],
    id: input.packetId,
    inputArtifactVersions: input.inputArtifactVersions,
    plannedDurationSeconds: input.estimatedClipDurationSeconds,
    providerSendConfirmed: input.providerSendConfirmed,
    ...(input.providerPrompt ? { providerPrompt: input.providerPrompt } : {}),
    referenceImageMedia: input.referenceImageMedia ?? [],
    redactedPromptSummary: `${input.coreGroupTitle}; ${formatDuration(input.estimatedClipDurationSeconds)}; ${expandedCardCount} guide cards.`,
    resolution: input.resolution ?? storyCamSeedanceOutputResolution,
    sessionId: input.sessionId,
    state: "ready",
    storyboardFrames: input.storyboardFrames ?? [],
    ...(input.storyboardScriptId ? { storyboardScriptId: input.storyboardScriptId } : {}),
    version: input.version
  });
}

export function assertClipPromptPacketCanCreateVideoJob(packet: Pick<ClipPromptPacket, "state">) {
  assertCanGenerateClipFromPacket(packet);
}

function formatDuration(durationSeconds: number) {
  return `${Math.round(durationSeconds * 10) / 10}s`;
}
