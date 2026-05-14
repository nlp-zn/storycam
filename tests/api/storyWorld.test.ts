import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const loadStoryCamConfigMock = vi.hoisted(() => vi.fn());
const createConfiguredStoryWorldProviderMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/server/config", async () => {
  const actual = await vi.importActual<typeof import("@/server/config")>("@/server/config");

  return {
    ...actual,
    loadStoryCamConfig: loadStoryCamConfigMock
  };
});

vi.mock("@/server/storycam/storyWorldProviderFactory", () => ({
  createConfiguredStoryWorldProvider: createConfiguredStoryWorldProviderMock
}));

describe("POST /api/story-world", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    loadStoryCamConfigMock.mockReset();
    createConfiguredStoryWorldProviderMock.mockReset();
    loadStoryCamConfigMock.mockReturnValue(mockTextConfig());
    createConfiguredStoryWorldProviderMock.mockReturnValue(undefined);
  });

  it("returns a redacted validation error for empty input", async () => {
    const { POST } = await import("@/app/api/story-world/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient().asSupabaseClient());

    const response = await POST(jsonRequest({ input: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_input",
      redactedError: "Invalid story world request.",
      redactionApplied: true
    });
  });

  it("returns a redacted validation error for an invalid video aspect ratio", async () => {
    const { POST } = await import("@/app/api/story-world/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient().asSupabaseClient());

    const response = await POST(
      jsonRequest({
        input: "我想把暗恋拍成韩剧雨夜",
        videoAspectRatio: "1:1"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_input",
      redactedError: "Invalid story world request.",
      redactionApplied: true
    });
  });

  it("returns redacted validation errors when handdrawn travel VLOG is missing its required photo or destination", async () => {
    const { POST } = await import("@/app/api/story-world/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient().asSupabaseClient());

    const missingPhoto = await POST(
      jsonRequest({
        input: "我想做一个手绘旅行 VLOG",
        storyModeId: "handdrawn-travel-vlog",
        travelDestination: "里斯本"
      })
    );
    const missingDestination = await POST(
      jsonRequest({
        input: "我想做一个手绘旅行 VLOG",
        storyModeId: "handdrawn-travel-vlog",
        uploadedPhotoIds: ["photo-1"]
      })
    );

    expect(missingPhoto.status).toBe(400);
    expect(missingDestination.status).toBe(400);
    await expect(missingPhoto.json()).resolves.toMatchObject({
      error: "invalid_photos",
      redactedError: "Invalid story world request.",
      redactionApplied: true
    });
    await expect(missingDestination.json()).resolves.toMatchObject({
      error: "invalid_input",
      redactedError: "Invalid story world request.",
      redactionApplied: true
    });
  });

  it("returns artifact versions from mock mode", async () => {
    const { POST } = await import("@/app/api/story-world/route");
    const client = new FakeSupabaseClient();

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(
      jsonRequest({
        input: "我想把暗恋拍成韩剧雨夜",
        lightweightChoices: ["rainy"],
        plannedDurationSeconds: 12
      })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-storycam-text-provider")).toBe("mock");
    const body = await response.json();

    expect(body).toMatchObject({
      artifacts: {
        characterAssets: expect.arrayContaining([
          expect.objectContaining({ id: "character-rainy-crush-lead-artifact", type: "character_asset", version: 1 }),
          expect.objectContaining({ id: "character-rainy-crush-counterpart-artifact", type: "character_asset", version: 1 })
        ]),
        sceneAssets: [{ type: "scene_asset", version: 1 }],
        script: { type: "script", version: 1 }
      },
      diagnostics: {
        textProvider: "mock"
      },
      ok: true,
      sessionId: "session-1",
      storyWorld: {
        characterAssets: expect.arrayContaining([
          expect.objectContaining({ name: "她" }),
          expect.objectContaining({ name: "他" })
        ]),
        sceneAssets: [
          expect.objectContaining({
            name: "便利店外的玻璃反光",
            scenePanels: expect.arrayContaining([expect.objectContaining({ title: "便利店外景" })])
          })
        ],
        script: expect.objectContaining({ title: "雨夜未发送" })
      }
    });
    expect(body.storyWorld.script.qualityChecks).toEqual(expect.arrayContaining([expect.stringContaining("可见")]));
    expect(body.storyWorld.script).not.toHaveProperty("directorBrief");
    expect(JSON.stringify(body)).not.toContain("shotDensity");
  });

  it("creates a durable real story-world job without waiting on the text provider", async () => {
    const { POST } = await import("@/app/api/story-world/route");
    const provider = {
      generate: vi.fn(),
      providerKind: "text" as const,
      providerName: "deepseek"
    };
    const client = new FakeSupabaseClient();

    loadStoryCamConfigMock.mockReturnValue(
      mockTextConfig({
        deepseek: {
          apiKey: "deepseek-key",
          textBaseUrl: "https://api.deepseek.com/beta",
          textModel: "deepseek-v4-pro"
        },
        mode: "real",
        textProvider: "deepseek"
      })
    );
    createConfiguredStoryWorldProviderMock.mockReturnValue(provider);
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(
      jsonRequest({
        idempotencyKey: "story-world-request-1",
        input: "这是非常私密的一句话，不应该出现在响应里",
        lightweightChoices: ["留白多一点"],
        videoAspectRatio: "9:16"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(response.headers.get("x-storycam-text-provider")).toBe("deepseek");
    expect(body).toMatchObject({
      job: {
        jobId: "job-1",
        providerName: "deepseek",
        sessionId: "session-1",
        status: "queued"
      },
      ok: true,
      providerName: "deepseek",
      sessionId: "session-1",
      status: "queued"
    });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("非常私密");
    expect(JSON.stringify(body)).not.toContain("deepseek-key");
    expect(client.insertedRows("storycam_artifacts")).toContainEqual(
      expect.objectContaining({
        data_json: expect.objectContaining({
          input: "这是非常私密的一句话，不应该出现在响应里",
          lightweightChoices: ["留白多一点"],
          sessionId: "session-1",
          videoAspectRatio: "9:16"
        }),
        type: "input"
      })
    );
    expect(client.insertedRows("generation_jobs")).toContainEqual(
      expect.objectContaining({
        input_artifact_versions_json: expect.objectContaining({
          storyWorldInputArtifactId: "input-artifact"
        }),
        provider_kind: "text",
        provider_name: "deepseek",
        status: "queued",
        type: "story_world"
      })
    );
  });

  it("reuses an active first-run real story-world job before creating a new session", async () => {
    const { POST } = await import("@/app/api/story-world/route");
    const provider = {
      generate: vi.fn(),
      providerKind: "text" as const,
      providerName: "deepseek"
    };
    const client = new FakeSupabaseClient({
      existingGenerationJob: storyWorldGenerationJobRow({
        id: "existing-story-world-job",
        provider_name: "deepseek",
        session_id: "existing-session"
      })
    });

    loadStoryCamConfigMock.mockReturnValue(
      mockTextConfig({
        deepseek: {
          apiKey: "deepseek-key",
          textBaseUrl: "https://api.deepseek.com/beta",
          textModel: "deepseek-v4-pro"
        },
        mode: "real",
        textProvider: "deepseek"
      })
    );
    createConfiguredStoryWorldProviderMock.mockReturnValue(provider);
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(
      jsonRequest({
        idempotencyKey: "story-world-request-1",
        input: "这是非常私密的一句话，不应该出现在响应里",
        lightweightChoices: ["留白多一点"],
        videoAspectRatio: "9:16"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      job: {
        jobId: "existing-story-world-job",
        providerName: "deepseek",
        sessionId: "existing-session",
        status: "queued"
      },
      ok: true,
      sessionId: "existing-session"
    });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(client.queries[0]?.table).toBe("generation_jobs");
    expect(client.insertedRows("storycam_sessions")).toEqual([]);
    expect(client.insertedRows("storycam_artifacts")).toEqual([]);
    expect(client.insertedRows("generation_jobs")).toEqual([]);
  });

  it("uses the OpenRouter story-world provider when text provider is configured for mixed mode", async () => {
    const { POST } = await import("@/app/api/story-world/route");
    const provider = {
      providerKind: "text" as const,
      providerName: "openrouter",
      generate: vi.fn().mockResolvedValue({
        ok: true,
        providerKind: "text",
        providerName: "openrouter",
        value: dynamicStoryWorld()
      })
    };

    loadStoryCamConfigMock.mockReturnValue(
      mockTextConfig({
        openrouter: {
          apiKey: "openrouter-key",
          textModel: "deepseek/deepseek-v4-flash"
        },
        textProvider: "openrouter"
      })
    );
    createConfiguredStoryWorldProviderMock.mockReturnValue(provider);
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient().asSupabaseClient());

    const response = await POST(
      jsonRequest({
        input: "我想把毕业告别拍成一个旧照片短片",
        lightweightChoices: ["像旧照片"]
      })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-storycam-text-provider")).toBe("openrouter");
    await expect(response.json()).resolves.toMatchObject({
      diagnostics: {
        textProvider: "openrouter"
      },
      ok: true,
      storyWorld: {
        characterAssets: [expect.objectContaining({ name: "阿岚" })],
        sceneAssets: [
          expect.objectContaining({
            name: "教学楼背后的照片墙",
            scenePanels: expect.arrayContaining([expect.objectContaining({ title: "照片墙全景" })])
          })
        ],
        script: expect.objectContaining({ title: "照片背面的再见" })
      }
    });
    expect(createConfiguredStoryWorldProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        openrouter: {
          apiKey: "openrouter-key",
          textModel: "deepseek/deepseek-v4-flash"
        }
      })
    );
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        idea: "我想把毕业告别拍成一个旧照片短片",
        lightweightChoices: ["像旧照片"]
      })
    );
  });

  it("uses the DeepSeek story-world provider when text provider is configured for strict tool mode", async () => {
    const { POST } = await import("@/app/api/story-world/route");
    const provider = {
      providerKind: "text" as const,
      providerName: "deepseek",
      generate: vi.fn().mockResolvedValue({
        ok: true,
        providerKind: "text",
        providerName: "deepseek",
        value: dynamicStoryWorld()
      })
    };

    loadStoryCamConfigMock.mockReturnValue(
      mockTextConfig({
        deepseek: {
          apiKey: "deepseek-key",
          textBaseUrl: "https://api.deepseek.com/beta",
          textFallbackModels: ["deepseek-v4-flash"],
          textModel: "deepseek-v4-pro"
        },
        textProvider: "deepseek"
      })
    );
    createConfiguredStoryWorldProviderMock.mockReturnValue(provider);
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient().asSupabaseClient());

    const response = await POST(
      jsonRequest({
        input: "我想把暗恋拍成韩剧雨夜",
        lightweightChoices: ["留白多一点"]
      })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-storycam-text-provider")).toBe("deepseek");
    await expect(response.json()).resolves.toMatchObject({
      diagnostics: {
        textProvider: "deepseek"
      },
      ok: true,
      storyWorld: {
        characterAssets: [expect.objectContaining({ name: "阿岚" })],
        sceneAssets: [
          expect.objectContaining({
            name: "教学楼背后的照片墙",
            scenePanels: expect.arrayContaining([expect.objectContaining({ title: "照片墙全景" })])
          })
        ],
        script: expect.objectContaining({ title: "照片背面的再见" })
      }
    });
    expect(createConfiguredStoryWorldProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deepseek: {
          apiKey: "deepseek-key",
          textBaseUrl: "https://api.deepseek.com/beta",
          textFallbackModels: ["deepseek-v4-flash"],
          textModel: "deepseek-v4-pro"
        }
      })
    );
  });

  it("returns redacted DeepSeek provider failures without leaking private input or keys", async () => {
    const { POST } = await import("@/app/api/story-world/route");
    const provider = {
      errorCode: "DEEPSEEK_TOOL_CALL_MISSING",
      generate: vi.fn().mockResolvedValue({
        errorCode: "DEEPSEEK_TOOL_CALL_MISSING",
        ok: false,
        providerKind: "text",
        providerName: "deepseek",
        redactedError: "Provider request failed.",
        redactionApplied: true,
        retryable: true
      }),
      providerKind: "text" as const,
      providerName: "deepseek"
    };

    loadStoryCamConfigMock.mockReturnValue(
      mockTextConfig({
        deepseek: {
          apiKey: "deepseek-key",
          textBaseUrl: "https://api.deepseek.com/beta",
          textModel: "deepseek-v4-pro"
        },
        textProvider: "deepseek"
      })
    );
    createConfiguredStoryWorldProviderMock.mockReturnValue(provider);
    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient().asSupabaseClient());

    const response = await POST(
      jsonRequest({
        input: "这是非常私密的一句话，不应该出现在错误响应里",
        lightweightChoices: ["像旧照片"]
      })
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: "DEEPSEEK_TOOL_CALL_MISSING",
      redactedError: "Provider request failed.",
      redactionApplied: true
    });
    expect(JSON.stringify(body)).not.toContain("非常私密");
    expect(JSON.stringify(body)).not.toContain("deepseek-key");
  });
});

