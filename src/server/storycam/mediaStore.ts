import { randomUUID } from "node:crypto";

export const storyCamUploadBucket = "storycam-uploads";
export const storyCamGeneratedBucket = "storycam-generated";
export const storyCamMockBucket = "storycam-mock";

export const storyCamPrivateBuckets = [storyCamUploadBucket, storyCamGeneratedBucket, storyCamMockBucket] as const;
export const storyCamAllowedUploadMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const storyCamUploadMaxBytes = 10 * 1024 * 1024;
export const storyCamSignedUrlTtlSeconds = 60 * 5;
export const storyCamProviderReferenceSignedUrlTtlSeconds = 60 * 60;

export type StoryCamUploadMimeType = (typeof storyCamAllowedUploadMimeTypes)[number];
export type StoryCamPrivateBucket = (typeof storyCamPrivateBuckets)[number];

export type UploadPhotoValidationInput = {
  byteSize: number;
  mimeType: string;
};

export type BuildUploadStoragePathInput = {
  extension?: string;
  mediaId?: string;
  sessionId: string;
  userId: string;
};

export type SignedUrlStorageClient = {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expiresIn: number): Promise<{
        data: { signedUrl: string } | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

export type UploadStorageClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array,
        options: { contentType: string; upsert: false }
      ): Promise<{
        data: { path: string } | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

export type DownloadStorageClient = {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{
        data: Blob | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

export type StoryCamStorageClient = SignedUrlStorageClient & UploadStorageClient & DownloadStorageClient;

export class StoryCamMediaStoreError extends Error {
  constructor(
    readonly code:
      | "download_failed"
      | "invalid_mime_type"
      | "invalid_size"
      | "invalid_bucket"
      | "provider_reference_url_not_public"
      | "signed_url_failed"
      | "upload_failed"
  ) {
    super(`StoryCam media store error: ${code}`);
    this.name = "StoryCamMediaStoreError";
  }
}

export async function uploadStoryCamObject(
  client: UploadStorageClient,
  bucket: StoryCamPrivateBucket,
  path: string,
  body: Uint8Array,
  mimeType: string
) {
  assertStoryCamPrivateBucket(bucket);

  const { data, error } = await client.storage.from(bucket).upload(path, body, {
    contentType: mimeType,
    upsert: false
  });

  if (error || !data?.path) {
    throw new StoryCamMediaStoreError("upload_failed");
  }

  return data.path;
}

export function validateUploadPhoto(input: UploadPhotoValidationInput) {
  if (!storyCamAllowedUploadMimeTypes.includes(input.mimeType as StoryCamUploadMimeType)) {
    throw new StoryCamMediaStoreError("invalid_mime_type");
  }

  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > storyCamUploadMaxBytes) {
    throw new StoryCamMediaStoreError("invalid_size");
  }

  return {
    byteSize: input.byteSize,
    extension: extensionForUploadMimeType(input.mimeType as StoryCamUploadMimeType),
    mimeType: input.mimeType as StoryCamUploadMimeType
  };
}

export function buildUploadStoragePath(input: BuildUploadStoragePathInput) {
  const mediaId = sanitizePathSegment(input.mediaId ?? randomUUID());
  const extension = sanitizeExtension(input.extension ?? "bin");

  return `users/${sanitizePathSegment(input.userId)}/sessions/${sanitizePathSegment(input.sessionId)}/uploads/${mediaId}.${extension}`;
}

export async function createStoryCamSignedUrl(
  client: SignedUrlStorageClient,
  bucket: StoryCamPrivateBucket,
  path: string,
  expiresIn = storyCamSignedUrlTtlSeconds
) {
  assertStoryCamPrivateBucket(bucket);

  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    throw new StoryCamMediaStoreError("signed_url_failed");
  }

  return data.signedUrl;
}

export async function createStoryCamProviderReferenceSignedUrl(
  client: SignedUrlStorageClient,
  bucket: StoryCamPrivateBucket,
  path: string,
  expiresIn = storyCamProviderReferenceSignedUrlTtlSeconds
) {
  const signedUrl = await createStoryCamSignedUrl(client, bucket, path, expiresIn);

  if (!isPublicHttpsProviderReferenceUrl(signedUrl)) {
    throw new StoryCamMediaStoreError("provider_reference_url_not_public");
  }

  return signedUrl;
}

export async function downloadStoryCamObject(client: DownloadStorageClient, bucket: StoryCamPrivateBucket, path: string) {
  assertStoryCamPrivateBucket(bucket);

  const { data, error } = await client.storage.from(bucket).download(path);

  if (error || !data) {
    throw new StoryCamMediaStoreError("download_failed");
  }

  return new Uint8Array(await data.arrayBuffer());
}

export function assertStoryCamPrivateBucket(bucket: string): asserts bucket is StoryCamPrivateBucket {
  if (!storyCamPrivateBuckets.includes(bucket as StoryCamPrivateBucket)) {
    throw new StoryCamMediaStoreError("invalid_bucket");
  }
}

export function isPublicHttpsProviderReferenceUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "::1" &&
      !isPrivateIpv4Hostname(hostname) &&
      !hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

function isPrivateIpv4Hostname(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first = 0, second = 0] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function extensionForUploadMimeType(mimeType: StoryCamUploadMimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

function sanitizeExtension(extension: string) {
  return extension.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

function sanitizePathSegment(segment: string) {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "_");
}
