import { describe, expect, it } from "vitest";
import type { StoryCamDbClient } from "./sessionRepository";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { StoryCamProviderRequestRepository } from "./providerRequestRepository";
import { StoryCamRepositoryError } from "./repositoryErrors";

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
  created_at: "2026-04-26T00:00:00.000Z",
  updated_at: "2026-04-26T00:00:00.000Z",
  tombstoned_at: null
} as const;

const media = {
  id: "media-1",
  user_id: "user-1",
  session_id: "session-1",
  kind: "mock_clip",
  mime_type: "video/mp4",
  byte_size: 1024,
  storage_bucket: "storycam-mock",
  storage_path: "users/user-1/sessions/session-1/mock/clip.mp4",
  source: "mock",
  linked_artifact_id: "artifact-1",
  created_at: "2026-04-26T00:00:00.000Z",
  deleted_at: null
} as const;

const providerRequest = {
  id: "provider-request-1",
  user_id: "user-1",
  job_id: "job-1",
  provider_kind: "video",
  provider_name: "mock",
  provider_request_id: "mock-request-1",
  request_summary_json: { type: "mock clip" },
  response_summary_json: null,
  status: "submitted",
  created_at: "2026-04-26T00:00:00.000Z",
  updated_at: "2026-04-26T00:00:00.000Z"
} as const;

describe("StoryCam metadata repositories", () => {
  it("creates generation jobs with user scope and hashed idempotency keys", async () => {
    const client = new FakeSupabaseClient({ data: job, error: null });
    const repository = new StoryCamGenerationJobRepository(client.asStoryCamDbClient());

    await repository.create("user-1", {
      idempotencyKeyHash: "hash-1",
      providerKind: "video",
      providerName: "mock",
      sessionId: "session-1",
      type: "video_clip"
    });

    expect(client.queries[0]?.table).toBe("generation_jobs");
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      {
        generation_mode: "mock",
        idempotency_key_hash: "hash-1",
        input_artifact_versions_json: {},
        max_attempts: 1,
        output_artifact_id: null,
        provider_kind: "video",
        provider_name: "mock",
        provider_request_id: null,
        session_id: "session-1",
        status: "queued",
        type: "video_clip",
        user_id: "user-1"
      }
    ]);
  });

  it("finds and completes active jobs without touching tombstoned rows", async () => {
    const client = new FakeSupabaseClient({ data: job, error: null });
    const repository = new StoryCamGenerationJobRepository(client.asStoryCamDbClient());
    const endedAt = new Date("2026-04-26T01:02:03.000Z");

    await repository.findActiveByIdempotencyKey("user-1", "hash-1");
    await repository.markSucceeded("user-1", "job-1", { endedAt, outputArtifactId: "artifact-1" });

    expect(client.queries[0]?.calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["eq", "idempotency_key_hash", "hash-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["is", "tombstoned_at", null]);
    expect(client.queries[1]?.calls).toContainEqual([
      "update",
      {
        ended_at: "2026-04-26T01:02:03.000Z",
        output_artifact_id: "artifact-1",
        status: "succeeded"
      }
    ]);
    expect(client.queries[1]?.calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(client.queries[1]?.calls).toContainEqual(["is", "tombstoned_at", null]);
  });

  it("stores media metadata without signed or public URLs", async () => {
    const client = new FakeSupabaseClient({ data: media, error: null });
    const repository = new StoryCamMediaAssetRepository(client.asStoryCamDbClient());

    await repository.create("user-1", {
      byteSize: 1024,
      kind: "mock_clip",
      linkedArtifactId: "artifact-1",
      mimeType: "video/mp4",
      sessionId: "session-1",
      source: "mock",
      storageBucket: "storycam-mock",
      storagePath: "users/user-1/sessions/session-1/mock/clip.mp4"
    });

    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      {
        byte_size: 1024,
        kind: "mock_clip",
        linked_artifact_id: "artifact-1",
        mime_type: "video/mp4",
        session_id: "session-1",
        source: "mock",
        storage_bucket: "storycam-mock",
        storage_path: "users/user-1/sessions/session-1/mock/clip.mp4",
        user_id: "user-1"
      }
    ]);
  });

  it("lists media and provider requests by owner", async () => {
    const client = new FakeSupabaseClient({ data: [media], error: null });
    const mediaRepository = new StoryCamMediaAssetRepository(client.asStoryCamDbClient());
    const providerRepository = new StoryCamProviderRequestRepository(client.asStoryCamDbClient());

    await mediaRepository.listBySession("user-1", "session-1");
    await providerRepository.listByJob("user-1", "job-1");

    expect(client.queries[0]?.calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["eq", "session_id", "session-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["is", "deleted_at", null]);
    expect(client.queries[1]?.calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(client.queries[1]?.calls).toContainEqual(["eq", "job_id", "job-1"]);
  });

  it("lists storage cleanup candidates even after media metadata is soft-deleted", async () => {
    const client = new FakeSupabaseClient({ data: [media], error: null });
    const repository = new StoryCamMediaAssetRepository(client.asStoryCamDbClient());

    await repository.listStorageCleanupCandidates("user-1", "session-1");

    expect(client.queries[0]?.calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(client.queries[0]?.calls).toContainEqual(["eq", "session_id", "session-1"]);
    expect(client.queries[0]?.calls).not.toContainEqual(["is", "deleted_at", null]);
  });

  it("stores provider summaries instead of raw prompts", async () => {
    const client = new FakeSupabaseClient({ data: providerRequest, error: null });
    const repository = new StoryCamProviderRequestRepository(client.asStoryCamDbClient());

    await repository.create("user-1", {
      jobId: "job-1",
      providerKind: "video",
      providerName: "mock",
      providerRequestId: "mock-request-1",
      requestSummaryJson: { type: "mock clip" }
    });

    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      {
        job_id: "job-1",
        provider_kind: "video",
        provider_name: "mock",
        provider_request_id: "mock-request-1",
        request_summary_json: { type: "mock clip" },
        response_summary_json: null,
        status: "submitted",
        user_id: "user-1"
      }
    ]);
  });

  it("throws redacted repository errors", async () => {
    const client = new FakeSupabaseClient({
      data: null,
      error: { code: "42501", message: "signed url and service role key should stay hidden" }
    });
    const repository = new StoryCamMediaAssetRepository(client.asStoryCamDbClient());

    await expect(repository.listBySession("user-1", "session-1")).rejects.toMatchObject({
      code: "42501",
      operation: "list_media_assets"
    });
    await expect(repository.listBySession("user-1", "session-1")).rejects.toBeInstanceOf(StoryCamRepositoryError);
    await expect(repository.listBySession("user-1", "session-1")).rejects.not.toThrow("service role key");
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
