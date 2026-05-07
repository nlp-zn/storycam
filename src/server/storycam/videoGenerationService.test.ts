import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FfmpegComposerInput, FfmpegComposerOutput } from "@/lib/providers/finalWork/ffmpegComposer";
import { providerSuccess } from "@/lib/providers/providerErrors";
import type { FinalWorkComposer } from "@/lib/providers/types";
import type { Database } from "@/server/db/types";
import { composeAndStoreFinalWork, createPrivateFinalWorkPreviewUrl } from "./finalWorkService";
import { storeProviderGeneratedClip } from "./videoGenerationService";

const seedanceClipBytes = new Uint8Array([0, 1, 2, 3, 4]);

describe("storeProviderGeneratedClip", () => {
  it("downloads a Seedance video URL, stores the clip privately, writes metadata, and completes the job", async () => {
    const client = new FakeSupabaseClient();
    const fetch = vi.fn().mockResolvedValue(videoResponse(seedanceClipBytes));

    const result = await storeProviderGeneratedClip(client.asSupabaseClient(), {
      clipPromptPacketId: "packet-1",
      coreGroupId: "core-group-1",
      durationSeconds: 5,
      fetch,
      inputArtifactVersions: { "packet-1": 1 },
      jobId: "job-1",
      providerName: "seedance_2_0",
      providerRequestId: "cgt-2026-storycam",
      sessionId: "session-1",
      userId: "user-1",
      videoUrl: "https://ark-content.example/clip.mp4"
    });

    expect(fetch).toHaveBeenCalledWith("https://ark-content.example/clip.mp4");
    expect(result).toMatchObject({
      ok: true,
      providerKind: "video",
      providerName: "seedance_2_0",
      providerRequestId: "cgt-2026-storycam"
    });
    expect(result.ok && result.value.generatedClip).toMatchObject({
      clipPromptPacketId: "packet-1",
      coreGroupId: "core-group-1",
      durationSeconds: 5,
      mediaAssetId: expect.stringMatching(/^media-/),
      providerName: "seedance_2_0",
      reviewState: "pending"
    });
    expect(client.uploads[0]).toMatchObject({
      bucket: "storycam-generated",
      body: seedanceClipBytes,
      contentType: "video/mp4",
      path: expect.stringMatching(/^users\/user-1\/sessions\/session-1\/generated\/clips\/.+\.mp4$/),
      upsert: false
    });
    expect(client.queries[1]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        kind: "generated_clip",
        mime_type: "video/mp4",
        source: "provider",
        storage_bucket: "storycam-generated",
        user_id: "user-1"
      })
    ]);
    expect(client.queries[2]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        state: "ready",
        type: "generated_clip",
        user_id: "user-1"
      })
    ]);
    expect(client.queries[3]?.calls).toContainEqual([
      "update",
      expect.objectContaining({
        output_artifact_id: expect.stringMatching(/^artifact-/),
        status: "succeeded"
      })
    ]);
    expect(JSON.stringify(result)).not.toContain("https://ark-content.example/clip.mp4");
  });

  it("keeps provider download failures redacted and retryable without storage writes", async () => {
    const client = new FakeSupabaseClient();
    const fetch = vi.fn().mockResolvedValue(videoResponse(new Uint8Array(), 403));

    const result = await storeProviderGeneratedClip(client.asSupabaseClient(), {
      clipPromptPacketId: "packet-1",
      coreGroupId: "core-group-1",
      durationSeconds: 5,
      fetch,
      jobId: "job-1",
      providerName: "seedance_2_0",
      providerRequestId: "cgt-2026-storycam",
      sessionId: "session-1",
      userId: "user-1",
      videoUrl: "https://ark-content.example/signed-secret.mp4"
    });

    expect(result).toMatchObject({
      errorCode: "SEEDANCE_CLIP_STORE_FAILED",
      ok: false,
      providerRequestId: "cgt-2026-storycam",
      redactionApplied: true,
      retryable: true
    });
    expect(client.uploads).toEqual([]);
    expect(client.queries).toHaveLength(1);
    expect(client.queries[0]?.table).toBe("generation_jobs");
    expect(JSON.stringify(result)).not.toContain("signed-secret");
  });

  it("discards late Seedance results for tombstoned jobs before download or storage writes", async () => {
    const client = new FakeSupabaseClient({
      jobRow: {
        ...baseJobRow(),
        status: "canceled",
        tombstoned_at: "2026-04-26T01:02:03.000Z"
      }
    });
    const fetch = vi.fn();

    const result = await storeProviderGeneratedClip(client.asSupabaseClient(), {
      clipPromptPacketId: "packet-1",
      coreGroupId: "core-group-1",
      durationSeconds: 5,
      fetch,
      jobId: "job-1",
      providerName: "seedance_2_0",
      providerRequestId: "cgt-2026-storycam",
      sessionId: "session-1",
      userId: "user-1",
      videoUrl: "https://ark-content.example/late-result.mp4"
    });

    expect(result).toMatchObject({
      errorCode: "SEEDANCE_LATE_RESULT_DISCARDED",
      ok: false,
      providerRequestId: "cgt-2026-storycam",
      retryable: false
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(client.uploads).toEqual([]);
    expect(client.queries.some((query) => query.table === "media_assets")).toBe(false);
    expect(client.queries.some((query) => query.table === "storycam_artifacts")).toBe(false);
  });

  it("supports a real clip to final work smoke path with a private preview URL and no share link", async () => {
    const client = new FakeSupabaseClient();
    const clipResult = await storeProviderGeneratedClip(client.asSupabaseClient(), {
      clipPromptPacketId: "packet-1",
      coreGroupId: "core-group-1",
      durationSeconds: 5,
      fetch: vi.fn().mockResolvedValue(videoResponse(seedanceClipBytes)),
      inputArtifactVersions: { "packet-1": 1 },
      jobId: "job-1",
      providerName: "seedance_2_0",
      providerRequestId: "cgt-2026-storycam",
      reviewState: "accepted",
      sessionId: "session-1",
      userId: "user-1",
      videoUrl: "https://ark-content.example/clip.mp4"
    });

    expect(clipResult.ok).toBe(true);

    if (!clipResult.ok) {
      throw new Error("Expected stored clip.");
    }

    const finalWork = await composeAndStoreFinalWork(client.asSupabaseClient(), successComposer(), {
      clips: [
        {
          bytes: seedanceClipBytes,
          durationSeconds: clipResult.value.generatedClip.durationSeconds,
          generatedClipId: clipResult.value.generatedClip.id
        }
      ],
      inputArtifactVersions: { [clipResult.value.artifact.id]: clipResult.value.artifact.version },
      sessionId: "session-1",
      userId: "user-1"
    });

    expect(finalWork).toMatchObject({
      ok: true,
      providerKind: "stitch",
      providerName: "ffmpeg"
    });
    expect(finalWork.ok && finalWork.value.media).toMatchObject({
      bucket: "storycam-generated",
      mimeType: "video/mp4"
    });

    if (!finalWork.ok) {
      throw new Error("Expected final work.");
    }

    const preview = await createPrivateFinalWorkPreviewUrl(client.asSupabaseClient(), {
      expiresIn: 60,
      media: finalWork.value.media
    });

    expect(preview).toEqual({
      signedUrl: "https://signed.example/final-work.mp4",
      signedUrlExpiresIn: 60
    });
    expect(JSON.stringify(finalWork.value)).not.toContain("share");
    expect(JSON.stringify(finalWork.value)).not.toContain("publicUrl");
  });
});

