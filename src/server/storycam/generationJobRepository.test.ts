import { describe, expect, it } from "vitest";
import type { GenerationJobRow } from "@/server/db/types";
import type { StoryCamDbClient } from "./sessionRepository";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";

const job = {
  id: "job-1",
  user_id: "user-1",
  session_id: "session-1",
  type: "video_clip",
  status: "queued",
  idempotency_key_hash: "hash-1",
  generation_mode: "mock",
  provider_kind: "video",
  provider_name: "mock",
  provider_request_id: null,
  attempts: 0,
  max_attempts: 1,
  input_artifact_versions_json: {},
  output_artifact_id: null,
  error_code: null,
  provider_error_category: null,
  provider_http_status: null,
  redacted_error: null,
  started_at: null,
  ended_at: null,
  locked_at: null,
  locked_by: null,
  run_after: "2026-04-26T00:00:00.000Z",
  created_at: "2026-04-26T00:00:00.000Z",
  updated_at: "2026-04-26T00:00:00.000Z",
  tombstoned_at: null
} satisfies GenerationJobRow;

describe("generation-job repository", () => {
  it("returns the existing active job for duplicate idempotency keys", async () => {
    const client = new FakeSupabaseClient([{ data: job, error: null }]);
    const repository = new StoryCamGenerationJobRepository(client.asStoryCamDbClient());

    const result = await repository.createOrFindActiveByIdempotencyKey("user-1", {
      idempotencyKeyHash: "hash-1",
      providerKind: "video",
      providerName: "mock",
      sessionId: "session-1",
      type: "video_clip"
    });

    expect(result).toEqual(job);
    expect(client.queries).toHaveLength(1);
    expect(client.queries[0]?.calls).toContainEqual(["eq", "idempotency_key_hash", "hash-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["in", "status", ["queued", "running", "succeeded"]]);
    expect(client.queries[0]?.calls).toContainEqual(["is", "tombstoned_at", null]);
    expect(client.queries.some((query) => query.calls.some((call) => call[0] === "insert"))).toBe(false);
  });

  it("creates a job when no active idempotency match exists", async () => {
    const client = new FakeSupabaseClient([
      { data: null, error: null },
      { data: job, error: null }
    ]);
    const repository = new StoryCamGenerationJobRepository(client.asStoryCamDbClient());

    await repository.createOrFindActiveByIdempotencyKey("user-1", {
      idempotencyKeyHash: "hash-1",
      providerKind: "video",
      providerName: "mock",
      sessionId: "session-1",
      type: "video_clip"
    });

    expect(client.queries).toHaveLength(2);
    expect(client.queries[1]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        idempotency_key_hash: "hash-1",
        status: "queued",
        type: "video_clip",
        user_id: "user-1"
      })
    ]);
  });

  it("moves cancel_requested jobs to canceled or tombstoned states", async () => {
    const endedAt = new Date("2026-04-26T01:02:03.000Z");
    const tombstonedAt = new Date("2026-04-26T01:03:04.000Z");
    const client = new FakeSupabaseClient([
      { data: { ...job, status: "cancel_requested" }, error: null },
      { data: { ...job, ended_at: endedAt.toISOString(), status: "canceled" }, error: null },
      { data: { ...job, status: "canceled", tombstoned_at: tombstonedAt.toISOString() }, error: null }
    ]);
    const repository = new StoryCamGenerationJobRepository(client.asStoryCamDbClient());

    await repository.requestCancel("user-1", "job-1");
    await repository.markCanceled("user-1", "job-1", { endedAt });
    await repository.tombstone("user-1", "job-1", { tombstonedAt });

    expect(client.queries[0]?.calls).toContainEqual(["update", { status: "cancel_requested" }]);
    expect(client.queries[1]?.calls).toContainEqual([
      "update",
      expect.objectContaining({
        ended_at: "2026-04-26T01:02:03.000Z",
        status: "canceled"
      })
    ]);
    expect(client.queries[2]?.calls).toContainEqual([
      "update",
      expect.objectContaining({
        status: "canceled",
        tombstoned_at: "2026-04-26T01:03:04.000Z"
      })
    ]);
  });

  it("guards successful late results from tombstoned jobs", async () => {
    const client = new FakeSupabaseClient([{ data: job, error: null }]);
    const repository = new StoryCamGenerationJobRepository(client.asStoryCamDbClient());

    await repository.markSucceeded("user-1", "job-1", {
      endedAt: new Date("2026-04-26T01:02:03.000Z"),
      outputArtifactId: "clip-artifact-1"
    });

    expect(client.queries[0]?.calls).toContainEqual(["is", "tombstoned_at", null]);
    expect(client.queries[0]?.calls).toContainEqual([
      "update",
      expect.objectContaining({
        ended_at: "2026-04-26T01:02:03.000Z",
        output_artifact_id: "clip-artifact-1",
        status: "succeeded"
      })
    ]);
  });

  it("claims runnable jobs through the worker RPC", async () => {
    const client = new FakeSupabaseClient([{ data: [{ ...job, locked_by: "worker-1", status: "running" }], error: null }]);
    const repository = new StoryCamGenerationJobRepository(client.asStoryCamDbClient());

    const result = await repository.claimRunnable({
      jobTypes: ["video_clip", "final_work"],
      limit: 2,
      lockTtlSeconds: 120,
      workerId: "worker-1"
    });

    expect(result).toHaveLength(1);
    expect(client.rpcs).toEqual([
      {
        args: {
          job_types: ["video_clip", "final_work"],
          limit_count: 2,
          lock_ttl_seconds: 120,
          worker_id: "worker-1"
        },
        fn: "claim_storycam_generation_jobs"
      }
    ]);
  });

  it("releases active jobs for a later worker poll", async () => {
    const runAfter = new Date("2026-04-26T01:02:03.000Z");
    const client = new FakeSupabaseClient([{ data: { ...job, run_after: runAfter.toISOString() }, error: null }]);
    const repository = new StoryCamGenerationJobRepository(client.asStoryCamDbClient());

    await repository.releaseForRetry("user-1", "job-1", { runAfter });

    expect(client.queries[0]?.calls).toContainEqual([
      "update",
      expect.objectContaining({
        locked_at: null,
        locked_by: null,
        run_after: "2026-04-26T01:02:03.000Z"
      })
    ]);
  });

  it("records provider task submission without completing the job", async () => {
    const startedAt = new Date("2026-04-26T01:02:03.000Z");
    const client = new FakeSupabaseClient([
      { data: { ...job, provider_request_id: "provider-task-1", started_at: startedAt.toISOString(), status: "running" }, error: null }
    ]);
    const repository = new StoryCamGenerationJobRepository(client.asStoryCamDbClient());

    await repository.markProviderRequestSubmitted("user-1", "job-1", {
      providerRequestId: "provider-task-1",
      startedAt
    });

    expect(client.queries[0]?.calls).toContainEqual([
      "update",
      expect.objectContaining({
        provider_request_id: "provider-task-1",
        started_at: "2026-04-26T01:02:03.000Z",
        status: "running"
      })
    ]);
    expect(client.queries[0]?.calls).toContainEqual(["is", "tombstoned_at", null]);
    expect(client.queries[0]?.calls).toContainEqual(["in", "status", ["queued", "running"]]);
  });

  it("does not revive canceled jobs when provider submission finishes late", async () => {
    const client = new FakeSupabaseClient([{ data: null, error: null }]);
    const repository = new StoryCamGenerationJobRepository(client.asStoryCamDbClient());

    const result = await repository.markProviderRequestSubmitted("user-1", "job-1", {
      providerRequestId: "provider-task-1"
    });

    expect(result).toBeNull();
    expect(client.queries[0]?.calls).toContainEqual(["in", "status", ["queued", "running"]]);
  });
});

type FakeResponse = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly rpcs: Array<{ args: unknown; fn: string }> = [];
  private responseIndex = 0;

  constructor(private readonly responses: FakeResponse[]) {}

  asStoryCamDbClient() {
    return this as unknown as StoryCamDbClient;
  }

  nextResponse() {
    const response = this.responses[this.responseIndex] ?? this.responses.at(-1) ?? { data: null, error: null };
    this.responseIndex += 1;
    return response;
  }

  from(table: string) {
    const query = new FakeQuery(table, this);
    this.queries.push(query);
    return query;
  }

  rpc(fn: string, args: unknown) {
    this.rpcs.push({ args, fn });
    return Promise.resolve(this.nextResponse());
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];

  constructor(
    readonly table: string,
    private readonly client: FakeSupabaseClient
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

  in(column: string, values: unknown[]) {
    this.calls.push(["in", column, values]);
    return this;
  }

  single() {
    return Promise.resolve(this.client.nextResponse());
  }

  maybeSingle() {
    return Promise.resolve(this.client.nextResponse());
  }
}
