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

describe("POST /api/storyboard-groups/:id/expand", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("creates three expanded storyboard cards by default without creating video jobs", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/expand/route");
    const client = new FakeSupabaseClient({ artifactRows: [coreGroupRow()] });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(jsonRequest({ sessionId: "session-1" }), {
      params: Promise.resolve({ id: "core-artifact-1" })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      expandedStoryboardCards: [
        { parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
        { parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
        { parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 }
      ],
      ok: true,
      sessionId: "session-1"
    });

    const artifactInserts = client.queries
      .filter((query) => query.table === "storycam_artifacts")
      .flatMap((query) => query.calls)
      .filter((call) => call[0] === "insert");

    expect(artifactInserts).toHaveLength(3);
    expect(client.queries.some((query) => query.table === "generation_jobs")).toBe(false);
  });

  it("caps requested expanded storyboard cards at eight", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/expand/route");
    const client = new FakeSupabaseClient({ artifactRows: [coreGroupRow()] });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(jsonRequest({ sessionId: "session-1", targetCount: 20 }), {
      params: { id: "core-artifact-1" }
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.expandedStoryboardCards).toHaveLength(8);
    expect(client.queries.some((query) => query.table === "generation_jobs")).toBe(false);
  });

  it("rejects missing core groups", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/expand/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient({ artifactRows: [] }).asSupabaseClient());

    const response = await POST(jsonRequest({ sessionId: "session-1" }), {
      params: { id: "missing-core" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "core_group_not_found",
      redactedError: "Invalid expansion request.",
      redactionApplied: true
    });
  });
});

function jsonRequest(body: unknown) {
  return new Request("https://storycam.test/api/storyboard-groups/core-artifact-1/expand", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

function coreGroupRow() {
  return {
    created_at: "2026-04-26T00:00:00.000Z",
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
    deleted_at: null,
    depends_on_json: {
      "character-artifact-1": 1,
      "scene-artifact-1": 1,
      "script-artifact-1": 1
    },
    id: "core-artifact-1",
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
