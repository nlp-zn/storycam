import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/types";
import { parseUploadFormData, StoryCamUploadRequestError, uploadStoryCamPhoto } from "./uploadPhotoService";
import { StoryCamMediaStoreError } from "./mediaStore";

const mediaAsset = {
  id: "media-1",
  user_id: "user-1",
  session_id: "session-1",
  kind: "uploaded_photo",
  mime_type: "image/jpeg",
  byte_size: 5,
  storage_bucket: "storycam-uploads",
  storage_path: "users/user-1/sessions/session-1/uploads/media.jpg",
  source: "upload",
  linked_artifact_id: null,
  created_at: "2026-04-26T00:00:00.000Z",
  deleted_at: null
} as const;

describe("uploadStoryCamPhoto", () => {
  it("uploads a validated photo to the private upload bucket and stores media metadata", async () => {
    const client = new FakeSupabaseClient({ data: mediaAsset, error: null });

    const result = await uploadStoryCamPhoto(client.asSupabaseClient(), {
      file: new File(["hello"], "photo.jpg", { type: "image/jpeg" }),
      sessionId: "session-1",
      userId: "user-1"
    });

    expect(result).toEqual({
      bucket: "storycam-uploads",
      byteSize: 5,
      id: "media-1",
      mimeType: "image/jpeg",
      path: "users/user-1/sessions/session-1/uploads/media.jpg"
    });
    expect(client.uploads[0]).toMatchObject({
      bucket: "storycam-uploads",
      contentType: "image/jpeg",
      upsert: false
    });
    expect(client.uploads[0]?.path).toMatch(/^users\/user-1\/sessions\/session-1\/uploads\/.+\.jpg$/);
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        kind: "uploaded_photo",
        mime_type: "image/jpeg",
        session_id: "session-1",
        source: "upload",
        storage_bucket: "storycam-uploads",
        user_id: "user-1"
      })
    ]);
  });

  it("rejects invalid upload files before storage writes", async () => {
    const client = new FakeSupabaseClient({ data: mediaAsset, error: null });

    await expect(
      uploadStoryCamPhoto(client.asSupabaseClient(), {
        file: new File(["hello"], "photo.gif", { type: "image/gif" }),
        sessionId: "session-1",
        userId: "user-1"
      })
    ).rejects.toMatchObject({ code: "invalid_mime_type" });
    expect(client.uploads).toEqual([]);
  });

  it("maps storage failures to redacted media store errors", async () => {
    const client = new FakeSupabaseClient({
      data: mediaAsset,
      error: null,
      uploadError: { message: "signed url and service role key should stay hidden" }
    });

    await expect(
      uploadStoryCamPhoto(client.asSupabaseClient(), {
        file: new File(["hello"], "photo.jpg", { type: "image/jpeg" }),
        sessionId: "session-1",
        userId: "user-1"
      })
    ).rejects.toBeInstanceOf(StoryCamMediaStoreError);
    await expect(
      uploadStoryCamPhoto(client.asSupabaseClient(), {
        file: new File(["hello"], "photo.jpg", { type: "image/jpeg" }),
        sessionId: "session-1",
        userId: "user-1"
      })
    ).rejects.not.toThrow("service role key");
  });
});

describe("parseUploadFormData", () => {
  it("requires a session id and file", async () => {
    const formData = new FormData();
    formData.set("sessionId", "session-1");
    formData.set("file", new File(["hello"], "photo.jpg", { type: "image/jpeg" }));

    await expect(parseUploadFormData(new Request("https://storycam.test", { method: "POST", body: formData }))).resolves.toMatchObject({
      sessionId: "session-1"
    });
    await expect(parseUploadFormData(new Request("https://storycam.test", { method: "POST", body: new FormData() }))).rejects.toBeInstanceOf(
      StoryCamUploadRequestError
    );
  });
});

type FakeResponse = {
  data: unknown;
  error: { code?: string; message?: string } | null;
  uploadError?: { message?: string } | null;
};

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly uploads: Array<{ bucket: string; contentType: string; path: string; upsert: boolean }> = [];

  constructor(private readonly response: FakeResponse) {}

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  readonly storage = {
    from: (bucket: string) => ({
      upload: (path: string, _body: Uint8Array, options: { contentType: string; upsert: boolean }) => {
        this.uploads.push({ bucket, contentType: options.contentType, path, upsert: options.upsert });
        return Promise.resolve({
          data: this.response.uploadError ? null : { path },
          error: this.response.uploadError ?? null
        });
      }
    })
  };

  from(table: string) {
    const query = new FakeQuery(table, this.response);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];

  constructor(
    readonly table: string,
    private readonly response: FakeResponse
  ) {}

  insert(value: unknown) {
    this.calls.push(["insert", value]);
    return this;
  }

  select(columns: string) {
    this.calls.push(["select", columns]);
    return this;
  }

  single() {
    return Promise.resolve(this.response);
  }
}
