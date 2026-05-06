import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, StoryCamArtifactRow } from "@/server/db/types";
import {
  assertClipPromptPacketArtifactCanCreateVideoJob,
  ClipPromptPacketRequestError,
  createClipPromptPacket
} from "./clipPromptPacketService";

describe("clip-packet service", () => {
  it("creates a redacted clip prompt packet artifact with input artifact versions", async () => {
    const client = new FakeSupabaseClient({ artifactRows: [coreGroupRow(), expandedCardRow()] });

    const result = await createClipPromptPacket(client.asSupabaseClient(), "user-1", {
      confirmedArtifactVersions: {
        "core-artifact-1": 1,
        "expanded-artifact-1": 1
      },
      coreStoryboardGroupId: "core-artifact-1",
      providerSendConfirmed: true,
      sessionId: "session-1"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        clipPromptPacket: {
          parentArtifactId: "core-artifact-1",
          state: "ready",
          type: "clip_prompt_packet",
          version: 1
        },
        confirmationSummary: expect.stringContaining("Unsent Message"),
        sessionId: "session-1"
      }
    });

    const packetInsert = client.queries
      .filter((query) => query.table === "storycam_artifacts")
      .flatMap((query) => query.calls)
      .find((call) => call[0] === "insert")?.[1] as Record<string, unknown>;

    expect(packetInsert).toMatchObject({
      depends_on_json: {
        "core-artifact-1": 1,
        "expanded-artifact-1": 1
      },
      type: "clip_prompt_packet"
    });
    expect(result.value.clipPromptPacketPayload).toMatchObject({
      inputArtifactVersions: {
        "core-artifact-1": 1,
        "expanded-artifact-1": 1
      },
      plannedDurationSeconds: 4.7
    });
  });

  it("rejects stale or unconfirmed core groups", async () => {
    const client = new FakeSupabaseClient({ artifactRows: [coreGroupRow({ version: 2 })] });

    await expect(
      createClipPromptPacket(client.asSupabaseClient(), "user-1", {
        confirmedArtifactVersions: {
          "core-artifact-1": 1
        },
        coreStoryboardGroupId: "core-artifact-1",
        providerSendConfirmed: true,
        sessionId: "session-1"
      })
    ).rejects.toMatchObject({ code: "core_group_not_confirmed" });
  });

  it("blocks stale clip prompt packets from creating video jobs", () => {
    expect(() =>
      assertClipPromptPacketArtifactCanCreateVideoJob({
        ...clipPacketRow(),
        state: "stale"
      })
    ).toThrow(ClipPromptPacketRequestError);
    expect(() => assertClipPromptPacketArtifactCanCreateVideoJob(clipPacketRow())).not.toThrow();
  });
});

function coreGroupRow(overrides: Partial<StoryCamArtifactRow> = {}): StoryCamArtifactRow {
  return {
    ...baseArtifactRow(),
    data_json: {
      characterAssetIds: ["character-artifact-1"],
      emotionalTurn: "Almost says the truth.",
      estimatedClipDurationSeconds: 4.7,
      expandedCardIds: [],
      id: "core-group-rainy-kdrama-1",
      sceneAssetId: "scene-artifact-1",
      sessionId: "session-1",
      state: "ready",
      storyPurpose: "Hold the private feeling before the confession disappears.",
      title: "Unsent Message",
      version: 1
    },
    id: "core-artifact-1",
    type: "core_storyboard_group",
    ...overrides
  };
}

function expandedCardRow(): StoryCamArtifactRow {
  return {
    ...baseArtifactRow(),
    data_json: {
      beatType: "reaction",
      coreGroupId: "core-group-rainy-kdrama-1",
      description: "A small reaction beat.",
      guidance: "Keep it quiet.",
      id: "expanded-card-1",
      sessionId: "session-1",
      sortOrder: 0,
      state: "ready",
      title: "Small Look",
      version: 1
    },
    id: "expanded-artifact-1",
    parent_artifact_id: "core-artifact-1",
    type: "expanded_storyboard_card"
  };
}

function clipPacketRow(): StoryCamArtifactRow {
  return {
    ...baseArtifactRow(),
    data_json: {
      confirmationSummary: "Use this group to generate one private clip.",
      coreGroupId: "core-artifact-1",
      expandedCardIds: ["expanded-card-1"],
      id: "packet-1",
      inputArtifactVersions: {
        "core-artifact-1": 1
      },
      providerSendConfirmed: true,
      redactedPromptSummary: "Unsent Message; 4.7s; 1 guide cards.",
      sessionId: "session-1",
      state: "ready",
      version: 1
    },
    id: "packet-artifact-1",
    parent_artifact_id: "core-artifact-1",
    type: "clip_prompt_packet"
  };
}

function baseArtifactRow(): StoryCamArtifactRow {
  return {
    created_at: "2026-04-26T00:00:00.000Z",
    data_json: {},
    deleted_at: null,
    depends_on_json: {},
    id: "artifact-1",
    parent_artifact_id: null,
    session_id: "session-1",
    stale_at: null,
    state: "ready",
    type: "core_storyboard_group",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    version: 1
  };
}

type FakeSupabaseClientOptions = {
  artifactRows?: unknown[];
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  private artifactInsertCount = 0;

  constructor(private readonly options: FakeSupabaseClientOptions = {}) {}

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  nextArtifactId(type: unknown) {
    this.artifactInsertCount += 1;
    return `${type}-artifact-${this.artifactInsertCount}`;
  }

  from(table: string) {
    const query = new FakeQuery(table, this.options, this);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];
  private inserted: Record<string, unknown> | null = null;

  constructor(
    readonly table: string,
    private readonly options: FakeSupabaseClientOptions,
    private readonly client: FakeSupabaseClient
  ) {}

  insert(value: Record<string, unknown>) {
    this.inserted = value;
    this.calls.push(["insert", value]);
    return this;
  }

  select(columns: string) {
    this.calls.push(["select", columns]);
    return this;
  }

  eq(column: string, value: unknown) {
    this.calls.push(["eq", column, value]);
    return this;
  }

  is(column: string, value: unknown) {
    this.calls.push(["is", column, value]);
    return this;
  }

  order(column: string, options: Record<string, unknown>) {
    this.calls.push(["order", column, options]);
    return this;
  }

  limit(value: number) {
    this.calls.push(["limit", value]);
    return this;
  }

  single() {
    return Promise.resolve({
      data: this.row(),
      error: null
    });
  }

  maybeSingle() {
    return Promise.resolve({
      data:
        this.table === "storycam_sessions"
          ? {
              core_group_target_count: 1,
              created_at: "2026-04-26T00:00:00.000Z",
              deleted_at: null,
              generation_mode: "mock",
              id: "session-1",
              planned_duration_seconds: 12,
              status: "ready",
              updated_at: "2026-04-26T00:00:00.000Z",
              user_id: "user-1"
            }
          : null,
      error: null
    });
  }

  then(resolve: (value: { data: unknown; error: null }) => void, reject?: (reason: unknown) => void) {
    return Promise.resolve({
      data: this.table === "storycam_artifacts" ? (this.options.artifactRows ?? []) : [],
      error: null
    }).then(resolve, reject);
  }

  private row() {
    if (this.table === "storycam_artifacts") {
      return {
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        id: this.client.nextArtifactId(this.inserted?.type),
        stale_at: null,
        updated_at: "2026-04-26T00:00:00.000Z",
        ...this.inserted
      };
    }

    return this.inserted;
  }
}
