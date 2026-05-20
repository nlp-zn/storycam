import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FfmpegComposerInput, FfmpegComposerOutput } from "@/lib/providers/finalWork/ffmpegComposer";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type { FinalWorkComposer } from "@/lib/providers/types";
import type { Database, GenerationJobRow, MediaAssetRow, StoryCamArtifactRow } from "@/server/db/types";
import { completeFinalWorkJob, composeAndStoreFinalWork } from "./finalWorkService";

const baseInput = {
  clips: [
    {
      bytes: new TextEncoder().encode("clip-1"),
      durationSeconds: 4,
      generatedClipId: "generated-clip-1"
    }
  ],
  inputArtifactVersions: { "generated-clip-1": 1 },
  sessionId: "session-1",
  userId: "user-1"
};

describe("composeAndStoreFinalWork", () => {
  it("uploads one clip final work to generated storage and writes media/artifact metadata", async () => {
    const client = new FakeSupabaseClient();

    const result = await composeAndStoreFinalWork(client.asSupabaseClient(), successComposer("final"), baseInput);

    expect(result).toMatchObject({
      ok: true,
      providerKind: "stitch",
      providerName: "ffmpeg"
    });
    expect(result.ok && result.value.finalWork).toMatchObject({
      generatedClipIds: ["generated-clip-1"],
      mediaAssetId: "media-final-1",
      previewStatus: "ready"
    });
    expect(client.uploads[0]).toMatchObject({
      bucket: "storycam-generated",
      contentType: "video/mp4",
      upsert: false
    });
    expect(client.queries[0]?.table).toBe("media_assets");
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        kind: "final_work",
        mime_type: "video/mp4",
        source: "composer",
        storage_bucket: "storycam-generated",
        user_id: "user-1"
      })
    ]);
    expect(client.queries[1]?.table).toBe("storycam_artifacts");
    expect(client.queries[1]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        state: "ready",
        type: "final_work",
        user_id: "user-1"
      })
    ]);
  });

  it("preserves composer failures without writing storage or metadata", async () => {
    const client = new FakeSupabaseClient();
    const composer: FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput> = {
      providerKind: "stitch",
      providerName: "ffmpeg",
      async compose() {
        return providerFailure(this, new Error("ffmpeg missing with secret path"), {
          errorCode: "FFMPEG_NOT_CONFIGURED",
          retryable: false
        });
      }
    };

    const result = await composeAndStoreFinalWork(client.asSupabaseClient(), composer, baseInput);

    expect(result).toMatchObject({
      errorCode: "FFMPEG_NOT_CONFIGURED",
      ok: false,
      redactionApplied: true
    });
    expect(client.uploads).toEqual([]);
    expect(client.queries).toEqual([]);
  });
});

describe("completeFinalWorkJob", () => {
  it("keeps the job succeeded when post-success premiere ticket spending fails", async () => {
    const job = generationJob({
      inputArtifactVersionsJson: { "stitch-suggestion-1": 1 },
      premiereTicketId: "ticket-1",
      status: "running"
    });
    const client = new FakeSupabaseClient({
      artifacts: [stitchSuggestionArtifact(), generatedClipArtifact()],
      generationJob: job,
      mediaAssets: [generatedClipMediaAsset()],
      ticketSpendError: { code: "temporary_db_error" }
    });

    const completedJob = await completeFinalWorkJob(client.asSupabaseClient(), job, successComposer("final"));

    expect(completedJob).toMatchObject({
      id: "job-1",
      output_artifact_id: "artifact-final-1",
      status: "succeeded"
    });
    expect(client.generationJobUpdates).toContainEqual(expect.objectContaining({ status: "succeeded" }));
    expect(client.generationJobUpdates).not.toContainEqual(expect.objectContaining({ status: "failed" }));
    expect(client.ticketUpdates).toContainEqual(expect.objectContaining({ status: "spent" }));
  });
});

