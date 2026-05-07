import { describe, expect, it } from "vitest";
import {
  buildUploadStoragePath,
  createStoryCamProviderReferenceSignedUrl,
  createStoryCamSignedUrl,
  StoryCamMediaStoreError,
  storyCamProviderReferenceSignedUrlTtlSeconds,
  storyCamSignedUrlTtlSeconds,
  storyCamUploadMaxBytes,
  validateUploadPhoto
} from "./mediaStore";

describe("StoryCam media store", () => {
  it("accepts only safe image upload types within the size limit", () => {
    expect(validateUploadPhoto({ byteSize: 1024, mimeType: "image/jpeg" })).toEqual({
      byteSize: 1024,
      extension: "jpg",
      mimeType: "image/jpeg"
    });
    expect(validateUploadPhoto({ byteSize: storyCamUploadMaxBytes, mimeType: "image/webp" })).toMatchObject({
      extension: "webp"
    });
  });

  it("rejects unsupported file types and invalid sizes", () => {
    expect(() => validateUploadPhoto({ byteSize: 1024, mimeType: "image/gif" })).toThrow(StoryCamMediaStoreError);
    expect(() => validateUploadPhoto({ byteSize: 0, mimeType: "image/png" })).toThrow(StoryCamMediaStoreError);
    expect(() => validateUploadPhoto({ byteSize: storyCamUploadMaxBytes + 1, mimeType: "image/png" })).toThrow(
      StoryCamMediaStoreError
    );
  });

  it("builds upload object paths under the owning user and session", () => {
    expect(
      buildUploadStoragePath({
        extension: "jpg",
        mediaId: "media-1",
        sessionId: "session-1",
        userId: "user-1"
      })
    ).toBe("users/user-1/sessions/session-1/uploads/media-1.jpg");
  });

  it("sanitizes upload object path segments", () => {
    expect(
      buildUploadStoragePath({
        extension: "../JPG",
        mediaId: "media/1",
        sessionId: "session/1",
        userId: "user/1"
      })
    ).toBe("users/user_1/sessions/session_1/uploads/media_1.jpg");
  });

  it("creates short-lived signed URLs only for StoryCam private buckets", async () => {
    const client = new FakeStorageClient("https://signed.example/token");

    const signedUrl = await createStoryCamSignedUrl(client, "storycam-uploads", "users/user-1/file.jpg");

    expect(signedUrl).toBe("https://signed.example/token");
    expect(client.calls).toEqual([
      {
        bucket: "storycam-uploads",
        expiresIn: storyCamSignedUrlTtlSeconds,
        path: "users/user-1/file.jpg"
      }
    ]);
    await expect(createStoryCamSignedUrl(client, "public" as "storycam-uploads", "x")).rejects.toMatchObject({
      code: "invalid_bucket"
    });
  });

  it("creates provider reference signed URLs with a longer default TTL", async () => {
    const client = new FakeStorageClient("https://storycam-dev.supabase.co/storage/v1/object/sign/storycam-generated/token");

    const signedUrl = await createStoryCamProviderReferenceSignedUrl(client, "storycam-generated", "users/user-1/file.png");

    expect(signedUrl).toContain("storycam-dev.supabase.co");
    expect(client.calls).toEqual([
      {
        bucket: "storycam-generated",
        expiresIn: storyCamProviderReferenceSignedUrlTtlSeconds,
        path: "users/user-1/file.png"
      }
    ]);
  });

  it("rejects provider reference URLs that are not public HTTPS URLs", async () => {
    await expect(
      createStoryCamProviderReferenceSignedUrl(
        new FakeStorageClient("http://127.0.0.1:54321/storage/v1/object/sign/storycam-generated/token"),
        "storycam-generated",
        "users/user-1/file.png"
      )
    ).rejects.toMatchObject({
      code: "provider_reference_url_not_public"
    });

    await expect(
      createStoryCamProviderReferenceSignedUrl(
        new FakeStorageClient("https://localhost/storage/v1/object/sign/storycam-generated/token"),
        "storycam-generated",
        "users/user-1/file.png"
      )
    ).rejects.toMatchObject({
      code: "provider_reference_url_not_public"
    });

    await expect(
      createStoryCamProviderReferenceSignedUrl(
        new FakeStorageClient("https://192.168.1.10/storage/v1/object/sign/storycam-generated/token"),
        "storycam-generated",
        "users/user-1/file.png"
      )
    ).rejects.toMatchObject({
      code: "provider_reference_url_not_public"
    });
  });
});

class FakeStorageClient {
  readonly calls: Array<{ bucket: string; expiresIn: number; path: string }> = [];

  constructor(private readonly signedUrl: string) {}

  readonly storage = {
    from: (bucket: string) => ({
      createSignedUrl: (path: string, expiresIn: number) => {
        this.calls.push({ bucket, expiresIn, path });
        return Promise.resolve({
          data: { signedUrl: this.signedUrl },
          error: null
        });
      }
    })
  };
}
