import { describe, expect, it } from "vitest";
import {
  StoryCamRepositoryError,
  StoryCamSessionRepository,
  type StoryCamDbClient
} from "./sessionRepository";

const sampleSession = {
  id: "session-1",
  user_id: "user-1",
  status: "draft",
  generation_mode: "mock",
  video_aspect_ratio: "16:9",
  planned_duration_seconds: 12,
  core_group_target_count: 1,
  created_at: "2026-04-26T00:00:00.000Z",
  updated_at: "2026-04-26T00:00:00.000Z",
  deleted_at: null
} as const;

describe("StoryCamSessionRepository", () => {
  it("creates sessions scoped to the authenticated user", async () => {
    const client = new FakeSupabaseClient({ data: sampleSession, error: null });
    const repository = new StoryCamSessionRepository(client.asStoryCamDbClient());

    const session = await repository.create("user-1", {
      coreGroupTargetCount: 2,
      generationMode: "real",
      plannedDurationSeconds: 15
    });

    expect(session).toEqual(sampleSession);
    expect(client.queries[0]?.table).toBe("storycam_sessions");
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      {
        core_group_target_count: 2,
        generation_mode: "real",
        planned_duration_seconds: 15,
        status: "draft",
        user_id: "user-1",
        video_aspect_ratio: "16:9"
      }
    ]);
  });

  it("reads and updates sessions with user scope and soft-delete filtering", async () => {
    const client = new FakeSupabaseClient({ data: sampleSession, error: null });
    const repository = new StoryCamSessionRepository(client.asStoryCamDbClient());

    await repository.findById("user-1", "session-1");
    await repository.update("user-1", "session-1", { status: "generating" });

    expect(client.queries[0]?.calls).toContainEqual(["eq", "id", "session-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["is", "deleted_at", null]);
    expect(client.queries[1]?.calls).toContainEqual(["update", { status: "generating" }]);
    expect(client.queries[1]?.calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(client.queries[1]?.calls).toContainEqual(["is", "deleted_at", null]);
  });

  it("delegates session deletion to the database RPC", async () => {
    const client = new FakeSupabaseClient({ data: sampleSession, error: null });
    const repository = new StoryCamSessionRepository(client.asStoryCamDbClient());
    const deletedAt = new Date("2026-04-26T01:02:03.000Z");

    await repository.softDelete("user-1", "session-1", deletedAt);

    expect(client.rpcs).toEqual([
      {
        args: {
          target_deleted_at: "2026-04-26T01:02:03.000Z",
          target_session_id: "session-1",
          target_user_id: "user-1"
        },
        name: "soft_delete_storycam_session"
      }
    ]);
  });

  it("throws redacted repository errors", async () => {
    const client = new FakeSupabaseClient({
      data: null,
      error: { code: "42501", message: "raw provider payload and service role key should stay hidden" }
    });
    const repository = new StoryCamSessionRepository(client.asStoryCamDbClient());

    await expect(repository.findById("user-1", "session-1")).rejects.toMatchObject({
      code: "42501",
      operation: "find_session"
    });
    await expect(repository.findById("user-1", "session-1")).rejects.toBeInstanceOf(StoryCamRepositoryError);
    await expect(repository.findById("user-1", "session-1")).rejects.not.toThrow("service role key");
  });
});

type FakeResponse = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly rpcs: Array<{ args: Record<string, unknown>; name: string }> = [];

  constructor(private readonly response: FakeResponse) {}

  asStoryCamDbClient() {
    return this as unknown as StoryCamDbClient;
  }

  from(table: string) {
    const query = new FakeQuery(table, this.response);
    this.queries.push(query);
    return query;
  }

  rpc(name: string, args: Record<string, unknown>) {
    this.rpcs.push({ args, name });
    return Promise.resolve({ error: this.response.error });
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];

  constructor(
    readonly table: string,
    private readonly response: FakeResponse
  ) {}

  insert(value: unknown) {
    this.calls.push(["insert", value]);
    return this;
  }

  update(value: unknown) {
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

  single() {
    return Promise.resolve(this.response);
  }

  maybeSingle() {
    return Promise.resolve(this.response);
  }
}