function successComposer(bytes: string): FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput> {
  return {
    providerKind: "stitch",
    providerName: "ffmpeg",
    async compose(input) {
      return providerSuccess(this, {
        bytes: new TextEncoder().encode(bytes),
        durationSeconds: input.clips.reduce((sum, clip) => sum + clip.durationSeconds, 0)
      });
    }
  };
}

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly uploads: Array<{ bucket: string; byteSize: number; contentType: string; path: string; upsert: boolean }> = [];
  readonly downloads: Array<{ bucket: string; path: string }> = [];
  readonly generationJobUpdates: Array<Record<string, unknown>> = [];
  readonly ticketUpdates: Array<Record<string, unknown>> = [];
  private readonly artifacts: StoryCamArtifactRow[];
  private readonly mediaAssets: MediaAssetRow[];
  private readonly ticketSpendError: { code?: string } | null;
  private generationJob: GenerationJobRow | null;

  constructor(
    options: {
      artifacts?: StoryCamArtifactRow[];
      generationJob?: GenerationJobRow;
      mediaAssets?: MediaAssetRow[];
      ticketSpendError?: { code?: string };
    } = {}
  ) {
    this.artifacts = options.artifacts ?? [];
    this.generationJob = options.generationJob ?? null;
    this.mediaAssets = options.mediaAssets ?? [];
    this.ticketSpendError = options.ticketSpendError ?? null;
  }

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  readonly storage = {
    from: (bucket: string) => ({
      download: (path: string) => {
        this.downloads.push({ bucket, path });
        return Promise.resolve({
          data: new Blob([new TextEncoder().encode("clip-bytes")]),
          error: null
        });
      },
      upload: (path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }) => {
        this.uploads.push({ bucket, byteSize: body.byteLength, contentType: options.contentType, path, upsert: options.upsert });
        return Promise.resolve({
          data: { path },
          error: null
        });
      }
    })
  };

  from(table: string) {
    const query = new FakeQuery(this, table);
    this.queries.push(query);
    return query;
  }

  listRows(table: string, filters: QueryFilter[]) {
    if (table === "storycam_artifacts") {
      return this.artifacts.filter((row) => matchesFilters(row, filters));
    }

    if (table === "media_assets") {
      return this.mediaAssets.filter((row) => matchesFilters(row, filters));
    }

    return [];
  }

  completeGenerationJob(update: Record<string, unknown>) {
    this.generationJobUpdates.push(update);

    if (!this.generationJob) {
      return null;
    }

    this.generationJob = {
      ...this.generationJob,
      ...update,
      updated_at: "2026-04-26T00:00:00.000Z"
    } as GenerationJobRow;

    return this.generationJob;
  }

  spendTicket(update: Record<string, unknown>) {
    this.ticketUpdates.push(update);

    if (this.ticketSpendError) {
      return {
        data: null,
        error: this.ticketSpendError
      };
    }

    return {
      data: {
        created_at: "2026-04-26T00:00:00.000Z",
        expires_at: null,
        id: "ticket-1",
        issued_by_user_id: null,
        note: null,
        reserved_at: "2026-04-26T00:00:00.000Z",
        reserved_session_id: "session-1",
        source: "new_user_auto",
        spent_at: "2026-04-26T00:00:00.000Z",
        status: "spent",
        updated_at: "2026-04-26T00:00:00.000Z",
        user_id: "user-1"
      },
      error: null
    };
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];
  private readonly filters: QueryFilter[] = [];
  private inserted: Record<string, unknown> | null = null;
  private updated: Record<string, unknown> | null = null;

  constructor(
    private readonly client: FakeSupabaseClient,
    readonly table: string
  ) {}

  insert(value: Record<string, unknown>) {
    this.inserted = value;
    this.calls.push(["insert", value]);
    return this;
  }

  update(value: Record<string, unknown>) {
    this.updated = value;
    this.calls.push(["update", value]);
    return this;
  }

  select(columns: string) {
    this.calls.push(["select", columns]);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, operator: "eq", value });
    this.calls.push(["eq", column, value]);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, operator: "in", value: values });
    this.calls.push(["in", column, values]);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ column, operator: "is", value });
    this.calls.push(["is", column, value]);
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.calls.push(["order", column, options]);
    return Promise.resolve({
      data: this.client.listRows(this.table, this.filters),
      error: null
    });
  }

  single() {
    return Promise.resolve({
      data: this.row(),
      error: null
    });
  }

  maybeSingle() {
    if (this.table === "generation_jobs" && this.updated) {
      return Promise.resolve({
        data: this.client.completeGenerationJob(this.updated),
        error: null
      });
    }

    if (this.table === "storycam_premiere_tickets" && this.updated) {
      return Promise.resolve(this.client.spendTicket(this.updated));
    }

    return Promise.resolve({
      data: null,
      error: null
    });
  }

  private row() {
    if (this.table === "media_assets") {
      return {
        id: "media-final-1",
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        ...this.inserted
      };
    }

    if (this.table === "storycam_artifacts") {
      return {
        id: "artifact-final-1",
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        stale_at: null,
        updated_at: "2026-04-26T00:00:00.000Z",
        ...this.inserted
      };
    }

    return this.inserted;
  }
}

