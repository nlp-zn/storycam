import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/types";
import { StoryCamMediaStoreError } from "./mediaStore";
import { writeGeneratedStoryCamMedia } from "./generatedMediaService";

describe("writeGeneratedStoryCamMedia", () => {
  it("uploads a generated clip to the private generated bucket and stores provider metadata", async () => {
    const client = new FakeSupabaseClient();

    const result = await writeGeneratedStoryCamMedia(client.asSupabaseClient(), {
      bytes: new Uint8Array([0, 1, 2, 3]),
      kind: "generated_clip",
      linkedArtifactId: "artifact-clip-1",
      mimeType: "video/mp4",
      sessionId: "session-1",
      userId: "user-1"
    });

    expect(result).toEqual({
      bucket: "storycam-generated",
      byteSize: 4,
      id: "media-1",
      mimeType: "video/mp4",
      path: result.path
    });
    expect(result.path).toMatch(/^users\/user-1\/sessions\/session-1\/generated\/clips\/.+\.mp4$/);
    expect(JSON.stringify(result)).not.toContain("signedUrl");
    expect(JSON.stringify(result)).not.toContain("publicUrl");
    expect(client.uploads).toEqual([
      {
        bucket: "storycam-generated",
        byteSize: 4,
        contentType: "video/mp4",
        path: result.path,
        upsert: false
      }
    ]);
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        byte_size: 4,
        kind: "generated_clip",
        linked_artifact_id: "artifact-clip-1",
        mime_type: "video/mp4",
        session_id: "session-1",
        source: "provider",
        storage_bucket: "storycam-generated",
        storage_path: result.path,
        user_id: "user-1"
      })
    ]);
  });

  it("uploads a final work to the generated bucket and stores composer metadata", async () => {
    const client = new FakeSupabaseClient();

    const result = await writeGeneratedStoryCamMedia(client.asSupabaseClient(), {
      bytes: new Uint8Array([4, 5, 6]),
      kind: "final_work",
      mimeType: "video/mp4",
      sessionId: "session-1",
      userId: "user-1"
    });

    expect(result.bucket).toBe("storycam-generated");
    expect(result.path).toMatch(/^users\/user-1\/sessions\/session-1\/generated\/final\/.+\.mp4$/);
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        byte_size: 3,
        kind: "final_work",
        linked_artifact_id: null,
        mime_type: "video/mp4",
        source: "composer",
        storage_bucket: "storycam-generated",
        storage_path: result.path
      })
    ]);
  });

  it("uploads a representative storyboard image to the generated bucket", async () => {
    const client = new FakeSupabaseClient();

    const result = await writeGeneratedStoryCamMedia(client.asSupabaseClient(), {
      bytes: new Uint8Array([1, 2, 3]),
      kind: "thumbnail",
      linkedArtifactId: "core-group-1",
      mimeType: "image/webp",
      sessionId: "session-1",
      userId: "user-1"
    });

    expect(result.bucket).toBe("storycam-generated");
    expect(result.path).toMatch(/^users\/user-1\/sessions\/session-1\/generated\/storyboards\/.+\.webp$/);
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        byte_size: 3,
        kind: "thumbnail",
        linked_artifact_id: "core-group-1",
        mime_type: "image/webp",
        source: "provider",
        storage_bucket: "storycam-generated",
        storage_path: result.path
      })
    ]);
  });

  it("rejects invalid MIME type and size before storage writes", async () => {
    const client = new FakeSupabaseClient();

    await expect(
      writeGeneratedStoryCamMedia(client.asSupabaseClient(), {
        bytes: new Uint8Array([1]),
        kind: "generated_clip",
        mimeType: "video/quicktime",
        sessionId: "session-1",
        userId: "user-1"
      })
    ).rejects.toMatchObject({ code: "invalid_mime_type" });
    await expect(
      writeGeneratedStoryCamMedia(client.asSupabaseClient(), {
        bytes: new Uint8Array(),
        kind: "final_work",
        mimeType: "video/mp4",
        sessionId: "session-1",
        userId: "user-1"
      })
    ).rejects.toMatchObject({ code: "invalid_size" });
    expect(client.uploads).toEqual([]);
    expect(client.queries).toEqual([]);
  });

  it("maps storage failures to redacted media store errors", async () => {
    const client = new FakeSupabaseClient({ uploadError: { message: "provider body and service role key stay hidden" } });

    await expect(
      writeGeneratedStoryCamMedia(client.asSupabaseClient(), {
        bytes: new Uint8Array([1]),
        kind: "generated_clip",
        mimeType: "video/mp4",
        sessionId: "session-1",
        userId: "user-1"
      })
    ).rejects.toBeInstanceOf(StoryCamMediaStoreError);
    await expect(
      writeGeneratedStoryCamMedia(client.asSupabaseClient(), {
        bytes: new Uint8Array([1]),
        kind: "generated_clip",
        mimeType: "video/mp4",
        sessionId: "session-1",
        userId: "user-1"
      })
    ).rejects.not.toThrow("service role key");
  });
});

type FakeResponse = {
  uploadError?: { message?: string } | null;
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly uploads: Array<{ bucket: string; byteSize: number; contentType: string; path: string; upsert: boolean }> = [];

  constructor(private readonly response: FakeResponse = {}) {}

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  readonly storage = {
    from: (bucket: string) => ({
      upload: (path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }) => {
        this.uploads.push({ bucket, byteSize: body.byteLength, contentType: options.contentType, path, upsert: options.upsert });
        return Promise.resolve({
          data: this.response.uploadError ? null : { path },
          error: this.response.uploadError ?? null
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
      data: {
        id: "media-1",
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        ...this.inserted
      },
      error: null
    });
  }
}
