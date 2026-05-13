import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/types";
import { createStoryWorld, parseStoryWorldRequest, StoryWorldRequestError } from "./storyWorldService";

describe("story world service", () => {
  it("creates a session and writes script, character, and scene artifacts in mock mode", async () => {
    const client = new FakeSupabaseClient();

    const result = await createStoryWorld(client.asSupabaseClient(), "user-1", {
      input: "我想把暗恋拍成韩剧雨夜",
      lightweightChoices: ["rainy"],
      plannedDurationSeconds: 12
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        artifacts: {
          characterAssets: expect.arrayContaining([
            expect.objectContaining({ id: "character-rainy-crush-lead-artifact", type: "character_asset", version: 1 }),
            expect.objectContaining({ id: "character-rainy-crush-counterpart-artifact", type: "character_asset", version: 1 })
          ]),
          sceneAssets: [{ type: "scene_asset", version: 1 }],
          script: { type: "script", version: 1 }
        },
        sessionId: "session-1",
        videoAspectRatio: "16:9",
        storyWorld: {
          characterAssets: expect.arrayContaining([
            expect.objectContaining({ name: "她" }),
            expect.objectContaining({ name: "他" })
          ]),
          sceneAssets: [expect.objectContaining({ name: "便利店外的玻璃反光" })],
          script: expect.objectContaining({ title: "雨夜未发送" })
        }
      }
    });
    expect(client.queries[0]?.table).toBe("storycam_sessions");
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        video_aspect_ratio: "16:9"
      })
    ]);
    expect(client.queries.filter((query) => query.table === "storycam_artifacts")).toHaveLength(4);
  });

  it("parses and stores a portrait video aspect ratio for new sessions", async () => {
    const client = new FakeSupabaseClient();

    const result = await createStoryWorld(client.asSupabaseClient(), "user-1", {
      input: "我想拍竖版小狗等主人",
      videoAspectRatio: "9:16"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        videoAspectRatio: "9:16"
      }
    });
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        video_aspect_ratio: "9:16"
      })
    ]);
  });

  it("updates an upload-created empty session to the requested portrait aspect ratio while preserving uploaded photo refs", async () => {
    const client = new FakeSupabaseClient({
      mediaRows: [
        {
          byte_size: 5,
          created_at: "2026-04-26T00:00:00.000Z",
          deleted_at: null,
          id: "photo-1",
          kind: "uploaded_photo",
          linked_artifact_id: null,
          mime_type: "image/jpeg",
          session_id: "session-1",
          source: "upload",
          storage_bucket: "storycam-uploads",
          storage_path: "users/user-1/sessions/session-1/uploads/private.jpg",
          user_id: "user-1"
        }
      ]
    });

    const result = await createStoryWorld(client.asSupabaseClient(), "user-1", {
      input: "我想用照片拍竖版小狗等主人",
      sessionId: "session-1",
      uploadedPhotoIds: ["photo-1"],
      videoAspectRatio: "9:16"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        videoAspectRatio: "9:16"
      }
    });
    expect(
      client.queries.find(
        (query) =>
          query.table === "storycam_sessions" &&
          query.calls.some((call) => call[0] === "update")
      )?.calls
    ).toContainEqual([
      "update",
      expect.objectContaining({
        video_aspect_ratio: "9:16"
      })
    ]);
    const artifactWrites = client.queries
      .filter((query) => query.table === "storycam_artifacts")
      .flatMap((query) => query.calls);

    expect(JSON.stringify(artifactWrites)).not.toContain("private.jpg");
    expect(artifactWrites.some((call) => JSON.stringify(call).includes("photo-1"))).toBe(true);
  });

  it("preserves an existing draft session aspect ratio when the request omits videoAspectRatio", async () => {
    const client = new FakeSupabaseClient({ sessionAspectRatio: "9:16" });

    const result = await createStoryWorld(client.asSupabaseClient(), "user-1", {
      input: "继续生成这个竖版故事",
      sessionId: "session-1"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        videoAspectRatio: "9:16"
      }
    });
    expect(
      client.queries
        .filter((query) => query.table === "storycam_sessions")
        .flatMap((query) => query.calls)
        .some((call) => call[0] === "update")
    ).toBe(false);
  });

  it("keeps uploaded photo refs as media ids and does not pass storage paths to the provider output", async () => {
    const client = new FakeSupabaseClient({
      mediaRows: [
        {
          byte_size: 5,
          created_at: "2026-04-26T00:00:00.000Z",
          deleted_at: null,
          id: "photo-1",
          kind: "uploaded_photo",
          linked_artifact_id: null,
          mime_type: "image/jpeg",
          session_id: "session-1",
          source: "upload",
          storage_bucket: "storycam-uploads",
          storage_path: "users/user-1/sessions/session-1/uploads/private.jpg",
          user_id: "user-1"
        }
      ]
    });

    const result = await createStoryWorld(client.asSupabaseClient(), "user-1", {
      input: "暗恋韩剧雨夜",
      sessionId: "session-1",
      uploadedPhotoIds: ["photo-1"]
    });

    expect(result.ok).toBe(true);
    const artifactWrites = client.queries
      .filter((query) => query.table === "storycam_artifacts")
      .flatMap((query) => query.calls);

    expect(JSON.stringify(artifactWrites)).not.toContain("private.jpg");
    expect(artifactWrites.some((call) => JSON.stringify(call).includes("photo-1"))).toBe(true);
  });

  it("passes lightweight choices to the configured text provider", async () => {
    const client = new FakeSupabaseClient();
    const provider = {
      providerKind: "text" as const,
      providerName: "test-provider",
      generate: vi.fn().mockResolvedValue({
        ok: true,
        providerKind: "text",
        providerName: "test-provider",
        value: {
          characterAssets: [
            {
              consistencyNotes: ["动作克制"],
              emotionalBaseline: "少台词，用停顿表达情绪",
              id: "character-test-1",
              name: "她",
              props: ["手机"],
              referenceMediaIds: [],
              relationshipToUserStory: "承载用户的私人记忆",
              role: "主角",
              sessionId: "session-1",
              stableVisualDescription: "浅色外套，低头握着手机",
              state: "ready",
              version: 1
            }
          ],
          sceneAssets: [
            {
              atmosphere: "安静、克制",
              id: "scene-test-1",
              keyObjects: ["玻璃门"],
              light: "冷白灯",
              location: "街角店门口",
              name: "街角店门口",
              referenceMediaIds: [],
              scenePanels: [
                {
                  description: "街角店门口的玻璃门、屋檐和路灯在夜色里连成一个小空间。",
                  keyObjects: ["玻璃门", "屋檐", "路灯"],
                  purpose: "建立故事发生的主场景。",
                  shotType: "establishing",
                  title: "街角店门口"
                },
                {
                  description: "手机屏幕在门外亮起。",
                  keyObjects: ["手机屏幕", "玻璃门"],
                  purpose: "把未发送的情绪落到可见物件。",
                  shotType: "detail",
                  title: "亮起的手机"
                },
                {
                  description: "冷白店灯落在门口地面。",
                  keyObjects: ["冷白灯", "地面"],
                  purpose: "固定场景光线。",
                  shotType: "lighting",
                  title: "门口灯光"
                },
                {
                  description: "她在门外停下，手机亮起。",
                  keyObjects: ["玻璃门", "手机"],
                  purpose: "提供核心动作发生的位置。",
                  shotType: "medium",
                  title: "门外停顿"
                }
              ],
              sessionId: "session-1",
              spatialLogic: "她在门外停下，手机亮起",
              state: "ready",
              timeOfDay: "night",
              version: 1
            }
          ],
          script: {
            beats: ["她停在门外", "手机屏幕亮起"],
            id: "script-test-1",
            logline: "她在门外删掉一条短信。",
            sessionId: "session-1",
            state: "ready",
            summary: "手机光和玻璃反光让告别停住。",
            title: "门外短信",
            version: 1
          }
        }
      })
    };

    await createStoryWorld(
      client.asSupabaseClient(),
      "user-1",
      {
        input: "我想把暗恋拍成韩剧雨夜",
        lightweightChoices: ["像旧照片"]
      },
      provider
    );

    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        idea: "我想把暗恋拍成韩剧雨夜",
        lightweightChoices: ["像旧照片"]
      })
    );
  });

  it("passes handdrawn travel mode fields to the provider and persists the mode on the script artifact", async () => {
    const client = new FakeSupabaseClient({
      mediaRows: [
        {
          byte_size: 5,
          created_at: "2026-04-26T00:00:00.000Z",
          deleted_at: null,
          id: "photo-1",
          kind: "uploaded_photo",
          linked_artifact_id: null,
          mime_type: "image/jpeg",
          session_id: "session-1",
          source: "upload",
          storage_bucket: "storycam-uploads",
          storage_path: "users/user-1/sessions/session-1/uploads/private.jpg",
          user_id: "user-1"
        }
      ]
    });
    const provider = {
      providerKind: "text" as const,
      providerName: "test-provider",
      generate: vi.fn().mockResolvedValue({
        ok: true,
        providerKind: "text",
        providerName: "test-provider",
        value: travelStoryWorldOutput()
      })
    };

    const result = await createStoryWorld(
      client.asSupabaseClient(),
      "user-1",
      {
        input: "我想做一个手绘旅行 VLOG",
        lightweightChoices: ["手绘角色感"],
        sessionId: "session-1",
        storyModeId: "handdrawn-travel-vlog",
        travelDestination: "葡萄牙里斯本阿尔法玛",
        uploadedPhotoIds: ["photo-1"]
      },
      provider
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        storyWorld: {
          script: expect.objectContaining({
            storyModeId: "handdrawn-travel-vlog"
          })
        }
      }
    });
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        storyModeId: "handdrawn-travel-vlog",
        travelDestination: "葡萄牙里斯本阿尔法玛",
        uploadedPhotoRefs: [{ mediaAssetId: "photo-1" }]
      })
    );
    const scriptArtifactWrite = client.queries
      .filter((query) => query.table === "storycam_artifacts")
      .flatMap((query) => query.calls)
      .find((call) => call[0] === "insert" && JSON.stringify(call).includes("script-travel-1"));

    expect(scriptArtifactWrite).toEqual([
      "insert",
      expect.objectContaining({
        data_json: expect.objectContaining({
          storyModeId: "handdrawn-travel-vlog"
        })
      })
    ]);
  });

  it("rejects newly generated scene assets without multi-panel scene references", async () => {
    const client = new FakeSupabaseClient();
    const provider = {
      providerKind: "text" as const,
      providerName: "test-provider",
      generate: vi.fn().mockResolvedValue({
        ok: true,
        providerKind: "text",
        providerName: "test-provider",
        value: {
          characterAssets: [
            {
              consistencyNotes: ["动作克制"],
              emotionalBaseline: "少台词，用停顿表达情绪",
              id: "character-test-1",
              name: "她",
              props: ["手机"],
              referenceMediaIds: [],
              relationshipToUserStory: "承载用户的私人记忆",
              role: "主角",
              sessionId: "session-1",
              stableVisualDescription: "浅色外套，低头握着手机",
              state: "ready",
              version: 1
            }
          ],
          sceneAssets: [
            {
              atmosphere: "安静、克制",
              id: "scene-test-1",
              keyObjects: ["玻璃门"],
              light: "冷白灯",
              location: "街角店门口",
              name: "街角店门口",
              referenceMediaIds: [],
              sessionId: "session-1",
              spatialLogic: "她在门外停下，手机亮起",
              state: "ready",
              timeOfDay: "night",
              version: 1
            }
          ],
          script: {
            beats: ["她停在门外", "手机屏幕亮起"],
            id: "script-test-1",
            logline: "她在门外删掉一条短信。",
            sessionId: "session-1",
            state: "ready",
            summary: "手机光和玻璃反光让告别停住。",
            title: "门外短信",
            version: 1
          }
        }
      })
    };

    await expect(
      createStoryWorld(
        client.asSupabaseClient(),
        "user-1",
        {
          input: "我想把暗恋拍成韩剧雨夜"
        },
        provider
      )
    ).rejects.toThrow();
  });

  it("rejects empty and oversized input with redacted request errors", () => {
    expect(() => parseStoryWorldRequest({ input: "" })).toThrow(StoryWorldRequestError);
    expect(() => parseStoryWorldRequest({ input: "x".repeat(2_001) })).toThrow(StoryWorldRequestError);
  });

  it("rejects handdrawn travel VLOG without a photo or destination", () => {
    expect(() =>
      parseStoryWorldRequest({
        input: "我想做一个手绘旅行 VLOG",
        storyModeId: "handdrawn-travel-vlog",
        travelDestination: "里斯本"
      })
    ).toThrow(StoryWorldRequestError);
    expect(() =>
      parseStoryWorldRequest({
        input: "我想做一个手绘旅行 VLOG",
        storyModeId: "handdrawn-travel-vlog",
        uploadedPhotoIds: ["photo-1"]
      })
    ).toThrow(StoryWorldRequestError);
  });

  it("rejects uploaded photos that do not belong to the user session", async () => {
    const client = new FakeSupabaseClient({ mediaRows: [] });

    await expect(
      createStoryWorld(client.asSupabaseClient(), "user-1", {
        input: "暗恋韩剧雨夜",
        sessionId: "session-1",
        uploadedPhotoIds: ["missing-photo"]
      })
    ).rejects.toMatchObject({ code: "invalid_photos" });
  });
});

