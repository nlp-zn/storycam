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

  it("returns artifact versions from mock mode", async () => {
    const { POST } = await import("@/app/api/story-world/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(new FakeSupabaseClient().asSupabaseClient());

    const response = await POST(
      jsonRequest({
        input: "我想把暗恋拍成韩剧雨夜",
        lightweightChoices: ["rainy"],
        plannedDurationSeconds: 12
      })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-storycam-text-provider")).toBe("mock");
    await expect(response.json()).resolves.toMatchObject({
      artifacts: {
        characterAssets: [{ type: "character_asset", version: 1 }],
        sceneAssets: [{ type: "scene_asset", version: 1 }],
        script: { type: "script", version: 1 }
      },
      ok: true,
      sessionId: "session-1",
      storyWorld: {
        characterAssets: [expect.objectContaining({ name: "她" })],
        sceneAssets: [expect.objectContaining({ name: "便利店外的玻璃反光" })],
        script: expect.objectContaining({ title: "雨夜未发送" })
      }
    });
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
          textModel: "deepseek/deepseek-v4-pro"
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
        lightweightChoices: ["少说话"]
      })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-storycam-text-provider")).toBe("openrouter");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      storyWorld: {
        characterAssets: [expect.objectContaining({ name: "阿岚" })],
        sceneAssets: [expect.objectContaining({ name: "教学楼背后的照片墙" })],
        script: expect.objectContaining({ title: "照片背面的再见" })
      }
    });
    expect(createConfiguredStoryWorldProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        openrouter: {
          apiKey: "openrouter-key",
          textModel: "deepseek/deepseek-v4-pro"
        }
      })
    );
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        idea: "我想把毕业告别拍成一个旧照片短片",
        lightweightChoices: ["少说话"]
      })
    );
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
    textProvider?: "mock" | "openrouter";
  } = {}
) {
  return {
    generation: {
      finalWorkProvider: "mock",
      imageProvider: "mock",
      mode: "mock",
      multimodalProvider: "mock",
      textProvider: options.textProvider ?? "mock",
      videoProvider: "mock"
    },
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

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];

  asSupabaseClient() {
    return this;
  }

  from(table: string) {
    const query = new FakeQuery(table);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  private inserted: Record<string, unknown> | null = null;

  constructor(readonly table: string) {}

  insert(value: Record<string, unknown>) {
    this.inserted = value;
    return this;
  }

  select() {
    return this;
  }

  single() {
    return Promise.resolve({
      data: this.row(),
      error: null
    });
  }

  private row() {
    if (this.table === "storycam_sessions") {
      return {
        core_group_target_count: 1,
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        generation_mode: "mock",
        id: "session-1",
        planned_duration_seconds: 12,
        status: "draft",
        updated_at: "2026-04-26T00:00:00.000Z",
        user_id: "user-1"
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
