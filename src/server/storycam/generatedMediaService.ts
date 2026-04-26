import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MediaAssetRow } from "@/server/db/types";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { StoryCamMediaStoreError, storyCamGeneratedBucket, uploadStoryCamObject } from "./mediaStore";

export const storyCamGeneratedVideoMimeType = "video/mp4";
export const storyCamGeneratedMediaMaxBytes = 500 * 1024 * 1024;

export type GeneratedStoryCamMediaKind = Extract<MediaAssetRow["kind"], "generated_clip" | "final_work">;
export type GeneratedStoryCamMediaSource = Extract<MediaAssetRow["source"], "provider" | "composer">;

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
    mimeType: input.mimeType
  });
  const path = buildGeneratedStoragePath({
    kind: input.kind,
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

export function validateGeneratedStoryCamMedia(input: { byteSize: number; mimeType: string }) {
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
  kind: GeneratedStoryCamMediaKind;
  mediaId?: string;
  sessionId: string;
  userId: string;
}) {
  return `users/${sanitizePathSegment(input.userId)}/sessions/${sanitizePathSegment(input.sessionId)}/generated/${directoryForGeneratedKind(
    input.kind
  )}/${sanitizePathSegment(input.mediaId ?? randomUUID())}.mp4`;
}

function sourceForGeneratedKind(kind: GeneratedStoryCamMediaKind): GeneratedStoryCamMediaSource {
  switch (kind) {
    case "generated_clip":
      return "provider";
    case "final_work":
      return "composer";
  }
}

function directoryForGeneratedKind(kind: GeneratedStoryCamMediaKind) {
  switch (kind) {
    case "generated_clip":
      return "clips";
    case "final_work":
      return "final";
  }
}

function sanitizePathSegment(segment: string) {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "_");
}