type FakeSupabaseClientOptions = {
  mediaRows?: unknown[];
  sessionAspectRatio?: "16:9" | "9:16";
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];

  constructor(private readonly options: FakeSupabaseClientOptions = {}) {}

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

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
              status: "draft",
              updated_at: "2026-04-26T00:00:00.000Z",
              user_id: "user-1",
              video_aspect_ratio: this.options.sessionAspectRatio ?? "16:9"
            }
          : null,
      error: null
    });
  }

  then(resolve: (value: { data: unknown; error: null }) => void, reject?: (reason: unknown) => void) {
    return Promise.resolve({
      data: this.table === "media_assets" ? (this.options.mediaRows ?? []) : [],
      error: null
    }).then(resolve, reject);
  }

  private row() {
    if (this.table === "storycam_sessions") {
      return {
        core_group_target_count: this.inserted?.core_group_target_count ?? 1,
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        generation_mode: this.updated?.generation_mode ?? this.inserted?.generation_mode ?? "mock",
        id: "session-1",
        planned_duration_seconds: this.updated?.planned_duration_seconds ?? this.inserted?.planned_duration_seconds ?? 12,
        status: this.updated?.status ?? this.inserted?.status ?? "draft",
        updated_at: "2026-04-26T00:00:00.000Z",
        user_id: this.inserted?.user_id ?? "user-1",
        video_aspect_ratio: this.updated?.video_aspect_ratio ?? this.inserted?.video_aspect_ratio ?? this.options.sessionAspectRatio ?? "16:9"
      };
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

    return this.inserted;
  }
}

