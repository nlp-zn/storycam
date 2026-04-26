import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MediaAssetRow } from "@/server/db/types";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { StoryCamMediaStoreError, storyCamGeneratedBucket, uploadStoryCamObject } from "./mediaStore";

export const storyCamGeneratedVideoMimeType = "video/mp4";
export const storyCamGeneratedImageMimeTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export const storyCamGeneratedMediaMaxBytes = 500 * 1024 * 1024;
export const storyCamGeneratedImageMaxBytes = 25 * 1024 * 1024;

export type GeneratedStoryCamMediaKind = Extract<MediaAssetRow["kind"], "generated_clip" | "final_work" | "thumbnail">;
export type GeneratedStoryCamMediaSource = Extract<MediaAssetRow["source"], "provider" | "composer">;
export type GeneratedStoryCamImageMimeType = (typeof storyCamGeneratedImageMimeTypes)[number];

export type WriteGeneratedStoryCamMediaInput = {
  bytes: Uint8Array;
  kind: GeneratedStoryCamMediaKind;
  linkedArtifactId?: string | null;
  mimeType: string;
  sessionId: string;
  source?: GeneratedStoryCamMediaSource;
  userId: string;
};

export type WriteGeneratedStoryCamMediaResult = {
  bucket: typeof storyCamGeneratedBucket;
  byteSize: number;
  id: string;
  mimeType: string;
  path: string;
};

export async function writeGeneratedStoryCamMedia(
  client: SupabaseClient<Database>,
  input: WriteGeneratedStoryCamMediaInput
) {
  const validated = validateGeneratedStoryCamMedia({
    byteSize: input.bytes.byteLength,
    kind: input.kind,
    mimeType: input.mimeType
  });
  const path = buildGeneratedStoragePath({
    kind: input.kind,
    extension: validated.extension,
    sessionId: input.sessionId,
    userId: input.userId
  });

  await uploadStoryCamObject(client, storyCamGeneratedBucket, path, input.bytes, validated.mimeType);

  const mediaAsset = await new StoryCamMediaAssetRepository(client).create(input.userId, {
    byteSize: validated.byteSize,
    kind: input.kind,
    linkedArtifactId: input.linkedArtifactId ?? null,
    mimeType: validated.mimeType,
    sessionId: input.sessionId,
    source: input.source ?? sourceForGeneratedKind(input.kind),
    storageBucket: storyCamGeneratedBucket,
    storagePath: path
  });

  if (!mediaAsset) {
    throw new Error("StoryCam generated media write failed to create media metadata.");
  }

  return {
    bucket: storyCamGeneratedBucket,
    byteSize: mediaAsset.byte_size,
    id: mediaAsset.id,
    mimeType: mediaAsset.mime_type,
    path: mediaAsset.storage_path
  } satisfies WriteGeneratedStoryCamMediaResult;
}

export function validateGeneratedStoryCamMedia(input: { byteSize: number; kind: GeneratedStoryCamMediaKind; mimeType: string }) {
  if (input.kind === "thumbnail") {
    if (!storyCamGeneratedImageMimeTypes.includes(input.mimeType as GeneratedStoryCamImageMimeType)) {
      throw new StoryCamMediaStoreError("invalid_mime_type");
    }

    if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > storyCamGeneratedImageMaxBytes) {
      throw new StoryCamMediaStoreError("invalid_size");
    }

    return {
      byteSize: input.byteSize,
      extension: extensionForGeneratedImageMimeType(input.mimeType as GeneratedStoryCamImageMimeType),
      mimeType: input.mimeType as GeneratedStoryCamImageMimeType
    };
  }

  if (input.mimeType !== storyCamGeneratedVideoMimeType) {
    throw new StoryCamMediaStoreError("invalid_mime_type");
  }

  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > storyCamGeneratedMediaMaxBytes) {
    throw new StoryCamMediaStoreError("invalid_size");
  }

  return {
    byteSize: input.byteSize,
    extension: "mp4",
    mimeType: storyCamGeneratedVideoMimeType
  };
}

function buildGeneratedStoragePath(input: {
  extension?: string;
  kind: GeneratedStoryCamMediaKind;
  mediaId?: string;
  sessionId: string;
  userId: string;
}) {
  return `users/${sanitizePathSegment(input.userId)}/sessions/${sanitizePathSegment(input.sessionId)}/generated/${directoryForGeneratedKind(
    input.kind
  )}/${sanitizePathSegment(input.mediaId ?? randomUUID())}.${sanitizeExtension(input.extension ?? "mp4")}`;
}

function sourceForGeneratedKind(kind: GeneratedStoryCamMediaKind): GeneratedStoryCamMediaSource {
  switch (kind) {
    case "generated_clip":
      return "provider";
    case "final_work":
      return "composer";
    case "thumbnail":
      return "provider";
  }
}

function directoryForGeneratedKind(kind: GeneratedStoryCamMediaKind) {
  switch (kind) {
    case "generated_clip":
      return "clips";
    case "final_work":
      return "final";
    case "thumbnail":
      return "storyboards";
  }
}

function extensionForGeneratedImageMimeType(mimeType: GeneratedStoryCamImageMimeType) {
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
