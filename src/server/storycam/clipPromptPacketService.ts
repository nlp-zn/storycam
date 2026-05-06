import type { SupabaseClient } from "@supabase/supabase-js";
import { coreStoryboardGroupSchema, expandedStoryboardCardSchema, storyboardScriptSchema } from "@/features/storycam/domain/artifactSchemas";
import { assertClipPromptPacketCanCreateVideoJob, buildClipPromptPacketPayload } from "@/features/storycam/domain/clipPromptPacket";
import type { ClipPromptPacket, StoryboardScript } from "@/features/storycam/domain/artifacts";
import type { Database, Json, MediaAssetRow, StoryCamArtifactRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { StoryCamSessionRepository } from "./sessionRepository";

export type CreateClipPromptPacketInput = {
  confirmedArtifactVersions: Record<string, number>;
  coreStoryboardGroupId: string;
  providerSendConfirmed: true;
  sessionId: string;
};

export type ClipPromptPacketArtifactRef = {
  id: string;
  parentArtifactId: string | null;
  state: StoryCamArtifactRow["state"];
  type: StoryCamArtifactRow["type"];
  version: number;
};

export type ClipPromptPacketServiceOutput = {
  clipPromptPacket: ClipPromptPacketArtifactRef;
  clipPromptPacketPayload: ClipPromptPacket;
  confirmationSummary: string;
  sessionId: string;
};

export class ClipPromptPacketRequestError extends Error {
  constructor(readonly code: "core_group_not_confirmed" | "invalid_input" | "session_not_found" | "stale_packet") {
    super(`StoryCam clip prompt packet request error: ${code}`);
    this.name = "ClipPromptPacketRequestError";
  }
}

export async function createClipPromptPacket(
  client: SupabaseClient<Database>,
  userId: string,
  input: CreateClipPromptPacketInput
): Promise<{ ok: true; value: ClipPromptPacketServiceOutput }> {
  validateCreateClipPromptPacketInput(input);

  const sessions = new StoryCamSessionRepository(client);
  const artifacts = new StoryCamArtifactRepository(client);
  const session = await sessions.findById(userId, input.sessionId);

  if (!session) {
    throw new ClipPromptPacketRequestError("session_not_found");
  }

  const rows = (await artifacts.listBySession(userId, { sessionId: session.id })) ?? [];
  const coreGroupArtifact = findConfirmedArtifact(rows, input.coreStoryboardGroupId, input.confirmedArtifactVersions, "core_storyboard_group");

  if (!coreGroupArtifact) {
    throw new ClipPromptPacketRequestError("core_group_not_confirmed");
  }

  const coreGroup = coreStoryboardGroupSchema.parse(coreGroupArtifact.data_json);
  const storyboardScriptArtifact = findStoryboardScriptArtifact(rows, coreGroupArtifact.id);
  const storyboardScript = storyboardScriptArtifact ? storyboardScriptSchema.parse(storyboardScriptArtifact.data_json) : undefined;
  const expandedCardArtifacts = rows.filter(
    (row) =>
      row.type === "expanded_storyboard_card" &&
      row.parent_artifact_id === coreGroupArtifact.id &&
      row.state === "ready" &&
      input.confirmedArtifactVersions[row.id] === row.version
  );
  const expandedCardIds = expandedCardArtifacts.map((row) => expandedStoryboardCardSchema.parse(row.data_json).id);
  const storyboardMedia = await loadStoryboardFrameMedia(client, userId, session.id, coreGroupArtifact, expandedCardArtifacts);
  const inputArtifactVersions = {
    [coreGroupArtifact.id]: coreGroupArtifact.version,
    ...(storyboardScriptArtifact ? { [storyboardScriptArtifact.id]: storyboardScriptArtifact.version } : {}),
    ...Object.fromEntries(expandedCardArtifacts.map((row) => [row.id, row.version]))
  };
  const packet = buildClipPromptPacketPayload({
    coreGroupId: coreGroupArtifact.id,
    coreGroupTitle: coreGroup.title,
    estimatedClipDurationSeconds: coreGroup.estimatedClipDurationSeconds,
    expandedCardIds,
    inputArtifactVersions,
    packetId: `${coreGroupArtifact.id}-clip-packet-v1`,
    providerSendConfirmed: input.providerSendConfirmed,
    providerPrompt: buildVideoProviderPrompt({
      coreGroupTitle: coreGroup.title,
      durationSeconds: coreGroup.estimatedClipDurationSeconds,
      storyboardScript
    }),
    referenceImageMedia: storyboardMedia.map((item) => ({
      artifactId: item.artifactId,
      frameNumber: item.frameNumber,
      kind: item.kind,
      mediaId: item.media.id
    })),
    sessionId: session.id,
    storyboardFrames: storyboardScript?.frames.map((frame) => ({
      frameNumber: frame.frameNumber,
      summary: `${frame.visualContent} ${frame.narrativePurpose}`,
      timeRange: frame.timeRange,
      title: frame.title
    })),
    storyboardScriptId: storyboardScriptArtifact?.id,
    version: 1
  });
  const packetArtifact = requireArtifactRow(
    await artifacts.createVersion(userId, {
      dataJson: packet,
      dependsOnJson: inputArtifactVersions satisfies Json,
      parentArtifactId: coreGroupArtifact.id,
      sessionId: session.id,
      state: "ready",
      type: "clip_prompt_packet",
      version: packet.version
    })
  );

  return {
    ok: true,
    value: {
      clipPromptPacket: toArtifactRef(packetArtifact),
      clipPromptPacketPayload: packet,
      confirmationSummary: packet.confirmationSummary,
      sessionId: session.id
    }
  };
}

function findStoryboardScriptArtifact(rows: StoryCamArtifactRow[], coreGroupArtifactId: string) {
  return rows.find(
    (row) =>
      row.type === "storyboard_script" &&
      row.parent_artifact_id === coreGroupArtifactId &&
      row.state === "ready" &&
      storyboardScriptSchema.safeParse(row.data_json).success
  );
}

async function loadStoryboardFrameMedia(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  coreGroupArtifact: StoryCamArtifactRow,
  expandedCardArtifacts: StoryCamArtifactRow[]
) {
  const mediaAssets = new StoryCamMediaAssetRepository(client);
  const coreMedia = await mediaAssets.findLatestThumbnailByLinkedArtifact(userId, {
    linkedArtifactId: coreGroupArtifact.id,
    sessionId
  });
  const expandedMedia = await Promise.all(
    expandedCardArtifacts.map(async (row) => {
      const media = await mediaAssets.findLatestThumbnailByLinkedArtifact(userId, {
        linkedArtifactId: row.id,
        sessionId
      });
      const card = expandedStoryboardCardSchema.parse(row.data_json);

      return media
        ? {
            artifactId: row.id,
            frameNumber: card.frameNumber ?? card.sortOrder + 2,
            kind: "expanded" as const,
            media
          }
        : null;
    })
  );

  return [
    ...(coreMedia
      ? [
          {
            artifactId: coreGroupArtifact.id,
            frameNumber: 1,
            kind: "core" as const,
            media: coreMedia
          }
        ]
      : []),
    ...expandedMedia.filter((item): item is { artifactId: string; frameNumber: number; kind: "expanded"; media: MediaAssetRow } => Boolean(item))
  ];
}

function buildVideoProviderPrompt(input: {
  coreGroupTitle: string;
  durationSeconds: number;
  storyboardScript?: StoryboardScript;
}) {
  const frames = input.storyboardScript?.frames
    .map(
      (frame) =>
        `${String(frame.frameNumber).padStart(2, "0")} ${frame.timeRange} ${frame.title}: ${frame.visualContent} Purpose: ${frame.narrativePurpose}`
    )
    .join("\n");

  return [
    `Create one private StoryCam short film clip titled "${input.coreGroupTitle}".`,
    `Target duration: ${Math.min(15, Math.round(input.durationSeconds))} seconds, 16:9, cinematic, no subtitles, no readable UI text.`,
    "Use the attached storyboard/reference images as visual continuity anchors. Preserve character appearance, wardrobe, props, location, lighting, and mood.",
    frames ? `Nine-frame storyboard script:\n${frames}` : "",
    "Motion should connect the frames as one continuous private-memory scene with restrained performances and natural camera movement."
  ]
    .filter(Boolean)
    .join("\n");
}

export function assertClipPromptPacketArtifactCanCreateVideoJob(row: StoryCamArtifactRow) {
  if (row.type !== "clip_prompt_packet" || row.state !== "ready") {
    throw new ClipPromptPacketRequestError("stale_packet");
  }

  try {
    assertClipPromptPacketCanCreateVideoJob(row.data_json as unknown as ClipPromptPacket);
  } catch {
    throw new ClipPromptPacketRequestError("stale_packet");
  }
}

function validateCreateClipPromptPacketInput(input: CreateClipPromptPacketInput) {
  if (!input.sessionId || !input.coreStoryboardGroupId || input.providerSendConfirmed !== true) {
    throw new ClipPromptPacketRequestError("invalid_input");
  }

  if (!isVersionMap(input.confirmedArtifactVersions)) {
    throw new ClipPromptPacketRequestError("invalid_input");
  }
}

function findConfirmedArtifact(
  rows: StoryCamArtifactRow[],
  artifactId: string,
  confirmedArtifactVersions: Record<string, number>,
  type: StoryCamArtifactRow["type"]
) {
  return rows.find(
    (row) => row.id === artifactId && row.type === type && row.state === "ready" && confirmedArtifactVersions[row.id] === row.version
  );
}

function isVersionMap(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(([artifactId, version]) => artifactId && typeof version === "number" && Number.isInteger(version) && version > 0)
  );
}

function requireArtifactRow(row: StoryCamArtifactRow | null) {
  if (!row) {
    throw new Error("StoryCam clip prompt packet artifact write failed.");
  }

  return row;
}

function toArtifactRef(row: StoryCamArtifactRow): ClipPromptPacketArtifactRef {
  return {
    id: row.id,
    parentArtifactId: row.parent_artifact_id,
    state: row.state,
    type: row.type,
    version: row.version
  };
}
