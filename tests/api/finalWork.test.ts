import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const composeMock = vi.hoisted(() =>
  vi.fn(async (input: { clips: Array<{ bytes: Uint8Array; durationSeconds: number }> }) => ({
    ok: true as const,
    providerKind: "stitch" as const,
    providerName: "ffmpeg",
    value: {
      bytes: new TextEncoder().encode(`final:${input.clips.length}`),
      durationSeconds: input.clips.reduce((sum, clip) => sum + clip.durationSeconds, 0)
    }
  }))
);

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

vi.mock("@/lib/providers/finalWork/ffmpegComposer", () => ({
  createFfmpegFinalWorkComposer: () => ({
    compose: composeMock,
    providerKind: "stitch",
    providerName: "ffmpeg"
  })
}));

describe("final work API routes", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    composeMock.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storycam.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.STORYCAM_GENERATION_MODE = "mock";
    process.env.STORYCAM_TEXT_PROVIDER = "mock";
    process.env.STORYCAM_IMAGE_PROVIDER = "mock";
    process.env.STORYCAM_VIDEO_PROVIDER = "mock";
    process.env.STORYCAM_FINAL_WORK_PROVIDER = "mock";
    process.env.STORYCAM_MULTIMODAL_PROVIDER = "mock";
    delete process.env.STORYCAM_STORY_WORLD_TEXT_PROVIDER;
    delete process.env.STORYCAM_STORYBOARD_TEXT_PROVIDER;
  });

  it("creates a stitch suggestion when a generated clip is ready for final confirmation", async () => {
    const { POST } = await import("@/app/api/stitch-suggestion/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    const client = new FakeSupabaseClient({ artifactRows: [generatedClipArtifact({ reviewState: "pending" })] });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(jsonRequest("https://storycam.test/api/stitch-suggestion", {
      generatedClipArtifactIds: ["generated-clip-artifact-1"],
      sessionId: "session-1"
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      stitchSuggestion: {
        state: "ready",
        type: "stitch_suggestion"
      }
    });
  });

  it("creates a stitch suggestion for confirmed generated clips", async () => {
    const { POST } = await import("@/app/api/stitch-suggestion/route");
    const client = new FakeSupabaseClient({ artifactRows: [generatedClipArtifact()] });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(jsonRequest("https://storycam.test/api/stitch-suggestion", {
      generatedClipArtifactIds: ["generated-clip-artifact-1"],
      sessionId: "session-1"
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      stitchSuggestion: {
        id: "stitch_suggestion-artifact-1",
        state: "ready",
        type: "stitch_suggestion",
        version: 1
      }
    });
    expect(client.queries.some((query) => query.table === "generation_jobs")).toBe(false);
  });

  it("creates a durable final work job from one confirmed clip without composing in the request", async () => {
    const { POST } = await import("@/app/api/final-work/route");
    const client = new FakeSupabaseClient({
      artifactRows: [stitchSuggestionArtifact(), generatedClipArtifact()],
      mediaRows: [clipMediaRow()]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(jsonRequest("https://storycam.test/api/final-work", {
      idempotencyKey: "final-work-secret",
      sessionId: "session-1",
      stitchSuggestionArtifactId: "stitch-suggestion-artifact-1"
    }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      job: {
        jobId: "job-1",
        providerName: "ffmpeg",
        status: "queued"
      },
      ok: true,
      providerName: "ffmpeg",
      status: "queued"
    });
    expect(JSON.stringify(body)).not.toContain("final-work-secret");
    expect(JSON.stringify(body)).not.toContain("share");
    expect(composeMock).not.toHaveBeenCalled();
    expect(client.uploads).toEqual([]);
    expect(
      client.queries
        .filter((query) => query.table === "generation_jobs")
        .flatMap((query) => query.calls)
        .find((call) => call[0] === "insert")?.[1]
    ).toMatchObject({
      input_artifact_versions_json: {
        "generated-clip-artifact-1": 1,
        "stitch-suggestion-artifact-1": 1
      },
      provider_kind: "stitch",
      provider_name: "ffmpeg",
      status: "queued",
      type: "final_work"
    });
  });

  it("downloads a final work MP4 through an account-scoped attachment route", async () => {
    const { GET } = await import("@/app/api/storycam-media/[id]/download/route");
    const client = new FakeSupabaseClient({
      mediaRows: [finalWorkMediaRow()]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/storycam-media/media-final-1/download"), {
      params: { id: "media-final-1" }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="storycam-final-work.mp4"');
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response.arrayBuffer()).resolves.toEqual(new TextEncoder().encode("clip-bytes").buffer);
    expect(client.queries[0]?.calls).toEqual([
      ["select", expect.any(String)],
      ["eq", "user_id", "user-1"],
      ["eq", "id", "media-final-1"],
      ["is", "deleted_at", null]
    ]);
  });

  it("requires authentication for the final work MP4 attachment route", async () => {
    const { GET } = await import("@/app/api/storycam-media/[id]/download/route");
    const { UnauthorizedError } = await import("@/server/auth/requireUser");

    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await GET(new Request("https://storycam.test/api/storycam-media/media-final-1/download"), {
      params: { id: "media-final-1" }
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects blank media ids on the final work MP4 attachment route", async () => {
    const { GET } = await import("@/app/api/storycam-media/[id]/download/route");
    const client = new FakeSupabaseClient({
      mediaRows: [finalWorkMediaRow()]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/storycam-media/%20/download"), {
      params: { id: " " }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_media_id",
      redactedError: "StoryCam media was not found.",
      redactionApplied: true
    });
  });

  it("does not download non-final-work media from the attachment route", async () => {
    const { GET } = await import("@/app/api/storycam-media/[id]/download/route");
    const client = new FakeSupabaseClient({
      mediaRows: [clipMediaRow()]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/storycam-media/media-clip-1/download"), {
      params: { id: "media-clip-1" }
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "media_not_found",
      redactedError: "StoryCam media was not found.",
      redactionApplied: true
    });
  });

  it("redacts storage failures from the final work MP4 attachment route", async () => {
    const { GET } = await import("@/app/api/storycam-media/[id]/download/route");
    const client = new FakeSupabaseClient({
      downloadError: true,
      mediaRows: [finalWorkMediaRow()]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/storycam-media/media-final-1/download"), {
      params: { id: "media-final-1" }
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "download_failed",
      redactedError: "StoryCam media download failed.",
      redactionApplied: true
    });
  });
});

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

function generatedClipArtifact(overrides: { reviewState?: "accepted" | "pending" | "retry_requested" } = {}) {
  return {
    ...baseArtifactRow(),
    data_json: {
      clipPromptPacketId: "packet-1",
      coreGroupId: "core-artifact-1",
      durationSeconds: 4,
      id: "generated-clip-1",
      jobId: "job-1",
      mediaAssetId: "media-clip-1",
      providerName: "mock",
      reviewState: overrides.reviewState ?? "accepted",
      sessionId: "session-1",
      state: "ready",
      version: 1
    },
    id: "generated-clip-artifact-1",
    type: "generated_clip"
  };
}

function stitchSuggestionArtifact() {
  return {
    ...baseArtifactRow(),
    data_json: {
      generatedClipArtifactIds: ["generated-clip-artifact-1"],
      generatedClipIds: ["generated-clip-1"],
      id: "stitch-suggestion-1",
      recommendation: "Render one private final work.",
      sessionId: "session-1",
      state: "ready",
      version: 1
    },
    id: "stitch-suggestion-artifact-1",
    type: "stitch_suggestion"
  };
}

function clipMediaRow() {
  return {
    byte_size: 10,
    created_at: "2026-04-26T00:00:00.000Z",
    deleted_at: null,
    id: "media-clip-1",
    kind: "mock_clip",
    linked_artifact_id: "generated-clip-artifact-1",
    mime_type: "video/mp4",
    session_id: "session-1",
    source: "mock",
    storage_bucket: "storycam-mock",
    storage_path: "users/user-1/sessions/session-1/mock/clips/clip.mp4",
    user_id: "user-1"
  };
}

function finalWorkMediaRow() {
  return {
    byte_size: 12,
    created_at: "2026-04-26T00:00:00.000Z",
    deleted_at: null,
    id: "media-final-1",
    kind: "final_work",
    linked_artifact_id: "final-work-artifact-1",
    mime_type: "video/mp4",
    session_id: "session-1",
    source: "composer",
    storage_bucket: "storycam-generated",
    storage_path: "users/user-1/sessions/session-1/generated/final/final.mp4",
    user_id: "user-1"
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
    type: "generated_clip",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    version: 1
  };
}

type FakeSupabaseClientOptions = {
  artifactRows?: unknown[];
  downloadError?: boolean;
  mediaRows?: unknown[];
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly signedUrls: Array<{ bucket: string; expiresIn: number; path: string }> = [];
  readonly uploads: Array<{ bucket: string; byteSize: number; contentType: string; path: string; upsert: boolean }> = [];

  constructor(private readonly options: FakeSupabaseClientOptions = {}) {}

  asSupabaseClient() {
    return this;
  }

  readonly storage = {
    from: (bucket: string) => ({
      createSignedUrl: (path: string, expiresIn: number) => {
        this.signedUrls.push({ bucket, expiresIn, path });

        return Promise.resolve({
          data: { signedUrl: `https://storycam.test/storage/${bucket}/${path}` },
          error: null
        });
      },
      download: (path: string) =>
        Promise.resolve({
          data: this.options.downloadError ? null : new Blob([new TextEncoder().encode("clip-bytes")]),
          error: this.options.downloadError || !path ? { message: "missing path" } : null
        }),
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
    const query = new FakeQuery(table, this.options);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];
  private readonly filters: Array<[string, unknown]> = [];
  private inserted: Record<string, unknown> | null = null;

  constructor(
    readonly table: string,
    private readonly options: FakeSupabaseClientOptions
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
    this.filters.push([column, value]);
    return this;
  }

  is(column: string, value: unknown) {
    this.calls.push(["is", column, value]);
    this.filters.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.calls.push(["in", column, values]);
    return this;
  }

  gte(column: string, value: unknown) {
    this.calls.push(["gte", column, value]);
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
          : this.table === "media_assets"
            ? (this.listRows()[0] ?? null)
          : null,
      error: null
    });
  }

  then(resolve: (value: { data: unknown; error: null }) => void, reject?: (reason: unknown) => void) {
    return Promise.resolve({
      data: this.listRows(),
      error: null
    }).then(resolve, reject);
  }

  private listRows() {
    if (this.table === "storycam_artifacts") {
      return this.options.artifactRows ?? [];
    }

    if (this.table === "media_assets") {
      return (this.options.mediaRows ?? []).filter((row) =>
        this.filters.every(([column, value]) => (row as Record<string, unknown>)[column] === value)
      );
    }

    return [];
  }

  private row() {
    if (this.table === "generation_jobs") {
      return {
        attempts: 0,
        created_at: "2026-04-26T00:00:00.000Z",
        ended_at: null,
        error_code: null,
        generation_mode: "mock",
        id: "job-1",
        idempotency_key_hash: "hash-1",
        input_artifact_versions_json: {},
        locked_at: null,
        locked_by: null,
        max_attempts: 1,
        output_artifact_id: null,
        provider_error_category: null,
        provider_http_status: null,
        provider_kind: "stitch",
        provider_name: "ffmpeg",
        provider_request_id: null,
        redacted_error: null,
        run_after: "2026-04-26T00:00:00.000Z",
        session_id: "session-1",
        started_at: null,
        status: "queued",
        tombstoned_at: null,
        type: "final_work",
        updated_at: "2026-04-26T00:00:00.000Z",
        user_id: "user-1",
        ...this.inserted
      };
    }

    if (this.table === "media_assets") {
      return {
        byte_size: 7,
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        id: "media-final-1",
        linked_artifact_id: null,
        storage_path: "users/user-1/sessions/session-1/generated/final/final.mp4",
        ...this.inserted
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
