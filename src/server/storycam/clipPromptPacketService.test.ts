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
    const client = new FakeSupabaseClient({
      artifactRows: [coreGroupRow(), ...expandedCardRows()],
      mediaRows: [mediaRow("media-core-1", "core-artifact-1"), ...expandedMediaRows()]
    });

    const result = await createClipPromptPacket(client.asSupabaseClient(), "user-1", {
      confirmedArtifactVersions: {
        "core-artifact-1": 1,
        ...Object.fromEntries(expandedCardRows().map((row) => [row.id, row.version]))
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
        "expanded-artifact-1": 1,
        "expanded-artifact-8": 1
      },
      type: "clip_prompt_packet"
    });
    expect(result.value.clipPromptPacketPayload).toMatchObject({
      inputArtifactVersions: {
        "core-artifact-1": 1,
        "expanded-artifact-1": 1,
        "expanded-artifact-8": 1
      },
      plannedDurationSeconds: 4.7
    });
    expect(result.value.clipPromptPacketPayload.referenceImageMedia).toHaveLength(9);
    expect(result.value.clipPromptPacketPayload.providerPrompt).toContain("Native audio plan");
    expect(result.value.clipPromptPacketPayload.providerPrompt).toContain("雨声");
    expect(result.value.clipPromptPacketPayload.providerPrompt).toContain("门铃");
    expect(result.value.clipPromptPacketPayload.providerPrompt).toContain("脚步");
    expect(result.value.clipPromptPacketPayload.providerPrompt).toContain("环境音乐");
    expect(result.value.clipPromptPacketPayload.providerPrompt).toContain("对白");
  });

  it("stores session video aspect ratio in the clip packet and provider prompt", async () => {
    const client = new FakeSupabaseClient({
      artifactRows: [coreGroupRow(), ...expandedCardRows()],
      mediaRows: [mediaRow("media-core-1", "core-artifact-1"), ...expandedMediaRows()],
      sessionRow: storyCamSessionRow({ video_aspect_ratio: "9:16" })
    });

    const result = await createClipPromptPacket(client.asSupabaseClient(), "user-1", {
      confirmedArtifactVersions: {
        "core-artifact-1": 1,
        ...Object.fromEntries(expandedCardRows().map((row) => [row.id, row.version]))
      },
      coreStoryboardGroupId: "core-artifact-1",
      providerSendConfirmed: true,
      sessionId: "session-1"
    });

    expect(result.value.clipPromptPacketPayload).toMatchObject({
      aspectRatio: "9:16",
      resolution: "720p"
    });
    expect(result.value.clipPromptPacketPayload.providerPrompt).toContain("9:16 vertical portrait");
  });

  it("keeps handdrawn travel VLOG video prompts on real backgrounds with drawn characters", async () => {
    const client = new FakeSupabaseClient({
      artifactRows: [scriptRow({ storyModeId: "handdrawn-travel-vlog" }), coreGroupRow(), ...expandedCardRows()],
      mediaRows: [mediaRow("media-core-1", "core-artifact-1"), ...expandedMediaRows()],
      sessionRow: storyCamSessionRow({ video_aspect_ratio: "9:16" })
    });

    const result = await createClipPromptPacket(client.asSupabaseClient(), "user-1", {
      confirmedArtifactVersions: {
        "core-artifact-1": 1,
        ...Object.fromEntries(expandedCardRows().map((row) => [row.id, row.version]))
      },
      coreStoryboardGroupId: "core-artifact-1",
      providerSendConfirmed: true,
      sessionId: "session-1"
    });

    expect(result.value.clipPromptPacketPayload.providerPrompt).toContain("real travel-location backgrounds");
    expect(result.value.clipPromptPacketPayload.providerPrompt).toContain("hand-drawn illustrated traveler character");
    expect(result.value.clipPromptPacketPayload.providerPrompt).toContain("do not turn the character into a photorealistic person");
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

function expandedCardRows() {
  return Array.from({ length: 8 }, (_, index) => expandedCardRow(index + 1));
}

function expandedCardRow(index: number): StoryCamArtifactRow {
  const frameNumber = index + 1;

  return {
    ...baseArtifactRow(),
    data_json: {
      beatType: "reaction",
      coreGroupId: "core-group-rainy-kdrama-1",
      description: index === 1 ? "A small reaction beat." : `Frame ${frameNumber} continuation beat.`,
      frameNumber,
      guidance: "Keep it quiet.",
      id: `expanded-card-${index}`,
      sessionId: "session-1",
      sortOrder: index - 1,
      state: "ready",
      title: index === 1 ? "Small Look" : `Frame ${frameNumber}`,
      version: 1
    },
    id: `expanded-artifact-${index}`,
    parent_artifact_id: "core-artifact-1",
    type: "expanded_storyboard_card"
  };
}

function expandedMediaRows() {
  return expandedCardRows().map((row, index) => mediaRow(`media-expanded-${index + 1}`, row.id));
}

function scriptRow(overrides: Record<string, unknown> = {}): StoryCamArtifactRow {
  return {
    ...baseArtifactRow(),
    data_json: {
      beats: ["角色走进真实旅行地", "在街角停下拍照"],
      id: "script-travel-1",
      logline: "一个手绘旅行者在真实目的地里走出轻剧情 VLOG。",
      qualityChecks: [],
      sessionId: "session-1",
      state: "ready",
      summary: "真实旅行地和手绘角色一起组成一段轻剧情 VLOG。",
      title: "手绘旅行 VLOG",
      version: 1,
      visualStyle: "手绘角色叠加真实旅行地摄影感背景",
      ...overrides
    },
    id: "script-artifact-1",
    type: "script"
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
  mediaRows?: unknown[];
  sessionRow?: unknown;
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
  private eqFilters: Record<string, unknown> = {};
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
    this.eqFilters[column] = value;
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
          ? this.options.sessionRow ?? storyCamSessionRow()
          : this.table === "media_assets"
            ? this.findMediaRows()[0] ?? null
          : null,
      error: null
    });
  }

  then(resolve: (value: { data: unknown; error: null }) => void, reject?: (reason: unknown) => void) {
    return Promise.resolve({
      data: this.table === "storycam_artifacts" ? (this.options.artifactRows ?? []) : this.table === "media_assets" ? this.findMediaRows() : [],
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

  private findMediaRows() {
    return (this.options.mediaRows ?? []).filter(
      (row) =>
        (!this.eqFilters.user_id || (row as { user_id?: unknown }).user_id === this.eqFilters.user_id) &&
        (!this.eqFilters.session_id || (row as { session_id?: unknown }).session_id === this.eqFilters.session_id) &&
        (!this.eqFilters.linked_artifact_id ||
          (row as { linked_artifact_id?: unknown }).linked_artifact_id === this.eqFilters.linked_artifact_id) &&
        (!this.eqFilters.kind || (row as { kind?: unknown }).kind === this.eqFilters.kind)
    );
  }
}

function storyCamSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    core_group_target_count: 1,
    created_at: "2026-04-26T00:00:00.000Z",
    deleted_at: null,
    generation_mode: "mock",
    id: "session-1",
    planned_duration_seconds: 12,
    status: "ready",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    video_aspect_ratio: "16:9",
    ...overrides
  };
}

function mediaRow(id: string, linkedArtifactId: string) {
  return {
    byte_size: 128,
    created_at: "2026-04-26T00:00:00.000Z",
    deleted_at: null,
    id,
    kind: "thumbnail",
    linked_artifact_id: linkedArtifactId,
    mime_type: "image/png",
    session_id: "session-1",
    source: "provider",
    storage_bucket: "storycam-generated",
    storage_path: `users/user-1/sessions/session-1/generated/${id}.png`,
    user_id: "user-1"
  };
}
