import type { SupabaseClient } from "@supabase/supabase-js";
import { coreStoryboardGroupSchema, expandedStoryboardCardSchema } from "@/features/storycam/domain/artifactSchemas";
import { assertClipPromptPacketCanCreateVideoJob, buildClipPromptPacketPayload } from "@/features/storycam/domain/clipPromptPacket";
import type { ClipPromptPacket } from "@/features/storycam/domain/artifacts";
import type { Database, Json, StoryCamArtifactRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
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
  const expandedCardArtifacts = rows.filter(
    (row) =>
      row.type === "expanded_storyboard_card" &&
      row.parent_artifact_id === coreGroupArtifact.id &&
      row.state === "ready" &&
      input.confirmedArtifactVersions[row.id] === row.version
  );
  const expandedCardIds = expandedCardArtifacts.map((row) => expandedStoryboardCardSchema.parse(row.data_json).id);
  const inputArtifactVersions = {
    [coreGroupArtifact.id]: coreGroupArtifact.version,
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
    sessionId: session.id,
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
      confirmationSummary: packet.confirmationSummary,
      sessionId: session.id
    }
  };
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
