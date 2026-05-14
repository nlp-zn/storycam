import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/types";
import { createMockVideoProvider } from "./videoProvider";

const baseInput = {
  clipPromptPacketId: "packet-1",
  coreGroupId: "core-group-1",
  durationSeconds: 4.5,
  idempotencyKey: "raw-idempotency-key",
  inputArtifactVersions: { "packet-1": 1 },
  sessionId: "session-1",
  userId: "user-1"
} as const;

describe("mock video provider", () => {
  it("generates a mock clip without external service calls", async () => {
    const client = new FakeSupabaseClient();
    const provider = createMockVideoProvider(client.asSupabaseClient(), { signedUrlExpiresIn: 60 });

    const result = await provider.generateClip(baseInput);

    expect(result).toMatchObject({
      ok: true,
      providerKind: "video",
      providerName: "mock"
    });
    expect(result.ok && result.value.generatedClip).toMatchObject({
      clipPromptPacketId: "packet-1",
      coreGroupId: "core-group-1",
      durationSeconds: 4.5,
      providerName: "mock"
    });
    expect(result.ok && result.value.media).toMatchObject({
      bucket: "storycam-mock",
      mimeType: "video/mp4",
      signedUrl: "https://signed.example/mock.mp4",
      signedUrlExpiresIn: 60
    });
    expect(result.ok && result.value.media.path).toMatch(
      /^users\/user-1\/sessions\/session-1\/mock\/clips\/core-group-1-.+\.mp4$/
    );
    expect(client.externalCalls).toEqual([]);
  });

  it("creates job, storage object, media metadata, generated clip artifact, and succeeded job state", async () => {
    const client = new FakeSupabaseClient();
    const provider = createMockVideoProvider(client.asSupabaseClient());

    await provider.generateClip(baseInput);

    expect(client.queries[0]?.table).toBe("generation_jobs");
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        generation_mode: "mock",
        provider_kind: "video",
        provider_name: "mock",
        status: "running",
        type: "video_clip",
        user_id: "user-1"
      })
    ]);
    expect(client.queries[0]?.calls[0]?.[1]).not.toMatchObject({
      idempotency_key_hash: "raw-idempotency-key"
    });
    expect(client.uploads[0]).toMatchObject({
      bucket: "storycam-mock",
      contentType: "video/mp4",
      upsert: false
    });
    expect(client.queries[1]?.table).toBe("media_assets");
    expect(client.queries[1]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        kind: "mock_clip",
        mime_type: "video/mp4",
        source: "mock",
        storage_bucket: "storycam-mock",
        user_id: "user-1"
      })
    ]);
    expect(client.queries[2]?.table).toBe("storycam_artifacts");
    expect(client.queries[2]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        state: "ready",
        type: "generated_clip",
        user_id: "user-1"
      })
    ]);
    expect(client.queries[3]?.table).toBe("generation_jobs");
    expect(client.queries[3]?.calls).toContainEqual([
      "update",
      expect.objectContaining({
        output_artifact_id: "artifact-1",
        status: "succeeded"
      })
    ]);
    expect(client.signedUrls).toEqual([
      {
        bucket: "storycam-mock",
        expiresIn: 300,
        path: client.uploads[0]?.path
      }
    ]);
  });

  it("supports timeout, policy refusal, and provider error scenarios", async () => {
    await expect(
      createMockVideoProvider(new FakeSupabaseClient().asSupabaseClient(), { scenario: "timeout" }).generateClip(
        baseInput
      )
    ).resolves.toMatchObject({
      errorCode: "MOCK_VIDEO_TIMEOUT",
      ok: false,
      retryable: true
    });
    await expect(
      createMockVideoProvider(new FakeSupabaseClient().asSupabaseClient(), {
        scenario: "policy_refusal"
      }).generateClip(baseInput)
    ).resolves.toMatchObject({
      errorCode: "MOCK_VIDEO_POLICY_REFUSAL",
      ok: false,
      retryable: false
    });
    await expect(
      createMockVideoProvider(new FakeSupabaseClient().asSupabaseClient(), {
        scenario: "provider_error"
      }).generateClip(baseInput)
    ).resolves.toMatchObject({
      errorCode: "MOCK_VIDEO_PROVIDER_ERROR",
      ok: false,
      retryable: true
    });
  });
});

class FakeSupabaseClient {
  readonly externalCalls: string[] = [];
  readonly queries: FakeQuery[] = [];
  readonly signedUrls: Array<{ bucket: string; expiresIn: number; path: string | undefined }> = [];
  readonly uploads: Array<{ bucket: string; byteSize: number; contentType: string; path: string; upsert: boolean }> = [];

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  readonly storage = {
    from: (bucket: string) => ({
      createSignedUrl: (path: string, expiresIn: number) => {
        this.signedUrls.push({ bucket, expiresIn, path });
        return Promise.resolve({
          data: { signedUrl: "https://signed.example/mock.mp4" },
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
    const query = new FakeQuery(table);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];
  private inserted: Record<string, unknown> | null = null;
  private updated: Record<string, unknown> | null = null;

  constructor(readonly table: string) {}

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

  in(column: string, values: unknown[]) {
    this.calls.push(["in", column, values]);
    return this;
  }

  single() {
    return Promise.resolve({
      data: this.row(),
      error: null
    });
  }

  maybeSingle() {
    return this.single();
  }

  private row() {
    if (this.table === "generation_jobs" && this.inserted) {
      return {
        id: "job-1",
        created_at: "2026-04-26T00:00:00.000Z",
        ended_at: null,
        error_code: null,
        output_artifact_id: null,
        provider_request_id: null,
        redacted_error: null,
        started_at: null,
        tombstoned_at: null,
        updated_at: "2026-04-26T00:00:00.000Z",
        ...this.inserted
      };
    }

    if (this.table === "generation_jobs" && this.updated) {
      return {
        id: "job-1",
        ...this.updated
      };
    }

    if (this.table === "media_assets") {
      return {
        id: "media-1",
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        ...this.inserted
      };
    }

    if (this.table === "storycam_artifacts") {
      return {
        id: "artifact-1",
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        stale_at: null,
        updated_at: "2026-04-26T00:00:00.000Z",
        ...this.inserted
      };
    }

    return this.inserted ?? this.updated;
  }
}
