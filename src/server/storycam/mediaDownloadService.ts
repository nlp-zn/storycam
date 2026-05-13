import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/types";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { assertStoryCamPrivateBucket, downloadStoryCamObject } from "./mediaStore";

export type StoryCamMediaDownload = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
};

export class StoryCamMediaDownloadError extends Error {
  constructor(readonly code: "invalid_media_id" | "media_not_found") {
    super(`StoryCam media download error: ${code}`);
    this.name = "StoryCamMediaDownloadError";
  }
}

export async function downloadFinalWorkMp4(
  client: SupabaseClient<Database>,
  userId: string,
  mediaId: string
): Promise<StoryCamMediaDownload> {
  const normalizedMediaId = mediaId.trim();

  if (!normalizedMediaId) {
    throw new StoryCamMediaDownloadError("invalid_media_id");
  }

  const media = await new StoryCamMediaAssetRepository(client).findById(userId, normalizedMediaId);

  if (!media || media.kind !== "final_work" || media.mime_type !== "video/mp4") {
    throw new StoryCamMediaDownloadError("media_not_found");
  }

  assertStoryCamPrivateBucket(media.storage_bucket);

  return {
    bytes: await downloadStoryCamObject(client, media.storage_bucket, media.storage_path),
    filename: "storycam-final-work.mp4",
    mimeType: media.mime_type
  };
}
