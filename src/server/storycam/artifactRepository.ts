import type { ArtifactState, ArtifactType } from "@/features/storycam/domain/artifacts";
import type { Json, StoryCamArtifactRow } from "@/server/db/types";
import type { StoryCamDbClient } from "./sessionRepository";
import { unwrapRepositoryResult } from "./repositoryErrors";

export type CreateStoryCamArtifactInput = {
  dataJson?: Json;
  dependsOnJson?: Json;
  parentArtifactId?: string | null;
  sessionId: string;
  state?: ArtifactState;
  type: ArtifactType;
  version: number;
};

export type ListStoryCamArtifactsInput = {
  sessionId: string;
  type?: ArtifactType;
};

const artifactColumns =
  "id,user_id,session_id,type,state,version,parent_artifact_id,data_json,depends_on_json,created_at,updated_at,stale_at,deleted_at" as const;

export class StoryCamArtifactRepository {
  constructor(private readonly client: StoryCamDbClient) {}

  async createVersion(userId: string, input: CreateStoryCamArtifactInput) {
    const { data, error } = await this.client
      .from("storycam_artifacts")
      .insert({
        user_id: userId,
        session_id: input.sessionId,
        type: input.type,
        state: input.state ?? "ready",
        version: input.version,
        parent_artifact_id: input.parentArtifactId ?? null,
        data_json: input.dataJson ?? {},
        depends_on_json: input.dependsOnJson ?? {}
      })
      .select(artifactColumns)
      .single();

    return unwrapRepositoryResult("create_artifact_version", data, error);
  }

  async listBySession(userId: string, input: ListStoryCamArtifactsInput) {
    const query = this.client
      .from("storycam_artifacts")
      .select(artifactColumns)
      .eq("user_id", userId)
      .eq("session_id", input.sessionId)
      .is("deleted_at", null);

    if (input.type) {
      query.eq("type", input.type);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    return unwrapRepositoryResult("list_artifacts", data, error);
  }

  async findLatestByType(userId: string, sessionId: string, type: ArtifactType) {
    const { data, error } = await this.client
      .from("storycam_artifacts")
      .select(artifactColumns)
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("type", type)
      .is("deleted_at", null)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    return unwrapRepositoryResult<StoryCamArtifactRow | null>("find_latest_artifact", data, error);
  }
}
