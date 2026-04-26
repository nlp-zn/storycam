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

describe("POST /api/storyboard", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("requires a confirmed story world before generating storyboard artifacts", async () => {
    const { POST } = await import("@/app/api/storyboard/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient({ artifactRows: storyWorldRows() }).asSupabaseClient());

    const response = await POST(
      jsonRequest({
        confirmedArtifactVersions: {},
        plannedDurationSeconds: 12,
        sessionId: "session-1"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "story_world_not_confirmed",
      redactedError: "Invalid storyboard request.",
      redactionApplied: true
    });
  });

  it("creates a storyboard script and 1-3 core groups from the duration plan", async () => {
    const { POST } = await import("@/app/api/storyboard/route");
    const client = new FakeSupabaseClient({ artifactRows: storyWorldRows() });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(
      jsonRequest({
        confirmedArtifactVersions: {
          "character-artifact-1": 1,
          "scene-artifact-1": 1,
          "script-artifact-1": 1
        },
        plannedDurationSeconds: 14,
        sessionId: "session-1"
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      artifacts: {
        coreStoryboardGroups: [
          { state: "ready", type: "core_storyboard_group", version: 1 },
          { state: "ready", type: "core_storyboard_group", version: 1 },
          { state: "ready", type: "core_storyboard_group", version: 1 }
        ],
        storyboardScript: { state: "ready", type: "storyboard_script", version: 1 }
      },
      coreStoryboardGroups: [{}, {}, {}],
      durationPlan: {
        clipDurationTargets: [4.7, 4.7, 4.7],
        coreGroupTargetCount: 3,
        plannedDurationSeconds: 14
      },
      ok: true,
      sessionId: "session-1"
    });

    const artifactInserts = client.queries
      .filter((query) => query.table === "storycam_artifacts")
      .flatMap((query) => query.calls)
      .filter((call) => call[0] === "insert");
    const sessionUpdate = client.queries.find((query) => query.table === "storycam_sessions" && query.calls.some((call) => call[0] === "update"));

    expect(artifactInserts).toHaveLength(4);
    expect(sessionUpdate?.calls).toContainEqual([
      "update",
      {
        core_group_target_count: 3,
        planned_duration_seconds: 14,
        status: "ready"
      }
    ]);
  });
});

function jsonRequest(body: unknown) {
  return new Request("https://storycam.test/api/storyboard", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

function storyWorldRows() {
  return [
    artifactRow("script-artifact-1", "script", {
      beats: ["She pauses under the convenience-store awning and looks at the unsent message."],
      id: "script-rainy-crush",
      logline: "An unspoken crush lingers through a rainy night.",
      sessionId: "session-1",
      state: "ready",
      summary: "She thinks she is only hiding from rain, but she is waiting for a confession that never arrives.",
      title: "The Unsent Rainy Message",
      version: 1
    }),
    artifactRow("character-artifact-1", "character_asset", {
      emotionalBaseline: "Reserved, sensitive, and more fluent in gestures than words.",
      id: "character-rainy-crush-lead",
      name: "Lin Xia",
      props: ["unsent message"],
      referenceMediaIds: [],
      relationshipToUserStory: "Turns an ordinary crush memory into the lead character.",
      role: "person with an unspoken crush",
      sessionId: "session-1",
      stableVisualDescription: "A person in their twenties, dark jacket, convenience-store light reflected on their face.",
      state: "ready",
      version: 1,
      wardrobe: "Dark short jacket and white canvas shoes"
    }),
    artifactRow("scene-artifact-1", "scene_asset", {
      atmosphere: "Quiet, damp, and intimate like a private memory.",
      id: "scene-rainy-convenience-store",
      keyObjects: ["convenience-store glass", "umbrella", "phone screen"],
      light: "Warm store light and street lamps reflected in rainwater.",
      location: "Outside a corner convenience store",
      name: "Rainy Convenience Store",
      referenceMediaIds: [],
      sessionId: "session-1",
      spatialLogic: "The awning gives shelter, and the glass reflects both the lead and the street.",
      state: "ready",
      timeOfDay: "Night",
      version: 1
    })
  ];
}

function artifactRow(id: string, type: string, dataJson: Record<string, unknown>) {
  return {
    created_at: "2026-04-26T00:00:00.000Z",
    data_json: dataJson,
    deleted_at: null,
    depends_on_json: {},
    id,
    parent_artifact_id: null,
    session_id: "session-1",
    stale_at: null,
    state: "ready",
    type,
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
              status: "draft",
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
    if (this.table === "storycam_sessions") {
      return {
        core_group_target_count: this.updated?.core_group_target_count ?? 1,
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        generation_mode: "mock",
        id: "session-1",
        planned_duration_seconds: this.updated?.planned_duration_seconds ?? 12,
        status: this.updated?.status ?? "draft",
        updated_at: "2026-04-26T00:00:00.000Z",
        user_id: "user-1"
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