function successComposer(): FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput> {
  return {
    providerKind: "stitch",
    providerName: "ffmpeg",
    async compose(input) {
      return providerSuccess(this, {
        bytes: new TextEncoder().encode(`final:${input.clips.length}`),
        durationSeconds: input.clips.reduce((sum, clip) => sum + clip.durationSeconds, 0)
      });
    }
  };
}

function videoResponse(bytes: Uint8Array, status = 200) {
  return new Response(new Blob([bytes as BlobPart]), {
    headers: {
      "content-type": "video/mp4"
    },
    status
  });
}

type FakeSupabaseClientOptions = {
  jobRow?: Record<string, unknown> | null;
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly signedUrls: Array<{ bucket: string; expiresIn: number; path: string }> = [];
  readonly uploads: Array<{ bucket: string; body: Uint8Array; byteSize: number; contentType: string; path: string; upsert: boolean }> = [];

  constructor(private readonly options: FakeSupabaseClientOptions = {}) {}

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  readonly storage = {
    from: (bucket: string) => ({
      createSignedUrl: (path: string, expiresIn: number) => {
        this.signedUrls.push({ bucket, expiresIn, path });
        return Promise.resolve({
          data: { signedUrl: "https://signed.example/final-work.mp4" },
          error: null
        });
      },
      upload: (path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }) => {
        this.uploads.push({
          bucket,
          body,
          byteSize: body.byteLength,
          contentType: options.contentType,
          path,
          upsert: options.upsert
        });
        return Promise.resolve({
          data: { path },
          error: null
        });
      }
    })
  };

  from(table: string) {
    const query = new FakeQuery(table, this.options);
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
    private readonly options: FakeSupabaseClientOptions
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

  maybeSingle() {
    return Promise.resolve({
      data: this.row(),
      error: null
    });
  }

  single() {
    return Promise.resolve({
      data: this.row(),
      error: null
    });
  }

  private row() {
    if (this.table === "media_assets") {
      return {
        id: `media-${this.calls.length}`,
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        ...this.inserted
      };
    }

    if (this.table === "storycam_artifacts") {
      return {
        id: `artifact-${this.calls.length}`,
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        stale_at: null,
        updated_at: "2026-04-26T00:00:00.000Z",
        ...this.inserted
      };
    }

    if (this.table === "generation_jobs") {
      if (!this.updated && this.options.jobRow !== undefined) {
        return this.options.jobRow;
      }

      return {
        id: "job-1",
        created_at: "2026-04-26T00:00:00.000Z",
        ended_at: "2026-04-26T00:01:00.000Z",
        status: this.updated ? "succeeded" : "running",
        tombstoned_at: null,
        updated_at: "2026-04-26T00:01:00.000Z",
        ...this.updated
      };
    }

    return this.inserted ?? this.updated;
  }
}

function baseJobRow() {
  return {
    attempts: 1,
    created_at: "2026-04-26T00:00:00.000Z",
    ended_at: null,
    error_code: null,
  provider_error_category: null,
  provider_http_status: null,
    generation_mode: "real",
    id: "job-1",
    idempotency_key_hash: "hash-1",
    input_artifact_versions_json: {},
    max_attempts: 1,
    output_artifact_id: null,
    provider_kind: "video",
    provider_name: "seedance_2_0",
    provider_request_id: "cgt-2026-storycam",
    redacted_error: null,
    session_id: "session-1",
    started_at: null,
    status: "running",
    tombstoned_at: null,
    type: "video_clip",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1"
  };
}
