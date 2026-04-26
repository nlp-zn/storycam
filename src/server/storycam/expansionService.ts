import type { SupabaseClient } from "@supabase/supabase-js";
import { coreStoryboardGroupSchema, expandedStoryboardCardSchema } from "@/features/storycam/domain/artifactSchemas";
import { rainyKDramaExpansionCards } from "@/lib/providers/mock/fixtures/storyboards";
import type { Database, Json, StoryCamArtifactRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { StoryCamSessionRepository } from "./sessionRepository";

export const defaultExpansionCardTargetCount = 3;
export const maxExpansionCardTargetCount = 8;

export type ExpansionRequestBody = {
  action?: unknown;
  coreStoryboardGroupId?: unknown;
  sessionId?: unknown;
  targetCount?: unknown;
};

export type ExpansionArtifactRef = {
  id: string;
  parentArtifactId: string | null;
  state: StoryCamArtifactRow["state"];
  type: StoryCamArtifactRow["type"];
  version: number;
};

export type ExpansionServiceOutput = {
  expandedStoryboardCards: ExpansionArtifactRef[];
  sessionId: string;
};

export class ExpansionRequestError extends Error {
  constructor(readonly code: "core_group_not_found" | "invalid_input" | "session_not_found") {
    super(`StoryCam expansion request error: ${code}`);
    this.name = "ExpansionRequestError";
  }
}

export async function createExpandedStoryboardCards(
  client: SupabaseClient<Database>,
  userId: string,
  coreStoryboardGroupId: string,
  body: ExpansionRequestBody
): Promise<{ ok: true; value: ExpansionServiceOutput }> {
  const input = parseExpansionRequest(coreStoryboardGroupId, body);
  const sessions = new StoryCamSessionRepository(client);
  const artifacts = new StoryCamArtifactRepository(client);
  const session = await sessions.findById(userId, input.sessionId);

  if (!session) {
    throw new ExpansionRequestError("session_not_found");
  }

  const coreGroupArtifact = await loadCoreGroupArtifact(artifacts, userId, session.id, input.coreStoryboardGroupId);
  const coreGroup = coreStoryboardGroupSchema.parse(coreGroupArtifact.data_json);
  const dependsOnJson: Json = {
    [coreGroupArtifact.id]: coreGroupArtifact.version
  };
  const cards = Array.from({ length: input.targetCount }, (_, index) => {
    const fixture = rainyKDramaExpansionCards[index % rainyKDramaExpansionCards.length];

    return expandedStoryboardCardSchema.parse({
      beatType: fixture.beatType,
      coreGroupId: coreGroup.id,
      description: fixture.description,
      guidance: fixture.guidance,
      id: `${coreGroup.id}-expanded-card-${index + 1}`,
      sessionId: session.id,
      sortOrder: index,
      state: "ready",
      title: fixture.title,
      version: 1
    });
  });
  const expandedStoryboardCards = await Promise.all(
    cards.map((card) =>
      artifacts.createVersion(userId, {
        dataJson: card,
        dependsOnJson,
        parentArtifactId: coreGroupArtifact.id,
        sessionId: session.id,
        state: "ready",
        type: "expanded_storyboard_card",
        version: card.version
      })
    )
  );

  return {
    ok: true,
    value: {
      expandedStoryboardCards: expandedStoryboardCards.map((artifact) => toArtifactRef(requireArtifactRow(artifact))),
      sessionId: session.id
    }
  };
}

export function parseExpansionRequest(coreStoryboardGroupId: string, body: ExpansionRequestBody) {
  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : "";

  if (!sessionId || !coreStoryboardGroupId) {
    throw new ExpansionRequestError("invalid_input");
  }

  if (body.coreStoryboardGroupId !== undefined && body.coreStoryboardGroupId !== coreStoryboardGroupId) {
    throw new ExpansionRequestError("invalid_input");
  }

  return {
    action: parseExpansionAction(body.action),
    coreStoryboardGroupId,
    sessionId,
    targetCount: parseTargetCount(body.targetCount)
  };
}

async function loadCoreGroupArtifact(
  artifacts: StoryCamArtifactRepository,
  userId: string,
  sessionId: string,
  coreStoryboardGroupId: string
) {
  const rows = (await artifacts.listBySession(userId, { sessionId, type: "core_storyboard_group" })) ?? [];
  const coreGroup = rows.find((row) => row.id === coreStoryboardGroupId && row.state === "ready");

  if (!coreGroup) {
    throw new ExpansionRequestError("core_group_not_found");
  }

  return coreGroup;
}

function parseExpansionAction(value: unknown) {
  if (value === undefined) {
    return "default";
  }

  if (value === "default" || value === "more" || value === "new_angle" || value === "stronger_emotion") {
    return value;
  }

  throw new ExpansionRequestError("invalid_input");
}

function parseTargetCount(value: unknown) {
  if (value === undefined) {
    return defaultExpansionCardTargetCount;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ExpansionRequestError("invalid_input");
  }

  return Math.min(value, maxExpansionCardTargetCount);
}

function requireArtifactRow(row: StoryCamArtifactRow | null) {
  if (!row) {
    throw new Error("StoryCam expansion artifact write failed.");
  }

  return row;
}

function toArtifactRef(row: StoryCamArtifactRow): ExpansionArtifactRef {
  return {
    id: row.id,
    parentArtifactId: row.parent_artifact_id,
    state: row.state,
    type: row.type,
    version: row.version
  };
}
