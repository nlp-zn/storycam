import { randomUUID } from "node:crypto";

export const storyCamUploadBucket = "storycam-uploads";
export const storyCamGeneratedBucket = "storycam-generated";
export const storyCamMockBucket = "storycam-mock";

export const storyCamPrivateBuckets = [storyCamUploadBucket, storyCamGeneratedBucket, storyCamMockBucket] as const;
export const storyCamAllowedUploadMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const storyCamUploadMaxBytes = 10 * 1024 * 1024;
export const storyCamSignedUrlTtlSeconds = 60 * 5;

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

export class StoryCamMediaStoreError extends Error {
  constructor(
    readonly code: "invalid_mime_type" | "invalid_size" | "invalid_bucket" | "signed_url_failed"
  ) {
    super(`StoryCam media store error: ${code}`);
    this.name = "StoryCamMediaStoreError";
  }
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

export function assertStoryCamPrivateBucket(bucket: string): asserts bucket is StoryCamPrivateBucket {
  if (!storyCamPrivateBuckets.includes(bucket as StoryCamPrivateBucket)) {
    throw new StoryCamMediaStoreError("invalid_bucket");
  }
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
