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

  it("creates a private final work file from one confirmed clip without sharing links", async () => {
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

    expect(response.status).toBe(201);
    expect(body).toEqual({
      finalWork: {
        id: "final_work-artifact-1",
        state: "ready",
        type: "final_work",
        version: 1
      },
      media: {
        byteSize: 7,
        id: "media-final-1",
        kind: "final_work",
        mimeType: "video/mp4"
      },
      ok: true,
      preview: {
        durationSeconds: 4,
        mimeType: "video/mp4",
        signedUrl: expect.stringContaining("https://storycam.test/storage/storycam-generated/users/user-1/sessions/session-1/generated/final/"),
        signedUrlExpiresIn: 300
      }
    });
    expect(JSON.stringify(body)).not.toContain("storage_path");
    expect(JSON.stringify(body)).not.toContain("share");
    expect(composeMock).toHaveBeenCalledWith({
      clips: [
        {
          bytes: new TextEncoder().encode("clip-bytes"),
          durationSeconds: 4,
          generatedClipId: "generated-clip-1"
        }
      ]
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
          data: new Blob([new TextEncoder().encode("clip-bytes")]),
          error: path ? null : { message: "missing path" }
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
      data: this.listRows(),
      error: null
    }).then(resolve, reject);
  }

  private listRows() {
    if (this.table === "storycam_artifacts") {
      return this.options.artifactRows ?? [];
    }

    if (this.table === "media_assets") {
      return this.options.mediaRows ?? [];
    }

    return [];
  }

  private row() {
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