function jsonRequest(body: unknown) {
  return new Request("https://storycam.test/api/story-world", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

function mockTextConfig(
  options: {
    openrouter?: { apiKey: string; textModel: string };
    deepseek?: { apiKey: string; textBaseUrl: string; textFallbackModels?: string[]; textModel: string };
    mode?: "mock" | "real";
    textProvider?: "deepseek" | "mock" | "openrouter";
  } = {}
) {
  return {
    generation: {
      finalWorkProvider: "mock",
      imageProvider: "mock",
      mode: options.mode ?? "mock",
      multimodalProvider: "mock",
      textProvider: options.textProvider ?? "mock",
      videoProvider: "mock"
    },
    deepseek: options.deepseek,
    openrouter: options.openrouter,
    supabase: {
      anonKey: "anon-key",
      serviceRoleKey: "service-role-key",
      url: "https://storycam.example.supabase.co"
    }
  };
}

function dynamicStoryWorld() {
  return {
    characterAssets: [
      {
        consistencyNotes: ["一直把照片夹在书页里"],
        emotionalBaseline: "克制、轻声说话，用动作代替解释",
        id: "character-dynamic-1",
        name: "阿岚",
        props: ["旧照片", "帆布包"],
        referenceMediaIds: [],
        relationshipToUserStory: "承载毕业告别里没有说出口的那句话",
        role: "毕业生",
        sessionId: "session-1",
        stableVisualDescription: "短发，白衬衫，帆布包肩带磨旧，手里捏着一张旧照片",
        state: "ready",
        version: 1,
        wardrobe: "白衬衫、深色长裤"
      }
    ],
    sceneAssets: [
      {
        atmosphere: "安静、怀旧、带一点离别感",
        id: "scene-dynamic-1",
        keyObjects: ["照片墙", "旧课桌", "傍晚光斑"],
        light: "傍晚侧光穿过走廊窗户",
        location: "旧教学楼后侧走廊",
        name: "教学楼背后的照片墙",
        referenceMediaIds: [],
        scenePanels: [
          {
            description: "旧教学楼后侧走廊和照片墙在傍晚侧光里连成一条安静动线。",
            keyObjects: ["照片墙", "走廊窗户", "傍晚光斑"],
            purpose: "建立毕业告别发生的主空间。",
            shotType: "establishing",
            title: "照片墙全景"
          },
          {
            description: "旧照片被夹在书页里，边角泛黄。",
            keyObjects: ["旧照片", "书页"],
            purpose: "让没说出口的告别落到可见物件上。",
            shotType: "detail",
            title: "书页里的照片"
          },
          {
            description: "傍晚侧光穿过窗户落在照片墙和课桌边缘。",
            keyObjects: ["走廊窗户", "傍晚光斑", "旧课桌"],
            purpose: "固定怀旧、安静的光线基调。",
            shotType: "lighting",
            title: "傍晚侧光"
          },
          {
            description: "她站在照片墙前，把照片翻到背面，又放回书页里。",
            keyObjects: ["照片墙", "旧照片", "帆布包"],
            purpose: "提供核心动作发生的空间关系。",
            shotType: "medium",
            title: "照片墙前"
          }
        ],
        sessionId: "session-1",
        spatialLogic: "她站在照片墙前，把照片翻到背面，又放回书页里",
        state: "ready",
        timeOfDay: "dusk",
        version: 1
      }
    ],
    script: {
      beats: ["她从书页里抽出旧照片", "夕阳照到照片背面的字", "她把照片放回原处转身离开"],
      id: "script-dynamic-1",
      logline: "她在毕业后的旧教学楼里，翻出一张没有送出的合照。",
      sessionId: "session-1",
      state: "ready",
      summary: "夕阳、照片墙和一张旧合照，把告别停在没有说出口的那一秒。",
      title: "照片背面的再见",
      version: 1
    }
  };
}

function storyWorldGenerationJobRow(overrides: Record<string, unknown> = {}) {
  return {
    attempts: 0,
    created_at: "2026-04-26T00:00:00.000Z",
    ended_at: null,
    error_code: null,
    generation_mode: "real",
    id: "job-1",
    idempotency_key_hash: "hash-1",
    input_artifact_versions_json: {},
    locked_at: null,
    locked_by: null,
    max_attempts: 1,
    output_artifact_id: null,
    provider_error_category: null,
    provider_http_status: null,
    provider_kind: "text",
    provider_name: "deepseek",
    provider_request_id: null,
    redacted_error: null,
    run_after: "2026-04-26T00:00:00.000Z",
    session_id: "session-1",
    started_at: null,
    status: "queued",
    tombstoned_at: null,
    type: "story_world",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    ...overrides
  };
}

type FakeSupabaseClientOptions = {
  existingGenerationJob?: Record<string, unknown>;
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  private generationJobInsertCount = 0;

  constructor(private readonly options: FakeSupabaseClientOptions = {}) {}

  asSupabaseClient() {
    return this;
  }

  existingGenerationJob() {
    return this.options.existingGenerationJob ?? null;
  }

  insertedRows(table: string) {
    return this.queries
      .filter((query) => query.table === table)
      .flatMap((query) => query.calls)
      .filter((call) => call[0] === "insert")
      .map((call) => call[1]);
  }

  nextGenerationJobId() {
    this.generationJobInsertCount += 1;
    return `job-${this.generationJobInsertCount}`;
  }

  from(table: string) {
    const query = new FakeQuery(table, this);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];
  private inserted: Record<string, unknown> | null = null;
  private updated: Record<string, unknown> | null = null;

  constructor(readonly table: string, private readonly client: FakeSupabaseClient) {}

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

  select(columns?: string) {
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
      data: this.table === "generation_jobs" ? this.client.existingGenerationJob() : this.table === "storycam_sessions" ? this.sessionRow() : null,
      error: null
    });
  }

  then(resolve: (value: { data: unknown; error: null }) => void, reject?: (reason: unknown) => void) {
    return Promise.resolve({
      data: [],
      error: null
    }).then(resolve, reject);
  }

  private row() {
    if (this.table === "storycam_sessions") {
      return this.sessionRow();
    }

    if (this.table === "storycam_artifacts") {
      return {
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        id: artifactRowId(this.inserted),
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
        locked_at: null,
        locked_by: null,
        max_attempts: 1,
        output_artifact_id: null,
        provider_error_category: null,
        provider_http_status: null,
        provider_request_id: null,
        redacted_error: null,
        run_after: "2026-04-26T00:00:00.000Z",
        started_at: null,
        tombstoned_at: null,
        updated_at: "2026-04-26T00:00:00.000Z",
        ...this.inserted
      };
    }

    return this.inserted;
  }

  private sessionRow() {
    return {
      core_group_target_count: 1,
      created_at: "2026-04-26T00:00:00.000Z",
      deleted_at: null,
      generation_mode: "mock",
      id: "session-1",
      planned_duration_seconds: 12,
      status: "draft",
      updated_at: "2026-04-26T00:00:00.000Z",
      user_id: "user-1",
      video_aspect_ratio: this.updated?.video_aspect_ratio ?? "16:9"
    };
  }
}

function artifactRowId(inserted: Record<string, unknown> | null) {
  const dataJson = inserted?.data_json;

  if (dataJson && typeof dataJson === "object" && "id" in dataJson) {
    return `${String(dataJson.id)}-artifact`;
  }

  return `${String(inserted?.type)}-artifact`;
}
