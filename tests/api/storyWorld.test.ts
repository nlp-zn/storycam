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

describe("POST /api/story-world", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("returns a redacted validation error for empty input", async () => {
    const { POST } = await import("@/app/api/story-world/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient().asSupabaseClient());

    const response = await POST(jsonRequest({ input: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_input",
      redactedError: "Invalid story world request.",
      redactionApplied: true
    });
  });

  it("returns artifact versions from mock mode", async () => {
    const { POST } = await import("@/app/api/story-world/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient().asSupabaseClient());

    const response = await POST(
      jsonRequest({
        input: "我想把暗恋拍成韩剧雨夜",
        lightweightChoices: ["rainy"],
        plannedDurationSeconds: 12
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      artifacts: {
        characterAssets: [{ type: "character_asset", version: 1 }],
        sceneAssets: [{ type: "scene_asset", version: 1 }],
        script: { type: "script", version: 1 }
      },
      ok: true,
      sessionId: "session-1"
    });
  });
});

function jsonRequest(body: unknown) {
  return new Request("https://storycam.test/api/story-world", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];

  asSupabaseClient() {
    return this;
  }

  from(table: string) {
    const query = new FakeQuery(table);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  private inserted: Record<string, unknown> | null = null;

  constructor(readonly table: string) {}

  insert(value: Record<string, unknown>) {
    this.inserted = value;
    return this;
  }

  select() {
    return this;
  }

  single() {
    return Promise.resolve({
      data: this.row(),
      error: null
    });
  }

  private row() {
    if (this.table === "storycam_sessions") {
      return {
        core_group_target_count: 1,
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        generation_mode: "mock",
        id: "session-1",
        planned_duration_seconds: 12,
        status: "draft",
        updated_at: "2026-04-26T00:00:00.000Z",
        user_id: "user-1"
      };
    }

    if (this.table === "storycam_artifacts") {
      return {
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        id: `${this.inserted?.type}-artifact-1`,
        stale_at: null,
        updated_at: "2026-04-26T00:00:00.000Z",
        ...this.inserted
      };
    }

    return this.inserted;
  }
}