function artifactRowId(inserted: Record<string, unknown> | null) {
  const dataJson = inserted?.data_json;

  if (dataJson && typeof dataJson === "object" && "id" in dataJson) {
    return `${String(dataJson.id)}-artifact`;
  }

  return `${String(inserted?.type)}-artifact`;
}

function travelStoryWorldOutput() {
  return {
    characterAssets: [
      {
        consistencyNotes: ["保持黑色中长发和粗框眼镜", "用手绘线条保留照片里的穿搭轮廓"],
        emotionalBaseline: "轻松、好奇，用走路和回头表达情绪",
        id: "character-travel-1",
        name: "手绘旅行者",
        props: ["小相机"],
        referenceMediaIds: ["photo-1"],
        relationshipToUserStory: "由用户照片转译出的手绘旅行主角",
        role: "主角",
        sessionId: "session-1",
        stableVisualDescription: "黑色中长发、粗框眼镜、松弛站姿的手绘小人",
        state: "ready",
        version: 1,
        wardrobe: "保留照片里的日常旅行穿搭轮廓"
      }
    ],
    sceneAssets: [
      {
        atmosphere: "阳光、松弛、真实旅行感",
        id: "scene-travel-1",
        keyObjects: ["石板路", "海边远景", "老城墙"],
        light: "午后自然光",
        location: "葡萄牙里斯本阿尔法玛",
        name: "里斯本阿尔法玛旅行路线",
        referenceMediaIds: [],
        scenePanels: [
          {
            description: "阿尔法玛老街的石板坡路、白墙和远处海面形成真实旅行路线入口。",
            keyObjects: ["石板坡路", "白墙", "海面"],
            purpose: "建立旅行地。",
            shotType: "establishing",
            title: "老街入口"
          },
          {
            description: "墙面瓷砖和小阳台花盆形成可反复出现的旅行细节。",
            keyObjects: ["瓷砖", "花盆", "阳台"],
            purpose: "固定目的地细节。",
            shotType: "detail",
            title: "瓷砖阳台"
          },
          {
            description: "午后光线从窄巷顶端落到石板路上。",
            keyObjects: ["午后光", "窄巷", "石板路"],
            purpose: "固定光线。",
            shotType: "lighting",
            title: "巷子光线"
          },
          {
            description: "空的观景台边缘和远处城市屋顶，预留手绘角色入画位置。",
            keyObjects: ["观景台", "屋顶", "栏杆"],
            purpose: "预留动作空间。",
            shotType: "wide",
            title: "观景台"
          }
        ],
        sessionId: "session-1",
        spatialLogic: "角色从老街入口走向观景台，途中经过瓷砖墙和窄巷光线。",
        state: "ready",
        timeOfDay: "afternoon",
        version: 1
      }
    ],
    script: {
      beats: ["手绘旅行者走进老街", "在瓷砖墙前停下拍照", "走到观景台看向海边"],
      id: "script-travel-1",
      logline: "一个手绘旅行者在真实老城里慢慢走出自己的 VLOG。",
      sessionId: "session-1",
      state: "ready",
      summary: "午后的老街、瓷砖墙和观景台，把一次轻松旅行变成一段手绘 VLOG。",
      title: "手绘旅行者的一小段路",
      version: 1,
      visualStyle: "手绘角色叠加真实旅行地摄影感背景"
    }
  };
}
