import { describe, expect, it } from "vitest";
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
          characterAssets: [{ type: "character_asset", version: 1 }],
          sceneAssets: [{ type: "scene_asset", version: 1 }],
          script: { type: "script", version: 1 }
        },
        sessionId: "session-1"
      }
    });
    expect(client.queries[0]?.table).toBe("storycam_sessions");
    expect(client.queries.filter((query) => query.table === "storycam_artifacts")).toHaveLength(3);
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
              status: "draft",
              updated_at: "2026-04-26T00:00:00.000Z",
              user_id: "user-1"
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
        generation_mode: this.inserted?.generation_mode ?? "mock",
        id: "session-1",
        planned_duration_seconds: this.inserted?.planned_duration_seconds ?? 12,
        status: this.inserted?.status ?? "draft",
        updated_at: "2026-04-26T00:00:00.000Z",
        user_id: this.inserted?.user_id ?? "user-1"
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
