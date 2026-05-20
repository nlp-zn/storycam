import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const createConfiguredStoryboardImageProviderMock = vi.hoisted(() => vi.fn());
const createConfiguredStoryWorldAssetImageProviderMock = vi.hoisted(() => vi.fn());
const createConfiguredVideoProvidersMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/server/storycam/storyWorldAssetImageProviderFactory", () => ({
  createConfiguredStoryWorldAssetImageProvider: createConfiguredStoryWorldAssetImageProviderMock
}));

vi.mock("@/server/storycam/videoProviderFactory", () => ({
  createConfiguredVideoProviders: createConfiguredVideoProvidersMock
}));

describe("generation job API routes", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createConfiguredStoryboardImageProviderMock.mockReset();
    createConfiguredStoryWorldAssetImageProviderMock.mockReset();
    createConfiguredVideoProvidersMock.mockReset();
    createConfiguredStoryboardImageProviderMock.mockReturnValue(undefined);
    createConfiguredStoryWorldAssetImageProviderMock.mockReturnValue(undefined);
    createConfiguredVideoProvidersMock.mockReturnValue({});
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storycam.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.STORYCAM_IMAGE_PROVIDER = "mock";
    process.env.STORYCAM_TEXT_PROVIDER = "mock";
    process.env.STORYCAM_VIDEO_PROVIDER = "mock";
    process.env.STORYCAM_GENERATION_MODE = "mock";
    process.env.STORYCAM_MULTIMODAL_PROVIDER = "mock";
    process.env.STORYCAM_FINAL_WORK_PROVIDER = "mock";
    delete process.env.STORYCAM_STORY_WORLD_TEXT_PROVIDER;
    delete process.env.STORYCAM_STORYBOARD_TEXT_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_TEXT_MODEL;
    delete process.env.OPENROUTER_MULTIMODAL_MODEL;
    delete process.env.INFERENCE_API_KEY;
    delete process.env.INFERENCE_IMAGE_APP;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.SEEDANCE_MODEL;
  });

  it("creates a video generation job for a confirmed core storyboard group", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/generate-clip/route");
    const client = new FakeSupabaseClient({
      artifactRows: [coreGroupRow(), storyboardScriptRow(), ...expandedCardRows()],
      mediaRows: [mediaRow("media-core-1", "core-artifact-1"), ...expandedMediaRows()]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(generateClipRequest(), {
      params: Promise.resolve({ id: "core-artifact-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      confirmationSummary: expect.stringContaining("Unsent Message"),
      jobId: "job-1",
      ok: true,
      outputArtifactId: "generated_clip-artifact-2",
      status: "succeeded"
    });
    expect(JSON.stringify(body)).not.toContain("idempotency-secret");
    expect(JSON.stringify(body)).not.toContain("redactedPromptSummary");

    const jobInsert = client.queries
      .filter((query) => query.table === "generation_jobs")
      .flatMap((query) => query.calls)
      .find((call) => call[0] === "insert")?.[1];

    expect(jobInsert).toMatchObject({
      input_artifact_versions_json: expect.objectContaining({
        "clip_prompt_packet-artifact-1": 1,
        "core-artifact-1": 1,
        "expanded-artifact-1": 1,
        "storyboard-script-artifact-1": 1
      }),
      provider_kind: "video",
      provider_name: "mock",
      status: "running",
      type: "video_clip"
    });
    const packetInsert = client.queries
      .filter((query) => query.table === "storycam_artifacts")
      .flatMap((query) => query.calls)
      .find((call) => call[0] === "insert" && (call[1] as { type?: unknown }).type === "clip_prompt_packet")?.[1] as { data_json?: Record<string, unknown> };

    expect(packetInsert.data_json).toMatchObject({
      plannedDurationSeconds: 4.7,
      referenceImageMedia: expect.arrayContaining([
        { artifactId: "core-artifact-1", frameNumber: 1, kind: "core", mediaId: "media-core-1" },
        { artifactId: "expanded-artifact-1", frameNumber: 2, kind: "expanded", mediaId: "media-expanded-1" }
      ]),
      storyboardFrames: expect.arrayContaining([
        expect.objectContaining({ frameNumber: 1, title: "Center Frame" }),
        expect.objectContaining({ frameNumber: 2, title: "Small Look" })
      ]),
      storyboardScriptId: "storyboard-script-artifact-1"
    });
    expect((packetInsert.data_json?.referenceImageMedia as unknown[])).toHaveLength(9);
    expect(packetInsert.data_json?.providerPrompt).toContain("Director nine-frame plan");
    expect(packetInsert.data_json?.providerPrompt).toContain("中景/平视");
    expect(packetInsert.data_json?.providerPrompt).toContain("图片1=F01 core");
    expect(client.uploads[0]).toMatchObject({
      bucket: "storycam-generated",
      contentType: "video/mp4"
    });
    expect(
      client.queries
        .filter((query) => query.table === "storycam_artifacts")
        .flatMap((query) => query.calls)
        .find((call) => call[0] === "insert" && (call[1] as { type?: unknown }).type === "generated_clip")?.[1]
    ).toMatchObject({
      state: "ready",
      type: "generated_clip",
      user_id: "user-1"
    });
  });

  it("rejects clip generation before all 8 expanded storyboard images are ready", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/generate-clip/route");
    const client = new FakeSupabaseClient({
      artifactRows: [coreGroupRow(), storyboardScriptRow(), expandedCardRow(1)],
      mediaRows: [mediaRow("media-core-1", "core-artifact-1"), mediaRow("media-expanded-1", "expanded-artifact-1")]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(generateClipRequest(), {
      params: Promise.resolve({ id: "core-artifact-1" })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "expanded_frames_not_ready",
      redactedError: "Invalid generation job request.",
      redactionApplied: true
    });
    expect(
      client.queries
        .filter((query) => query.table === "generation_jobs")
        .flatMap((query) => query.calls)
        .some((call) => call[0] === "insert")
    ).toBe(false);
  });

  it("returns an existing active job for duplicate idempotency keys before creating a packet", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/generate-clip/route");
    const client = new FakeSupabaseClient({ activeJob: jobRow({ id: "job-existing", status: "running" }) });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(generateClipRequest(), {
      params: { id: "core-artifact-1" }
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      jobId: "job-existing",
      ok: true,
      status: "running"
    });
    expect(client.queries.some((query) => query.table === "storycam_artifacts")).toBe(false);
  });

  it("submits a real Seedance job with the 9-frame packet prompt and storyboard image references", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/generate-clip/route");
    const client = new FakeSupabaseClient({
      artifactRows: [coreGroupRow(), storyboardScriptRow(), ...expandedCardRows()],
      mediaRows: [mediaRow("media-core-1", "core-artifact-1"), ...expandedMediaRows()]
    });
    setRealGenerationEnv();
    const videoProvider = {
      generateClip: vi.fn(),
      providerKind: "video" as const,
      providerName: "seedance_2_0",
      resolveClipTask: vi.fn(),
      submitClipTask: vi.fn().mockResolvedValue({
        ok: true,
        providerKind: "video",
        providerName: "seedance_2_0",
        value: { providerRequestId: "seedance-task-1" }
      })
    };

    createConfiguredVideoProvidersMock.mockReturnValue({ seedance_2_0: videoProvider });
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(generateClipRequest(), {
      params: { id: "core-artifact-1" }
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      providerName: "seedance_2_0",
      status: "queued"
    });
    expect(videoProvider.submitClipTask).not.toHaveBeenCalled();
    expect(client.signedUrls).toHaveLength(9);
    expect(client.signedUrls).toEqual(
      expect.arrayContaining([
        {
          bucket: "storycam-generated",
          expiresIn: 3600,
          path: "users/user-1/sessions/session-1/generated/media-core-1.png"
        },
        {
          bucket: "storycam-generated",
          expiresIn: 3600,
          path: "users/user-1/sessions/session-1/generated/media-expanded-8.png"
        }
      ])
    );
    expect(
      client.queries
        .filter((query) => query.table === "generation_jobs")
        .flatMap((query) => query.calls)
        .find((call) => call[0] === "insert")?.[1]
    ).toMatchObject({
      generation_mode: "real",
      provider_name: "seedance_2_0",
      provider_request_id: null,
      status: "queued",
      type: "video_clip"
    });
  });

  it("uses the selected Seedance Fast provider for clip generation", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/generate-clip/route");
    const client = new FakeSupabaseClient({
      artifactRows: [coreGroupRow(), storyboardScriptRow(), ...expandedCardRows()],
      mediaRows: [mediaRow("media-core-1", "core-artifact-1"), ...expandedMediaRows()]
    });
    setRealGenerationEnv();
    const fastProvider = {
      generateClip: vi.fn(),
      providerKind: "video" as const,
      providerName: "seedance_2_0_fast",
      resolveClipTask: vi.fn(),
      submitClipTask: vi.fn().mockResolvedValue({
        ok: true,
        providerKind: "video",
        providerName: "seedance_2_0_fast",
        value: { providerRequestId: "seedance-fast-task-1" }
      })
    };

    createConfiguredVideoProvidersMock.mockReturnValue({ seedance_2_0_fast: fastProvider });
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(generateClipRequest({ videoModel: "seedance_2_0_fast" }), {
      params: { id: "core-artifact-1" }
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      providerName: "seedance_2_0_fast",
      status: "queued"
    });
    expect(fastProvider.submitClipTask).not.toHaveBeenCalled();
    expect(
      client.queries
        .filter((query) => query.table === "generation_jobs")
        .flatMap((query) => query.calls)
        .find((call) => call[0] === "insert")?.[1]
    ).toMatchObject({
      provider_name: "seedance_2_0_fast"
    });
  });

  it("queues Seedance Fast on the selected provider instead of silently falling back", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/generate-clip/route");
    const client = new FakeSupabaseClient({
      artifactRows: [coreGroupRow(), storyboardScriptRow(), ...expandedCardRows()],
      mediaRows: [mediaRow("media-core-1", "core-artifact-1"), ...expandedMediaRows()]
    });
    setRealGenerationEnv();
    const fastProvider = {
      generateClip: vi.fn(),
      providerKind: "video" as const,
      providerName: "seedance_2_0_fast",
      resolveClipTask: vi.fn(),
      submitClipTask: vi.fn().mockResolvedValue({
        errorCode: "SEEDANCE_PROVIDER_ERROR",
        ok: false,
        providerErrorCategory: "request_rejected",
        providerHttpStatus: 404,
        providerKind: "video",
        providerName: "seedance_2_0_fast",
        redactedError: "Provider request failed.",
        redactionApplied: true,
        retryable: true
      })
    };
    const regularProvider = {
      generateClip: vi.fn(),
      providerKind: "video" as const,
      providerName: "seedance_2_0",
      resolveClipTask: vi.fn(),
      submitClipTask: vi.fn().mockResolvedValue({
        ok: true,
        providerKind: "video",
        providerName: "seedance_2_0",
        value: { providerRequestId: "seedance-standard-task-1" }
      })
    };

    createConfiguredVideoProvidersMock.mockReturnValue({
      seedance_2_0: regularProvider,
      seedance_2_0_fast: fastProvider
    });
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(generateClipRequest({ videoModel: "seedance_2_0_fast" }), {
      params: { id: "core-artifact-1" }
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      providerName: "seedance_2_0_fast",
      status: "queued"
    });
    expect(fastProvider.submitClipTask).not.toHaveBeenCalled();
    expect(regularProvider.submitClipTask).not.toHaveBeenCalled();
    expect(
      client.queries
        .filter((query) => query.table === "generation_jobs")
        .flatMap((query) => query.calls)
        .find((call) => call[0] === "insert")?.[1]
    ).toMatchObject({
      provider_name: "seedance_2_0_fast",
      provider_request_id: null,
      status: "queued"
    });
  });

  it("rejects an unknown video model with a redacted validation error", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/generate-clip/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient().asSupabaseClient());

    const response = await POST(generateClipRequest({ videoModel: "seedance_1_0" }), {
      params: { id: "core-artifact-1" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_input",
      redactedError: "Invalid generation job request.",
      redactionApplied: true
    });
  });

  it("records a failed video job instead of returning 502 when local reference media cannot reach Seedance", async () => {
    const { POST } = await import("@/app/api/storyboard-groups/[id]/generate-clip/route");
    const client = new FakeSupabaseClient({
      artifactRows: [coreGroupRow(), storyboardScriptRow(), ...expandedCardRows()],
      mediaRows: [mediaRow("media-core-1", "core-artifact-1"), ...expandedMediaRows()],
      signedUrlBase: "http://127.0.0.1:54321"
    });
    setRealGenerationEnv();
    const videoProvider = {
      generateClip: vi.fn(),
      providerKind: "video" as const,
      providerName: "seedance_2_0",
      resolveClipTask: vi.fn(),
      submitClipTask: vi.fn()
    };

    createConfiguredVideoProvidersMock.mockReturnValue({ seedance_2_0: videoProvider });
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(generateClipRequest(), {
      params: { id: "core-artifact-1" }
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(videoProvider.submitClipTask).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      jobId: "job-1",
      ok: true,
      providerName: "seedance_2_0",
      redactedError: expect.stringContaining("local machine"),
      status: "failed"
    });
    expect(
      client.queries
        .filter((query) => query.table === "generation_jobs")
        .flatMap((query) => query.calls)
        .find((call) => call[0] === "update")?.[1]
    ).toMatchObject({
      error_code: "VIDEO_REFERENCE_MEDIA_NOT_PUBLIC",
      status: "failed"
    });
  });

  it("polls a generation job status with a safe summary", async () => {
    const { GET } = await import("@/app/api/generation-jobs/[id]/route");
    const client = new FakeSupabaseClient({
      job: jobRow({ output_artifact_id: "clip-artifact-1", status: "succeeded" })
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/generation-jobs/job-1"), {
      params: { id: "job-1" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: {
        attempts: 0,
        id: "job-1",
        outputArtifactId: "clip-artifact-1",
        providerKind: "video",
        providerName: "mock",
        sessionId: "session-1",
        status: "succeeded",
        type: "video_clip"
      },
      ok: true
    });
  });

  it("includes a short-lived private preview URL for a succeeded clip", async () => {
    const { GET } = await import("@/app/api/generation-jobs/[id]/route");
    const client = new FakeSupabaseClient({
      artifactRows: [generatedClipArtifact()],
      job: jobRow({ output_artifact_id: "clip-artifact-1", status: "succeeded" }),
      mediaRows: [clipMediaRow()]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/generation-jobs/job-1"), {
      params: { id: "job-1" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job: {
        id: "job-1",
        outputArtifactId: "clip-artifact-1",
        outputPreview: {
          durationSeconds: 15,
          mimeType: "video/mp4",
          signedUrl: "https://storycam.test/storage/storycam-generated/users/user-1/sessions/session-1/generated/clips/clip.mp4",
          signedUrlExpiresIn: 300
        },
        status: "succeeded"
      },
      ok: true
    });
    expect(client.signedUrls).toContainEqual({
      bucket: "storycam-generated",
      expiresIn: 300,
      path: "users/user-1/sessions/session-1/generated/clips/clip.mp4"
    });
  });

  it("cancels generation jobs with a local tombstone", async () => {
    const { POST } = await import("@/app/api/generation-jobs/[id]/cancel/route");
    const client = new FakeSupabaseClient({ job: jobRow({ status: "canceled", tombstoned_at: "2026-04-26T01:02:03.000Z" }) });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(new Request("https://storycam.test/api/generation-jobs/job-1/cancel", { method: "POST" }), {
      params: Promise.resolve({ id: "job-1" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: "job-1",
      ok: true,
      status: "canceled"
    });
    expect(client.queries[0]?.calls).toContainEqual(["is", "tombstoned_at", null]);
    expect(client.queries[0]?.calls).toContainEqual([
      "update",
      expect.objectContaining({
        status: "canceled",
        tombstoned_at: expect.any(String)
      })
    ]);
  });
});

function generateClipRequest(overrides: Record<string, unknown> = {}) {
  return new Request("https://storycam.test/api/storyboard-groups/core-artifact-1/generate-clip", {
    body: JSON.stringify({
      confirmedArtifactVersions: {
        "core-artifact-1": 1,
        ...Object.fromEntries(expandedCardRows().map((row) => [row.id, row.version]))
      },
      coreStoryboardGroupId: "core-artifact-1",
      idempotencyKey: "idempotency-secret",
      providerSendConfirmed: true,
      sessionId: "session-1",
      ...overrides
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

function setRealGenerationEnv() {
  process.env.STORYCAM_GENERATION_MODE = "real";
  process.env.STORYCAM_STORY_WORLD_TEXT_PROVIDER = "deepseek";
  process.env.STORYCAM_STORYBOARD_TEXT_PROVIDER = "openrouter";
  process.env.STORYCAM_MULTIMODAL_PROVIDER = "openrouter";
  process.env.STORYCAM_IMAGE_PROVIDER = "inference_sh";
  process.env.STORYCAM_VIDEO_PROVIDER = "seedance_2_0";
  process.env.STORYCAM_FINAL_WORK_PROVIDER = "ffmpeg";
  process.env.DEEPSEEK_API_KEY = "deepseek-secret";
  process.env.OPENROUTER_API_KEY = "openrouter-secret";
  process.env.OPENROUTER_TEXT_MODEL = "openrouter-text-model";
  process.env.OPENROUTER_MULTIMODAL_MODEL = "openrouter-multimodal-model";
  process.env.INFERENCE_API_KEY = "inference-secret";
  process.env.INFERENCE_IMAGE_APP = "openai/gpt-image-2";
  process.env.SEEDANCE_API_KEY = "seedance-secret";
  process.env.SEEDANCE_MODEL = "doubao-seedance-2-0-260128";
}

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    attempts: 0,
    created_at: "2026-04-26T00:00:00.000Z",
    ended_at: null,
    error_code: null,
    provider_error_category: null,
    provider_http_status: null,
    generation_mode: "mock",
    id: "job-1",
    idempotency_key_hash: "hash-1",
    input_artifact_versions_json: {},
    locked_at: null,
    locked_by: null,
    max_attempts: 1,
    output_artifact_id: null,
    premiere_ticket_id: null,
    provider_kind: "video",
    provider_name: "mock",
    provider_request_id: null,
    redacted_error: null,
    session_id: "session-1",
    started_at: null,
    status: "queued",
    tombstoned_at: null,
    type: "video_clip",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    run_after: "2026-04-26T00:00:00.000Z",
    ...overrides
  };
}

function coreGroupRow() {
  return {
    ...baseArtifactRow(),
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
    id: "core-artifact-1",
    type: "core_storyboard_group"
  };
}

function expandedCardRows() {
  return Array.from({ length: 8 }, (_, index) => expandedCardRow(index + 1));
}

function expandedCardRow(index: number) {
  const frameNumber = index + 1;

  return {
    ...baseArtifactRow(),
    data_json: {
      beatType: "reaction",
      coreGroupId: "core-group-rainy-kdrama-1",
      description: index === 1 ? "A small reaction beat." : `Frame ${frameNumber} continuation beat.`,
      frameNumber,
      guidance: "Keep it quiet.",
      id: `expanded-card-${index}`,
      sessionId: "session-1",
      sortOrder: index - 1,
      state: "ready",
      title: index === 1 ? "Small Look" : `Frame ${frameNumber}`,
      version: 1
    },
    id: `expanded-artifact-${index}`,
    parent_artifact_id: "core-artifact-1",
    type: "expanded_storyboard_card"
  };
}

function expandedMediaRows() {
  return expandedCardRows().map((row, index) => mediaRow(`media-expanded-${index + 1}`, row.id));
}

function storyboardScriptRow() {
  return {
    ...baseArtifactRow(),
    data_json: {
      frames: Array.from({ length: 9 }, (_, index) => ({
        beatType: index === 0 ? "core" : "reaction",
        cameraAngle: "平视",
        canvasPosition: ["center", "top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"][index],
        durationSeconds: index === 0 ? 3 : 1.5,
        frameNumber: index + 1,
        imagePrompt: `Frame ${index + 1} prompt`,
        narrativePurpose: index === 0 ? "Establish the unsent message." : "Extend the emotional beat.",
        scene: "Rainy convenience store",
        shotSize: "中景",
        sound: "Rain ambience",
        technicalNotes: "Keep visual continuity.",
        timeRange: `00:0${index}-00:0${index + 1}`,
        title: index === 0 ? "Center Frame" : index === 1 ? "Small Look" : `Frame ${index + 1}`,
        visualContent: index === 0 ? "The lead holds the phone under rain light." : "A quiet continuation frame."
      })),
      id: "storyboard-script-1",
      mainImagePrompt: "Core frame prompt",
      planSummary: "A 15 second rainy memory.",
      plannedDurationSeconds: 15,
      rhythm: "quiet",
      sessionId: "session-1",
      state: "ready",
      tone: "private",
      version: 1
    },
    id: "storyboard-script-artifact-1",
    parent_artifact_id: "core-artifact-1",
    type: "storyboard_script"
  };
}

function generatedClipArtifact() {
  return {
    ...baseArtifactRow(),
    data_json: {
      clipPromptPacketId: "packet-1",
      coreGroupId: "core-group-rainy-kdrama-1",
      durationSeconds: 15,
      id: "generated-clip-1",
      jobId: "job-1",
      mediaAssetId: "media-clip-1",
      providerName: "mock",
      reviewState: "pending",
      sessionId: "session-1",
      state: "ready",
      version: 1
    },
    id: "clip-artifact-1",
    type: "generated_clip"
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
    type: "core_storyboard_group",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    version: 1
  };
}

type FakeSupabaseClientOptions = {
  activeJob?: unknown;
  artifactRows?: unknown[];
  job?: unknown;
  mediaRows?: unknown[];
  signedUrlBase?: string;
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly signedUrls: Array<{ bucket: string; expiresIn: number; path: string }> = [];
  readonly tickets: Record<string, unknown>[] = [];
  readonly uploads: Array<{ body: Uint8Array; bucket: string; contentType: string; path: string; upsert: false }> = [];
  latestGenerationJob: Record<string, unknown> | null = null;
  readonly storage = {
    from: (bucket: string) => ({
      createSignedUrl: (path: string, expiresIn: number) => {
        this.signedUrls.push({ bucket, expiresIn, path });

        return Promise.resolve({
          data: { signedUrl: `${this.options.signedUrlBase ?? "https://storycam.test"}/storage/${bucket}/${path}` },
          error: null
        });
      },
      upload: (path: string, body: Uint8Array, options: { contentType: string; upsert: false }) => {
        this.uploads.push({
          body,
          bucket,
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
  private artifactInsertCount = 0;
  private ticketInsertCount = 0;

  constructor(private readonly options: FakeSupabaseClientOptions = {}) {}

  asSupabaseClient() {
    return this;
  }

  nextArtifactId(type: unknown) {
    this.artifactInsertCount += 1;
    return `${type}-artifact-${this.artifactInsertCount}`;
  }

  nextTicketId() {
    this.ticketInsertCount += 1;
    return `ticket-${this.ticketInsertCount}`;
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

  select(columns: string, options?: Record<string, unknown>) {
    this.calls.push(options ? ["select", columns, options] : ["select", columns]);
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

  in(column: string, values: unknown[]) {
    this.calls.push(["in", column, values]);
    return this;
  }

  order(column: string, options: Record<string, unknown>) {
    this.calls.push(["order", column, options]);
    return this;
  }

  gte(column: string, value: unknown) {
    this.calls.push(["gte", column, value]);
    return this;
  }

  single() {
    return Promise.resolve({
      data: this.singleRow(),
      error: null
    });
  }

  maybeSingle() {
    return Promise.resolve({
      data: this.maybeSingleRow(),
      error: null
    });
  }

  then(resolve: (value: { count?: number; data: unknown; error: null }) => void, reject?: (reason: unknown) => void) {
    return Promise.resolve({
      count: 0,
      data:
        this.table === "storycam_artifacts"
          ? (this.options.artifactRows ?? [])
          : this.table === "media_assets"
            ? this.findMediaRows()
            : this.table === "storycam_premiere_tickets"
              ? this.ticketRows()
              : [],
      error: null
    }).then(resolve, reject);
  }

  limit(value: number) {
    this.calls.push(["limit", value]);
    return this;
  }

  private maybeSingleRow() {
    if (this.table === "generation_jobs" && (this.inserted || this.updated)) {
      return this.singleRow();
    }

    if (this.table === "generation_jobs" && this.calls.some((call) => call[0] === "eq" && call[1] === "idempotency_key_hash")) {
      return this.options.activeJob ?? null;
    }

    if (this.table === "generation_jobs") {
      return this.options.job ?? this.options.activeJob ?? this.client.latestGenerationJob;
    }

    if (this.table === "storycam_premiere_tickets") {
      return this.ticketRows()[0] ?? null;
    }

    if (this.table === "storycam_sessions") {
      return {
        core_group_target_count: 1,
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        generation_mode: "mock",
        id: "session-1",
        planned_duration_seconds: 12,
        status: "ready",
        updated_at: "2026-04-26T00:00:00.000Z",
        user_id: "user-1",
        video_aspect_ratio: "16:9"
      };
    }

    if (this.table === "media_assets") {
      return this.findMediaRows()[0] ?? null;
    }

    return null;
  }

  private singleRow() {
    if (this.table === "generation_jobs") {
      const row = {
        ...jobRow(),
        ...(this.client.latestGenerationJob ?? {}),
        ...this.inserted,
        ...this.updated,
        id: this.options.job && typeof this.options.job === "object" && "id" in this.options.job ? this.options.job.id : "job-1"
      };
      this.client.latestGenerationJob = row;

      return row;
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

    if (this.table === "media_assets") {
      return {
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        id: "media-insert-1",
        ...this.inserted
      };
    }

    if (this.table === "storycam_premiere_tickets") {
      const row = {
        created_at: "2026-04-26T00:00:00.000Z",
        expires_at: null,
        id: this.client.nextTicketId(),
        issued_by_user_id: null,
        note: null,
        reserved_at: null,
        reserved_session_id: null,
        spent_at: null,
        status: "available",
        updated_at: "2026-04-26T00:00:00.000Z",
        ...this.inserted,
        ...this.updated
      };
      this.client.tickets.push(row);
      return row;
    }

    return this.inserted;
  }

  private ticketRows() {
    if (this.updated) {
      const row = this.client.tickets.find((ticket) => this.matches(ticket));

      if (row) {
        Object.assign(row, this.updated);
      }

      return row ? [row] : [];
    }

    return this.client.tickets.filter((ticket) => this.matches(ticket));
  }

  private matches(row: Record<string, unknown>) {
    return this.calls.every((call) => {
      if (call[0] === "eq") {
        return row[String(call[1])] === call[2];
      }

      if (call[0] === "in" && Array.isArray(call[2])) {
        return call[2].includes(row[String(call[1])]);
      }

      return true;
    });
  }

  private findMediaRows() {
    return (this.options.mediaRows ?? []).filter(
      (row) =>
        (!this.eqFilters.user_id || (row as { user_id?: unknown }).user_id === this.eqFilters.user_id) &&
        (!this.eqFilters.session_id || (row as { session_id?: unknown }).session_id === this.eqFilters.session_id) &&
        (!this.eqFilters.linked_artifact_id ||
          (row as { linked_artifact_id?: unknown }).linked_artifact_id === this.eqFilters.linked_artifact_id) &&
        (!this.eqFilters.kind || (row as { kind?: unknown }).kind === this.eqFilters.kind)
    );
  }
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

function clipMediaRow() {
  return {
    byte_size: 2048,
    created_at: "2026-04-26T00:00:00.000Z",
    deleted_at: null,
    id: "media-clip-1",
    kind: "generated_clip",
    linked_artifact_id: "clip-artifact-1",
    mime_type: "video/mp4",
    session_id: "session-1",
    source: "provider",
    storage_bucket: "storycam-generated",
    storage_path: "users/user-1/sessions/session-1/generated/clips/clip.mp4",
    user_id: "user-1"
  };
}
