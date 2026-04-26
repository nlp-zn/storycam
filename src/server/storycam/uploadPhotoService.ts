import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/types";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import {
  buildUploadStoragePath,
  storyCamUploadBucket,
  uploadStoryCamObject,
  validateUploadPhoto
} from "./mediaStore";

export type UploadStoryCamPhotoInput = {
  file: File;
  sessionId: string;
  userId: string;
};

export type UploadStoryCamPhotoResult = {
  bucket: typeof storyCamUploadBucket;
  byteSize: number;
  id: string;
  mimeType: string;
  path: string;
};

export class StoryCamUploadRequestError extends Error {
  constructor(readonly code: "missing_session_id" | "missing_file") {
    super(`StoryCam upload request error: ${code}`);
    this.name = "StoryCamUploadRequestError";
  }
}

export async function uploadStoryCamPhoto(client: SupabaseClient<Database>, input: UploadStoryCamPhotoInput) {
  const validated = validateUploadPhoto({
    byteSize: input.file.size,
    mimeType: input.file.type
  });
  const path = buildUploadStoragePath({
    extension: validated.extension,
    sessionId: input.sessionId,
    userId: input.userId
  });

  await uploadStoryCamObject(client, storyCamUploadBucket, path, new Uint8Array(await input.file.arrayBuffer()), validated.mimeType);

  const mediaAsset = await new StoryCamMediaAssetRepository(client).create(input.userId, {
    byteSize: validated.byteSize,
    kind: "uploaded_photo",
    mimeType: validated.mimeType,
    sessionId: input.sessionId,
    source: "upload",
    storageBucket: storyCamUploadBucket,
    storagePath: path
  });

  if (!mediaAsset) {
    throw new Error("StoryCam upload failed to create media metadata.");
  }

  return {
    bucket: storyCamUploadBucket,
    byteSize: mediaAsset.byte_size,
    id: mediaAsset.id,
    mimeType: mediaAsset.mime_type,
    path: mediaAsset.storage_path
  } satisfies UploadStoryCamPhotoResult;
}

export async function parseUploadFormData(request: Request) {
  const formData = await request.formData();
  const sessionId = formData.get("sessionId");
  const file = formData.get("file");

  if (typeof sessionId !== "string" || !sessionId) {
    throw new StoryCamUploadRequestError("missing_session_id");
  }

  if (!(file instanceof File)) {
    throw new StoryCamUploadRequestError("missing_file");
  }

  return { file, sessionId };
}
