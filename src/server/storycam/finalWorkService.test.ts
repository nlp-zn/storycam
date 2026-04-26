import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FfmpegComposerInput, FfmpegComposerOutput } from "@/lib/providers/finalWork/ffmpegComposer";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type { FinalWorkComposer } from "@/lib/providers/types";
import type { Database } from "@/server/db/types";
import { composeAndStoreFinalWork } from "./finalWorkService";

const baseInput = {
  clips: [
    {
      bytes: new TextEncoder().encode("clip-1"),
      durationSeconds: 4,
      generatedClipId: "generated-clip-1"
    }
  ],
  inputArtifactVersions: { "generated-clip-1": 1 },
  sessionId: "session-1",
  userId: "user-1"
};

describe("composeAndStoreFinalWork", () => {
  it("uploads one clip final work to generated storage and writes media/artifact metadata", async () => {
    const client = new FakeSupabaseClient();

    const result = await composeAndStoreFinalWork(client.asSupabaseClient(), successComposer("final"), baseInput);

    expect(result).toMatchObject({
      ok: true,
      providerKind: "stitch",
      providerName: "ffmpeg"
    });
    expect(result.ok && result.value.finalWork).toMatchObject({
      generatedClipIds: ["generated-clip-1"],
      mediaAssetId: "media-final-1",
      previewStatus: "ready"
    });
    expect(client.uploads[0]).toMatchObject({
      bucket: "storycam-generated",
      contentType: "video/mp4",
      upsert: false
    });
    expect(client.queries[0]?.table).toBe("media_assets");
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        kind: "final_work",
        mime_type: "video/mp4",
        source: "composer",
        storage_bucket: "storycam-generated",
        user_id: "user-1"
      })
    ]);
    expect(client.queries[1]?.table).toBe("storycam_artifacts");
    expect(client.queries[1]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        state: "ready",
        type: "final_work",
        user_id: "user-1"
      })
    ]);
  });

  it("preserves composer failures without writing storage or metadata", async () => {
    const client = new FakeSupabaseClient();
    const composer: FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput> = {
      providerKind: "stitch",
      providerName: "ffmpeg",
      async compose() {
        return providerFailure(this, new Error("ffmpeg missing with secret path"), {
          errorCode: "FFMPEG_NOT_CONFIGURED",
          retryable: false
        });
      }
    };

    const result = await composeAndStoreFinalWork(client.asSupabaseClient(), composer, baseInput);

    expect(result).toMatchObject({
      errorCode: "FFMPEG_NOT_CONFIGURED",
      ok: false,
      redactionApplied: true
    });
    expect(client.uploads).toEqual([]);
    expect(client.queries).toEqual([]);
  });
});

function successComposer(bytes: string): FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput> {
  return {
    providerKind: "stitch",
    providerName: "ffmpeg",
    async compose(input) {
      return providerSuccess(this, {
        bytes: new TextEncoder().encode(bytes),
        durationSeconds: input.clips.reduce((sum, clip) => sum + clip.durationSeconds, 0)
      });
    }
  };
}

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly uploads: Array<{ bucket: string; byteSize: number; contentType: string; path: string; upsert: boolean }> = [];

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  readonly storage = {
    from: (bucket: string) => ({
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
    const query = new FakeQuery(table);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];
  private inserted: Record<string, unknown> | null = null;

  constructor(readonly table: string) {}

  insert(value: Record<string, unknown>) {
    this.inserted = value;
    this.calls.push(["insert", value]);
    return this;
  }

  select(columns: string) {
    this.calls.push(["select", columns]);
    return this;
  }

  single() {
    return Promise.resolve({
      data: this.row(),
      error: null
    });
  }

  private row() {
    if (this.table === "media_assets") {
      return {
        id: "media-final-1",
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        ...this.inserted
      };
    }

    if (this.table === "storycam_artifacts") {
      return {
        id: "artifact-final-1",
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        stale_at: null,
        updated_at: "2026-04-26T00:00:00.000Z",
        ...this.inserted
      };
    }

    return this.inserted;
  }
}
