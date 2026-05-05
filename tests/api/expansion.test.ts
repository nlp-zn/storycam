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

describe("POST /api/storyboard-groups/:id/expand", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createConfiguredStoryboardImageProviderMock.mockReset();
    createConfiguredStoryboardImageProviderMock.mockReturnValue(undefined);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storycam.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.STORYCAM_IMAGE_PROVIDER = "mock";
  });

  it("creates eight expanded storyboard cards from the stored nine-frame script", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/expand/route");
    const client = new FakeSupabaseClient({ artifactRows: [coreGroupRow(), storyboardScriptRow()] });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(jsonRequest({ sessionId: "session-1" }), {
      params: Promise.resolve({ id: "core-artifact-1" })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      expansionCards: [
        { canvasPosition: "top-left", frameNumber: 2, imagePrompt: expect.stringContaining("frame 2"), sortOrder: 0, title: "扩展分镜 1" },
        { canvasPosition: "top", frameNumber: 3, sortOrder: 1, title: "扩展分镜 2" },
        { canvasPosition: "top-right", frameNumber: 4, sortOrder: 2, title: "扩展分镜 3" },
        { frameNumber: 5, sortOrder: 3 },
        { frameNumber: 6, sortOrder: 4 },
        { frameNumber: 7, sortOrder: 5 },
        { frameNumber: 8, sortOrder: 6 },
        { canvasPosition: "bottom-right", frameNumber: 9, sortOrder: 7 }
      ],
      expandedStoryboardCards: [
        { parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
        { parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
        { parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
        { parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
        { parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
        { parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
        { parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 },
        { parentArtifactId: "core-artifact-1", state: "ready", type: "expanded_storyboard_card", version: 1 }
      ],
      expandedStoryboardImages: [
        { placeholder: true, status: "placeholder" },
        { placeholder: true, status: "placeholder" },
        { placeholder: true, status: "placeholder" },
        { placeholder: true, status: "placeholder" },
        { placeholder: true, status: "placeholder" },
        { placeholder: true, status: "placeholder" },
        { placeholder: true, status: "placeholder" },
        { placeholder: true, status: "placeholder" }
      ],
      ok: true,
      sessionId: "session-1"
    });

    const artifactInserts = client.queries
      .filter((query) => query.table === "storycam_artifacts")
      .flatMap((query) => query.calls)
      .filter((call) => call[0] === "insert");

    expect(artifactInserts).toHaveLength(8);
    expect(client.queries.some((query) => query.table === "generation_jobs")).toBe(false);
  });

  it("caps requested expanded storyboard cards at eight", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/expand/route");
    const client = new FakeSupabaseClient({ artifactRows: [coreGroupRow(), storyboardScriptRow()] });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(jsonRequest({ sessionId: "session-1", targetCount: 20 }), {
      params: { id: "core-artifact-1" }
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.expansionCards).toHaveLength(8);
    expect(body.expandedStoryboardCards).toHaveLength(8);
    expect(client.queries.some((query) => query.table === "generation_jobs")).toBe(false);
  });

  it("reuses existing expanded storyboard cards instead of duplicating them", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/expand/route");
    const client = new FakeSupabaseClient({
      artifactRows: [coreGroupRow(), storyboardScriptRow(), ...storyboardFrames().slice(1).map((frame) => expandedCardRow(frame))]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(jsonRequest({ sessionId: "session-1" }), {
      params: { id: "core-artifact-1" }
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.expansionCards).toHaveLength(8);
    expect(
      client.queries
        .filter((query) => query.table === "storycam_artifacts")
        .flatMap((query) => query.calls)
        .filter((call) => call[0] === "insert")
    ).toHaveLength(0);
  });

  it("rejects missing core groups", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/expand/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient({ artifactRows: [] }).asSupabaseClient());

    const response = await POST(jsonRequest({ sessionId: "session-1" }), {
      params: { id: "missing-core" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "core_group_not_found",
      redactedError: "Invalid expansion request.",
      redactionApplied: true
    });
  });

  it("regenerates the center frame image as a storyboard image job", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/frames/[frameNumber]/regenerate-image/route");
    const client = new FakeSupabaseClient({ artifactRows: [coreGroupRow(), storyboardScriptRow()] });

    createConfiguredStoryboardImageProviderMock.mockReturnValue(fakeAsyncImageProvider());
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(jsonRequest({ sessionId: "session-1" }), {
      params: { frameNumber: "1", id: "core-artifact-1" }
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      frameNumber: 1,
      image: { placeholder: true, status: "generating" },
      ok: true
    });
    expect(generationJobInserts(client)).toContainEqual(
      expect.objectContaining({
        output_artifact_id: "core-artifact-1",
        type: "storyboard_image"
      })
    );
  });

  it("regenerates an expanded frame image from its stored frame prompt", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/frames/[frameNumber]/regenerate-image/route");
    const client = new FakeSupabaseClient({ artifactRows: [coreGroupRow(), storyboardScriptRow()] });

    createConfiguredStoryboardImageProviderMock.mockReturnValue(fakeAsyncImageProvider());
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(jsonRequest({ sessionId: "session-1" }), {
      params: { frameNumber: "5", id: "core-artifact-1" }
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      frameNumber: 5,
      image: { placeholder: true, status: "generating" },
      ok: true
    });
    expect(generationJobInserts(client)).toContainEqual(
      expect.objectContaining({
        type: "expanded_storyboard_image"
      })
    );
    expect(createConfiguredStoryboardImageProviderMock.mock.results[0]?.value.submitImageTask).toHaveBeenCalledWith(
      expect.objectContaining({
        imagePrompt: expect.stringContaining("frame 5"),
        sortOrder: 3
      })
    );
  });
});

function jsonRequest(body: unknown) {
  return new Request("https://storycam.test/api/storyboard-groups/core-artifact-1/expand", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

function coreGroupRow() {
  return {
    created_at: "2026-04-26T00:00:00.000Z",
    data_json: {
      characterAssetIds: ["character-artifact-1"],
      emotionalTurn: "Almost says the truth.",
      estimatedClipDurationSeconds: 4.7,
      expandedCardIds: [],
      id: "core-group-rainy-kdrama-1",
      sceneAssetId: "scene-artifact-1",
      sessionId: "session-1",
      state: "ready",
      storyPurpose: "Hold the private feeling before the confession disappears.",
      title: "Unsent Message",
      version: 1
    },
    deleted_at: null,
    depends_on_json: {
      "character-artifact-1": 1,
      "scene-artifact-1": 1,
      "script-artifact-1": 1
    },
    id: "core-artifact-1",
    parent_artifact_id: null,
    session_id: "session-1",
    stale_at: null,
    state: "ready",
    type: "core_storyboard_group",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    version: 1
  };
}

function storyboardScriptRow() {
  return {
    created_at: "2026-04-26T00:00:00.000Z",
    data_json: {
      frames: storyboardFrames(),
      id: "storyboard-script-1",
      mainImagePrompt: "Cinematic storyboard still frame 1, no text.",
      planSummary: "Use a nine-frame private rainy-night storyboard.",
      plannedDurationSeconds: 15,
      rhythm: "Center first, then surrounding action-reaction frames.",
      sessionId: "session-1",
      state: "ready",
      tone: "Rainy, restrained, cinematic",
      version: 1
    },
    deleted_at: null,
    depends_on_json: {
      "core-artifact-1": 1
    },
    id: "storyboard-script-artifact-1",
    parent_artifact_id: "core-artifact-1",
    session_id: "session-1",
    stale_at: null,
    state: "ready",
    type: "storyboard_script",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    version: 1
  };
}

function expandedCardRow(frame: ReturnType<typeof storyboardFrames>[number]) {
  return {
    created_at: "2026-04-26T00:00:00.000Z",
    data_json: {
      beatType: frame.beatType === "core" ? "action" : frame.beatType,
      canvasPosition: frame.canvasPosition,
      coreGroupId: "core-group-rainy-kdrama-1",
      description: frame.visualContent,
      frameNumber: frame.frameNumber,
      guidance: `${frame.narrativePurpose} ${frame.technicalNotes}`,
      id: `core-group-rainy-kdrama-1-frame-${frame.frameNumber}`,
      imagePrompt: frame.imagePrompt,
      sessionId: "session-1",
      sortOrder: frame.frameNumber - 2,
      state: "ready",
      title: frame.title,
      version: 1
    },
    deleted_at: null,
    depends_on_json: {
      "core-artifact-1": 1,
      "storyboard-script-artifact-1": 1
    },
    id: `expanded-artifact-${frame.frameNumber}`,
    parent_artifact_id: "core-artifact-1",
    session_id: "session-1",
    stale_at: null,
    state: "ready",
    type: "expanded_storyboard_card",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    version: 1
  };
}

function storyboardFrames() {
  const positions = ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"];
  const beatTypes = ["core", "enter", "action", "reaction", "atmosphere", "transition", "emotion", "continuation", "reaction"];

  return positions.map((canvasPosition, index) => ({
    beatType: beatTypes[index],
    cameraAngle: index === 0 ? "平视" : "微俯拍",
    canvasPosition,
    durationSeconds: index === 0 ? 3 : 1.5,
    frameNumber: index + 1,
    imagePrompt: `Cinematic storyboard still frame ${index + 1}, rainy convenience store, ordinary people, no text.`,
    narrativePurpose: index === 0 ? "Set the center frame." : "Support the center frame with a visible action or reaction.",
    scene: "Rainy convenience-store corner",
    shotSize: index === 0 ? "中景" : "近景",
    sound: "Rain and small footsteps",
    technicalNotes: "Keep character, wardrobe, props, location, and lighting consistent.",
    timeRange: `00:${String(index).padStart(2, "0")}-00:${String(index + 1).padStart(2, "0")}`,
    title: index === 0 ? "中心主图" : `扩展分镜 ${index}`,
    visualContent: index === 0 ? "Main rainy convenience-store frame." : `Visible action for surrounding frame ${index}.`
  }));
}

type FakeSupabaseClientOptions = {
  artifactRows?: unknown[];
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
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
      data: this.table === "storycam_artifacts" ? (this.options.artifactRows ?? []) : [],
      error: null
    }).then(resolve, reject);
  }

  private row() {
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
}

function fakeAsyncImageProvider() {
  return {
    generateImage: vi.fn(),
    providerKind: "image" as const,
    providerName: "test_image_provider",
    resolveImageTask: vi.fn(),
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
