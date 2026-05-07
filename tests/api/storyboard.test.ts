import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const createConfiguredStoryboardImageProviderMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

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

vi.mock("@/server/storycam/storyboardImageProviderFactory", () => ({
  createConfiguredStoryboardImageProvider: createConfiguredStoryboardImageProviderMock
}));

describe("POST /api/storyboard", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createConfiguredStoryboardImageProviderMock.mockReset();
    createConfiguredStoryboardImageProviderMock.mockReturnValue(undefined);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storycam.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.STORYCAM_TEXT_PROVIDER = "mock";
    process.env.STORYCAM_IMAGE_PROVIDER = "mock";
  });

  it("requires a confirmed story world before generating storyboard artifacts", async () => {
    const { POST } = await import("@/app/api/storyboard/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient({ artifactRows: storyWorldRows() }).asSupabaseClient());

    const response = await POST(
      jsonRequest({
        confirmedArtifactVersions: {},
        coreGroupTargetCount: 1,
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

  it("returns a request error for malformed JSON instead of a generic 500", async () => {
    const { POST } = await import("@/app/api/storyboard/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });

    const response = await POST(
      new Request("https://storycam.test/api/storyboard", {
        body: "{",
        headers: { "content-type": "application/json" },
        method: "POST"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_input",
      redactedError: "Invalid storyboard request.",
      redactionApplied: true
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("normalizes legacy multi-group requests to one MVP storyboard script and core group", async () => {
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
        coreGroupTargetCount: 3,
        sessionId: "session-1"
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      artifacts: {
        coreStoryboardGroups: [
          { state: "ready", type: "core_storyboard_group", version: 1 }
        ],
        storyboardScript: { state: "ready", type: "storyboard_script", version: 1 },
        storyboardScripts: [
          { state: "ready", type: "storyboard_script", version: 1 }
        ]
      },
      coreStoryboardGroups: [{}],
      durationPlan: {
        clipDurationTargets: [15],
        coreGroupTargetCount: 1,
        plannedDurationSeconds: 15
      },
      ok: true,
      sessionId: "session-1",
      storyboard: {
        coreStoryboardGroups: [
          expect.objectContaining({ title: "未发送的短信" })
        ],
        storyboardScript: expect.objectContaining({ planSummary: expect.stringContaining("雨夜") })
      }
    });

    const artifactInserts = client.queries
      .filter((query) => query.table === "storycam_artifacts")
      .flatMap((query) => query.calls)
      .filter((call) => call[0] === "insert");
    const sessionUpdate = client.queries.find((query) => query.table === "storycam_sessions" && query.calls.some((call) => call[0] === "update"));

    expect(artifactInserts).toHaveLength(2);
    expect(client.queries.some((query) => query.table === "generation_jobs")).toBe(false);
    expect(sessionUpdate?.calls).toContainEqual([
      "update",
      {
        core_group_target_count: 1,
        planned_duration_seconds: 15,
        status: "ready"
      }
    ]);
  });

  it("submits the representative storyboard image only after story-world asset images are ready", async () => {
    const { POST } = await import("@/app/api/storyboard/route");
    const client = new FakeSupabaseClient({ artifactRows: storyWorldRows(), mediaRows: assetImageRows() });

    createConfiguredStoryboardImageProviderMock.mockReturnValue(fakeAsyncImageProvider());
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(
      jsonRequest({
        confirmedArtifactVersions: {
          "character-artifact-1": 1,
          "scene-artifact-1": 1,
          "script-artifact-1": 1
        },
        sessionId: "session-1"
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      storyboard: {
        coreStoryboardGroups: [
          {
            representativeImage: { placeholder: true, status: "generating" }
          }
        ]
      }
    });
    expect(generationJobInserts(client)).toContainEqual(
      expect.objectContaining({
        input_artifact_versions_json: expect.objectContaining({
          "character-artifact-1": 1,
          "media:media-character-1": "media-character-1",
          "media:media-scene-1": "media-scene-1",
          "scene-artifact-1": 1,
          "script-artifact-1": 1
        }),
        type: "storyboard_image"
      })
    );
    expect(createConfiguredStoryboardImageProviderMock.mock.results[0]?.value.submitImageTask).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImages: [
          expect.objectContaining({ assetArtifactId: "character-artifact-1", mediaId: "media-character-1" }),
          expect.objectContaining({ assetArtifactId: "scene-artifact-1", mediaId: "media-scene-1" })
        ]
      })
    );
  });

  it("does not generate storyboard artifacts when reference-image provider is ready but asset images are missing", async () => {
    const { POST } = await import("@/app/api/storyboard/route");
    const client = new FakeSupabaseClient({ artifactRows: storyWorldRows() });

    createConfiguredStoryboardImageProviderMock.mockReturnValue(fakeAsyncImageProvider());
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(
      jsonRequest({
        confirmedArtifactVersions: {
          "character-artifact-1": 1,
          "scene-artifact-1": 1,
          "script-artifact-1": 1
        },
        sessionId: "session-1"
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "story_world_asset_images_not_ready",
      redactionApplied: true
    });
    expect(client.queries.some((query) => query.table === "generation_jobs")).toBe(false);
    expect(
      client.queries
        .filter((query) => query.table === "storycam_artifacts")
        .flatMap((query) => query.calls)
        .some((call) => call[0] === "insert")
    ).toBe(false);
  });

  it("does not submit the representative storyboard image job when reference signed urls are local", async () => {
    const { POST } = await import("@/app/api/storyboard/route");
    const client = new FakeSupabaseClient({
      artifactRows: storyWorldRows(),
      mediaRows: assetImageRows(),
      signedUrlBase: "http://127.0.0.1:54321/storage"
    });

    createConfiguredStoryboardImageProviderMock.mockReturnValue(fakeAsyncImageProvider());
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(
      jsonRequest({
        confirmedArtifactVersions: {
          "character-artifact-1": 1,
          "scene-artifact-1": 1,
          "script-artifact-1": 1
        },
        sessionId: "session-1"
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      storyboard: {
        coreStoryboardGroups: [
          {
            representativeImage: { placeholder: true, reason: "reference_images_unsupported", status: "placeholder" }
          }
        ]
      }
    });
    expect(generationJobInserts(client)).toHaveLength(0);
    expect(createConfiguredStoryboardImageProviderMock.mock.results[0]?.value.submitImageTask).not.toHaveBeenCalled();
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
  mediaRows?: unknown[];
  signedUrlBase?: string;
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly storage = {
    from: (bucket: string) => ({
      createSignedUrl: (path: string) =>
        Promise.resolve({
          data: { signedUrl: `${this.options.signedUrlBase ?? "https://storycam.test/storage"}/${bucket}/${path}` },
          error: null
        })
    })
  };
  private artifactInsertCount = 0;
  private generationJobInsertCount = 0;

  constructor(private readonly options: FakeSupabaseClientOptions = {}) {}

  asSupabaseClient() {
    return this;
  }

  nextArtifactId(type: unknown) {
    this.artifactInsertCount += 1;
    return `${type}-artifact-${this.artifactInsertCount}`;
  }

  nextGenerationJobId() {
    this.generationJobInsertCount += 1;
    return `job-${this.generationJobInsertCount}`;
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
  private eqFilters: Record<string, unknown> = {};

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
    this.eqFilters[column] = value;
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

  limit(value: number) {
    this.calls.push(["limit", value]);
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
          : this.table === "generation_jobs"
            ? null
            : this.table === "media_assets"
              ? this.findMediaRow()
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

    if (this.table === "generation_jobs") {
      return {
        attempts: 0,
        created_at: "2026-04-26T00:00:00.000Z",
        ended_at: null,
        error_code: null,
  provider_error_category: null,
  provider_http_status: null,
        id: this.client.nextGenerationJobId(),
        max_attempts: 1,
        provider_request_id: null,
        redacted_error: null,
        started_at: null,
        tombstoned_at: null,
        updated_at: "2026-04-26T00:00:00.000Z",
        ...this.inserted
      };
    }

    return this.inserted;
  }

  private findMediaRow() {
    const rows = this.options.mediaRows ?? [];

    return (
      rows.find(
        (row) =>
          (!this.eqFilters.session_id || (row as { session_id?: unknown }).session_id === this.eqFilters.session_id) &&
          (!this.eqFilters.linked_artifact_id ||
            (row as { linked_artifact_id?: unknown }).linked_artifact_id === this.eqFilters.linked_artifact_id) &&
          (!this.eqFilters.kind || (row as { kind?: unknown }).kind === this.eqFilters.kind)
      ) ?? null
    );
  }
}

function assetImageRows() {
  return [
    mediaRow("media-character-1", "character-artifact-1"),
    mediaRow("media-scene-1", "scene-artifact-1")
  ];
}

function mediaRow(id: string, linkedArtifactId: string) {
  return {
    byte_size: 128,
    created_at: "2026-04-26T00:00:00.000Z",
    deleted_at: null,
    id,
    kind: "thumbnail",
    linked_artifact_id: linkedArtifactId,
    mime_type: "image/png",
    session_id: "session-1",
    source: "provider",
    storage_bucket: "storycam-generated",
    storage_path: `users/user-1/sessions/session-1/generated/${id}.png`,
    user_id: "user-1"
  };
}

function fakeAsyncImageProvider() {
  return {
    generateImage: vi.fn(),
    providerKind: "image" as const,
    providerName: "test_image_provider",
    resolveImageTask: vi.fn(),
    supportsReferenceImages: true,
    submitImageTask: vi.fn().mockResolvedValue({
      ok: true,
      providerKind: "image",
      providerName: "test_image_provider",
      value: { providerRequestId: "provider-request-1" }
    })
  };
}

function generationJobInserts(client: FakeSupabaseClient) {
  return client.queries
    .filter((query) => query.table === "generation_jobs")
    .flatMap((query) => query.calls)
    .filter((call) => call[0] === "insert")
    .map((call) => call[1]);
}
