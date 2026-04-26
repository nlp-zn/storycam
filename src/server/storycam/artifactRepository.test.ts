import { describe, expect, it } from "vitest";
import type { StoryCamDbClient } from "./sessionRepository";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { StoryCamRepositoryError } from "./repositoryErrors";

const sampleArtifact = {
  id: "artifact-1",
  user_id: "user-1",
  session_id: "session-1",
  type: "script",
  state: "ready",
  version: 2,
  parent_artifact_id: null,
  data_json: { title: "Rain" },
  depends_on_json: { input: 1 },
  created_at: "2026-04-26T00:00:00.000Z",
  updated_at: "2026-04-26T00:00:00.000Z",
  stale_at: null,
  deleted_at: null
} as const;

describe("StoryCamArtifactRepository", () => {
  it("writes artifact versions by insert only", async () => {
    const client = new FakeSupabaseClient({ data: sampleArtifact, error: null });
    const repository = new StoryCamArtifactRepository(client.asStoryCamDbClient());

    const artifact = await repository.createVersion("user-1", {
      dataJson: { title: "Rain" },
      dependsOnJson: { input: 1 },
      sessionId: "session-1",
      type: "script",
      version: 2
    });

    expect(artifact).toEqual(sampleArtifact);
    expect(client.queries[0]?.table).toBe("storycam_artifacts");
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      {
        data_json: { title: "Rain" },
        depends_on_json: { input: 1 },
        parent_artifact_id: null,
        session_id: "session-1",
        state: "ready",
        type: "script",
        user_id: "user-1",
        version: 2
      }
    ]);
    expect(client.queries[0]?.calls.some(([method]) => method === "update")).toBe(false);
  });

  it("lists artifacts with user and session scope", async () => {
    const client = new FakeSupabaseClient({ data: [sampleArtifact], error: null });
    const repository = new StoryCamArtifactRepository(client.asStoryCamDbClient());

    await repository.listBySession("user-1", { sessionId: "session-1", type: "script" });

    expect(client.queries[0]?.calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["eq", "session_id", "session-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["eq", "type", "script"]);
    expect(client.queries[0]?.calls).toContainEqual(["is", "deleted_at", null]);
    expect(client.queries[0]?.calls).toContainEqual(["order", "created_at", { ascending: true }]);
  });

  it("finds the latest artifact version without exposing deleted rows", async () => {
    const client = new FakeSupabaseClient({ data: sampleArtifact, error: null });
    const repository = new StoryCamArtifactRepository(client.asStoryCamDbClient());

    await repository.findLatestByType("user-1", "session-1", "script");

    expect(client.queries[0]?.calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["eq", "session_id", "session-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["eq", "type", "script"]);
    expect(client.queries[0]?.calls).toContainEqual(["is", "deleted_at", null]);
    expect(client.queries[0]?.calls).toContainEqual(["order", "version", { ascending: false }]);
    expect(client.queries[0]?.calls).toContainEqual(["limit", 1]);
  });

  it("throws redacted repository errors", async () => {
    const client = new FakeSupabaseClient({
      data: null,
      error: { code: "23514", message: "full prompt packet should stay hidden" }
    });
    const repository = new StoryCamArtifactRepository(client.asStoryCamDbClient());

    await expect(repository.findLatestByType("user-1", "session-1", "script")).rejects.toMatchObject({
      code: "23514",
      operation: "find_latest_artifact"
    });
    await expect(repository.findLatestByType("user-1", "session-1", "script")).rejects.toBeInstanceOf(
      StoryCamRepositoryError
    );
    await expect(repository.findLatestByType("user-1", "session-1", "script")).rejects.not.toThrow("prompt packet");
  });
});

type FakeResponse = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];

  constructor(private readonly response: FakeResponse) {}

  asStoryCamDbClient() {
    return this as unknown as StoryCamDbClient;
  }

  from(table: string) {
    const query = new FakeQuery(table, this.response);
    this.queries.push(query);
    return query;
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

  order(column: string, options: Record<string, unknown>) {
    this.calls.push(["order", column, options]);
    return this;
  }

  limit(count: number) {
    this.calls.push(["limit", count]);
    return this;
  }

  single() {
    return Promise.resolve(this.response);
  }

  maybeSingle() {
    return Promise.resolve(this.response);
  }

  then(resolve: (value: FakeResponse) => void, reject?: (reason: unknown) => void) {
    return Promise.resolve(this.response).then(resolve, reject);
  }
}
