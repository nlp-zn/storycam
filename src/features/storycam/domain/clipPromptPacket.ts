import { clipPromptPacketSchema } from "./artifactSchemas";
import type { ClipPromptPacket } from "./artifacts";
import { assertCanGenerateClipFromPacket } from "./stalePropagation";

export type BuildClipPromptPacketPayloadInput = {
  coreGroupId: string;
  coreGroupTitle: string;
  estimatedClipDurationSeconds: number;
  expandedCardIds?: string[];
  inputArtifactVersions: Record<string, number>;
  packetId: string;
  providerSendConfirmed: true;
  sessionId: string;
  version: number;
};

export function buildClipPromptPacketPayload(input: BuildClipPromptPacketPayloadInput): ClipPromptPacket {
  const expandedCardCount = input.expandedCardIds?.length ?? 0;

  return clipPromptPacketSchema.parse({
    confirmationSummary: `Use "${input.coreGroupTitle}" to generate one private ${formatDuration(input.estimatedClipDurationSeconds)} clip.`,
    coreGroupId: input.coreGroupId,
    expandedCardIds: input.expandedCardIds ?? [],
    id: input.packetId,
    inputArtifactVersions: input.inputArtifactVersions,
    providerSendConfirmed: input.providerSendConfirmed,
    redactedPromptSummary: `${input.coreGroupTitle}; ${formatDuration(input.estimatedClipDurationSeconds)}; ${expandedCardCount} guide cards.`,
    sessionId: input.sessionId,
    state: "ready",
    version: input.version
  });
}

export function assertClipPromptPacketCanCreateVideoJob(packet: Pick<ClipPromptPacket, "state">) {
  assertCanGenerateClipFromPacket(packet);
}

function formatDuration(durationSeconds: number) {
  return `${Math.round(durationSeconds * 10) / 10}s`;
}
