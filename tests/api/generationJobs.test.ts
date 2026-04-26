import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/requireUser", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/requireUser")>("@/server/auth/requireUser");

  return {
    ...actual,
    requireUser: requireUserMock
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

describe("generation job API routes", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("creates a video generation job for a confirmed core storyboard group", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/generate-clip/route");
    const client = new FakeSupabaseClient({ artifactRows: [coreGroupRow(), expandedCardRow()] });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(generateClipRequest(), {
      params: Promise.resolve({ id: "core-artifact-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      confirmationSummary: expect.stringContaining("Unsent Message"),
      jobId: "job-1",
      ok: true,
      status: "queued"
    });
    expect(JSON.stringify(body)).not.toContain("idempotency-secret");
    expect(JSON.stringify(body)).not.toContain("redactedPromptSummary");

    const jobInsert = client.queries
      .filter((query) => query.table === "generation_jobs")
      .flatMap((query) => query.calls)
      .find((call) => call[0] === "insert")?.[1];

    expect(jobInsert).toMatchObject({
      provider_kind: "video",
      provider_name: "mock",
      type: "video_clip"
    });
  });

  it("returns an existing active job for duplicate idempotency keys before creating a packet", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/generate-clip/route");
    const client = new FakeSupabaseClient({ activeJob: jobRow({ id: "job-existing", status: "running" }) });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(generateClipRequest(), {
      params: { id: "core-artifact-1" }
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      jobId: "job-existing",
      ok: true,
      status: "running"
    });
    expect(client.queries.some((query) => query.table === "storycam_artifacts")).toBe(false);
  });

  it("polls a generation job status with a safe summary", async () => {
    const { GET } = await import("@/app/api/generation-jobs/[id]/route");
    const client = new FakeSupabaseClient({
      job: jobRow({ output_artifact_id: "clip-artifact-1", status: "succeeded" })
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/generation-jobs/job-1"), {
      params: { id: "job-1" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: {
        attempts: 0,
        id: "job-1",
        outputArtifactId: "clip-artifact-1",
        providerKind: "video",
        providerName: "mock",
        sessionId: "session-1",
        status: "succeeded",
        type: "video_clip"
      },
      ok: true
    });
  });

  it("cancels generation jobs with a local tombstone", async () => {
    const { POST } = await import("@/app/api/generation-jobs/[id]/cancel/route");
    const client = new FakeSupabaseClient({ job: jobRow({ status: "canceled", tombstoned_at: "2026-04-26T01:02:03.000Z" }) });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(new Request("https://storycam.test/api/generation-jobs/job-1/cancel", { method: "POST" }), {
      params: Promise.resolve({ id: "job-1" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: "job-1",
      ok: true,
      status: "canceled"
    });
    expect(client.queries[0]?.calls).toContainEqual(["is", "tombstoned_at", null]);
    expect(client.queries[0]?.calls).toContainEqual([
      "update",
      expect.objectContaining({
        status: "canceled",
        tombstoned_at: expect.any(String)
      })
    ]);
  });
});

function generateClipRequest() {
  return new Request("https://storycam.test/api/storyboard-groups/core-artifact-1/generate-clip", {
    body: JSON.stringify({
      confirmedArtifactVersions: {
        "core-artifact-1": 1,
        "expanded-artifact-1": 1
      },
      coreStoryboardGroupId: "core-artifact-1",
      idempotencyKey: "idempotency-secret",
      providerSendConfirmed: true,
      sessionId: "session-1"
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    attempts: 0,
    created_at: "2026-04-26T00:00:00.000Z",
    ended_at: null,
    error_code: null,
    generation_mode: "mock",
    id: "job-1",
    idempotency_key_hash: "hash-1",
    input_artifact_versions_json: {},
    max_attempts: 1,
    output_artifact_id: null,
    provider_kind: "video",
    provider_name: "mock",
    provider_request_id: null,
    redacted_error: null,
    session_id: "session-1",
    started_at: null,
    status: "queued",
    tombstoned_at: null,
    type: "video_clip",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    ...overrides
  };
}

function coreGroupRow() {
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
    type: "core_storyboard_group"
  };
}

function expandedCardRow() {
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

function baseArtifactRow() {
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
  activeJob?: unknown;
  artifactRows?: unknown[];
  job?: unknown;
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  private artifactInsertCount = 0;

  constructor(private readonly options: FakeSupabaseClientOptions = {}) {}

  asSupabaseClient() {
    return this;
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
  private updated: Record<string, unknown> | null = null;

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

  single() {
    return Promise.resolve({
      data: this.singleRow(),
      error: null
    });
  }

  maybeSingle() {
    return Promise.resolve({
      data: this.maybeSingleRow(),
      error: null
    });
  }

  then(resolve: (value: { data: unknown; error: null }) => void, reject?: (reason: unknown) => void) {
    return Promise.resolve({
      data: this.table === "storycam_artifacts" ? (this.options.artifactRows ?? []) : [],
      error: null
    }).then(resolve, reject);
  }

  private maybeSingleRow() {
    if (this.table === "generation_jobs" && this.calls.some((call) => call[0] === "eq" && call[1] === "idempotency_key_hash")) {
      return this.options.activeJob ?? null;
    }

    if (this.table === "generation_jobs") {
      return this.options.job ?? this.options.activeJob ?? null;
    }

    if (this.table === "storycam_sessions") {
      return {
        core_group_target_count: 1,
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        generation_mode: "mock",
        id: "session-1",
        planned_duration_seconds: 12,
        status: "ready",
        updated_at: "2026-04-26T00:00:00.000Z",
        user_id: "user-1"
      };
    }

    return null;
  }

  private singleRow() {
    if (this.table === "generation_jobs") {
      return {
        ...jobRow(),
        ...this.inserted,
        ...this.updated,
        id: this.options.job && typeof this.options.job === "object" && "id" in this.options.job ? this.options.job.id : "job-1"
      };
    }

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