type QueryFilter = {
  column: string;
  operator: "eq" | "in" | "is";
  value: unknown;
};

function matchesFilters(row: Record<string, unknown>, filters: QueryFilter[]) {
  return filters.every((filter) => {
    const value = row[filter.column];

    switch (filter.operator) {
      case "eq":
      case "is":
        return value === filter.value;
      case "in":
        return Array.isArray(filter.value) && filter.value.includes(value);
    }
  });
}

function generationJob(overrides: {
  inputArtifactVersionsJson?: GenerationJobRow["input_artifact_versions_json"];
  premiereTicketId?: string | null;
  status?: GenerationJobRow["status"];
} = {}): GenerationJobRow {
  return {
    attempts: 1,
    created_at: "2026-04-26T00:00:00.000Z",
    ended_at: null,
    error_code: null,
    generation_mode: "real",
    id: "job-1",
    idempotency_key_hash: "hash-1",
    input_artifact_versions_json: overrides.inputArtifactVersionsJson ?? {},
    locked_at: null,
    locked_by: null,
    max_attempts: 1,
    output_artifact_id: null,
    premiere_ticket_id: overrides.premiereTicketId ?? null,
    provider_error_category: null,
    provider_http_status: null,
    provider_kind: "stitch",
    provider_name: "ffmpeg",
    provider_request_id: null,
    redacted_error: null,
    run_after: "2026-04-26T00:00:00.000Z",
    session_id: "session-1",
    started_at: "2026-04-26T00:00:00.000Z",
    status: overrides.status ?? "queued",
    tombstoned_at: null,
    type: "final_work",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1"
  };
}

function stitchSuggestionArtifact(): StoryCamArtifactRow {
  return artifactRow({
    dataJson: {
      generatedClipArtifactIds: ["generated-clip-artifact-1"],
      generatedClipIds: ["generated-clip-1"],
      id: "stitch-suggestion-1",
      recommendation: "Render one private final work.",
      sessionId: "session-1",
      state: "ready",
      version: 1
    },
    id: "stitch-suggestion-1",
    type: "stitch_suggestion"
  });
}

function generatedClipArtifact(): StoryCamArtifactRow {
  return artifactRow({
    dataJson: {
      clipPromptPacketId: "clip-prompt-packet-1",
      coreGroupId: "core-group-1",
      durationSeconds: 4,
      id: "generated-clip-1",
      jobId: "video-job-1",
      mediaAssetId: "media-clip-1",
      providerName: "mock-video",
      reviewState: "accepted",
      sessionId: "session-1",
      state: "ready",
      version: 1
    },
    id: "generated-clip-artifact-1",
    type: "generated_clip"
  });
}

function artifactRow(overrides: {
  dataJson: StoryCamArtifactRow["data_json"];
  id: string;
  type: StoryCamArtifactRow["type"];
}): StoryCamArtifactRow {
  return {
    created_at: "2026-04-26T00:00:00.000Z",
    data_json: overrides.dataJson,
    deleted_at: null,
    depends_on_json: {},
    id: overrides.id,
    parent_artifact_id: null,
    session_id: "session-1",
    stale_at: null,
    state: "ready",
    type: overrides.type,
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    version: 1
  };
}

function generatedClipMediaAsset(): MediaAssetRow {
  return {
    byte_size: 1024,
    created_at: "2026-04-26T00:00:00.000Z",
    deleted_at: null,
    id: "media-clip-1",
    kind: "generated_clip",
    linked_artifact_id: "generated-clip-artifact-1",
    mime_type: "video/mp4",
    session_id: "session-1",
    source: "provider",
    storage_bucket: "storycam-generated",
    storage_path: "generated/clip-1.mp4",
    user_id: "user-1"
  };
}
