import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

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

describe("POST /api/uploads", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("uploads a safe image and returns refs usable by the story-world route", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const client = new FakeSupabaseClient();

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(uploadRequest(new File(["hello"], "photo.jpg", { type: "image/jpeg" })));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      media: {
        byteSize: 5,
        id: "media-1",
        kind: "uploaded_photo",
        mimeType: "image/jpeg"
      },
      uploadedPhotoIds: ["media-1"],
      uploadedPhotoRefs: [{ mediaAssetId: "media-1" }]
    });
    expect(JSON.stringify(body)).not.toContain("users/user-1/sessions/session-1/uploads/private.jpg");
    expect(client.uploads).toHaveLength(1);
  });

  it("rejects non-image uploads before writing storage", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const client = new FakeSupabaseClient();

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(uploadRequest(new File(["hello"], "script.js", { type: "application/javascript" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_mime_type" });
    expect(client.uploads).toEqual([]);
  });

  it("rejects oversized image uploads before writing storage", async () => {
    const { POST } = await import("@/app/api/uploads/route");
    const client = new FakeSupabaseClient();

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(uploadRequest(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_size" });
    expect(client.uploads).toEqual([]);
  });

  it("requires authentication", async () => {
    const { UnauthorizedError } = await import("@/server/auth/requireUser");
    const { POST } = await import("@/app/api/uploads/route");

    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await POST(uploadRequest(new File(["hello"], "photo.jpg", { type: "image/jpeg" })));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });
});

function uploadRequest(file: File) {
  const formData = new FormData();
  formData.set("sessionId", "session-1");
  formData.set("file", file);

  return new Request("https://storycam.test/api/uploads", {
    body: formData,
    method: "POST"
  });
}

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly uploads: Array<{ bucket: string; contentType: string; path: string; upsert: boolean }> = [];

  asSupabaseClient() {
    return this;
  }

  readonly storage = {
    from: (bucket: string) => ({
      upload: (path: string, _body: Uint8Array, options: { contentType: string; upsert: boolean }) => {
        this.uploads.push({ bucket, contentType: options.contentType, path, upsert: options.upsert });
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
    if (this.table === "media_assets") {
      return {
        byte_size: 5,
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        id: "media-1",
        kind: "uploaded_photo",
        linked_artifact_id: null,
        mime_type: "image/jpeg",
        session_id: "session-1",
        source: "upload",
        storage_bucket: "storycam-uploads",
        storage_path: "users/user-1/sessions/session-1/uploads/private.jpg",
        user_id: "user-1",
        ...this.inserted
      };
    }

    return this.inserted;
  }
}
