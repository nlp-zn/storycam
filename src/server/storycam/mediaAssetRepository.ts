import type { MediaAssetRow } from "@/server/db/types";
import type { StoryCamDbClient } from "./sessionRepository";
import { unwrapRepositoryResult } from "./repositoryErrors";

export type CreateMediaAssetInput = {
  byteSize: number;
  kind: MediaAssetRow["kind"];
  linkedArtifactId?: string | null;
  mimeType: string;
  sessionId: string;
  source: MediaAssetRow["source"];
  storageBucket: string;
  storagePath: string;
};

const mediaColumns =
  "id,user_id,session_id,kind,mime_type,byte_size,storage_bucket,storage_path,source,linked_artifact_id,created_at,deleted_at" as const;

export class StoryCamMediaAssetRepository {
  constructor(private readonly client: StoryCamDbClient) {}

  async create(userId: string, input: CreateMediaAssetInput) {
    const { data, error } = await this.client
      .from("media_assets")
      .insert({
        user_id: userId,
        session_id: input.sessionId,
        kind: input.kind,
        mime_type: input.mimeType,
        byte_size: input.byteSize,
        storage_bucket: input.storageBucket,
        storage_path: input.storagePath,
        source: input.source,
        linked_artifact_id: input.linkedArtifactId ?? null
      })
      .select(mediaColumns)
      .single();

    return unwrapRepositoryResult("create_media_asset", data, error);
  }

  async listBySession(userId: string, sessionId: string) {
    const { data, error } = await this.client
      .from("media_assets")
      .select(mediaColumns)
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    return unwrapRepositoryResult("list_media_assets", data, error);
  }

  async listStorageCleanupCandidates(userId: string, sessionId: string) {
    const { data, error } = await this.client
      .from("media_assets")
      .select(mediaColumns)
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    return unwrapRepositoryResult("list_storage_cleanup_media_assets", data, error);
  }

  async findLatestThumbnailByLinkedArtifact(userId: string, input: { linkedArtifactId: string; sessionId: string }) {
    const { data, error } = await this.client
      .from("media_assets")
      .select(mediaColumns)
      .eq("user_id", userId)
      .eq("session_id", input.sessionId)
      .eq("linked_artifact_id", input.linkedArtifactId)
      .eq("kind", "thumbnail")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return unwrapRepositoryResult<MediaAssetRow | null>("find_latest_thumbnail_by_linked_artifact", data, error);
  }
}
