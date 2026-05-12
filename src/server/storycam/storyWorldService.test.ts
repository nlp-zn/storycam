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
              video_aspect_ratio: "16:9"
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
        video_aspect_ratio: this.updated?.video_aspect_ratio ?? this.inserted?.video_aspect_ratio ?? "16:9"
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
