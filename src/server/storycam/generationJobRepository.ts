import type { GenerationJobRow, Json } from "@/server/db/types";
import type { StoryCamDbClient } from "./sessionRepository";
import { unwrapRepositoryResult } from "./repositoryErrors";

export type CreateGenerationJobInput = {
  generationMode?: GenerationJobRow["generation_mode"];
  idempotencyKeyHash: string;
  inputArtifactVersionsJson?: Json;
  maxAttempts?: number;
  providerKind: GenerationJobRow["provider_kind"];
  providerName: string;
  sessionId: string;
  status?: GenerationJobRow["status"];
  type: GenerationJobRow["type"];
};

export type CompleteGenerationJobInput = {
  endedAt?: Date;
  outputArtifactId: string;
};

const jobColumns =
  "id,user_id,session_id,type,status,idempotency_key_hash,generation_mode,provider_kind,provider_name,provider_request_id,attempts,max_attempts,input_artifact_versions_json,output_artifact_id,error_code,redacted_error,started_at,ended_at,created_at,updated_at,tombstoned_at" as const;

export class StoryCamGenerationJobRepository {
  constructor(private readonly client: StoryCamDbClient) {}

  async create(userId: string, input: CreateGenerationJobInput) {
    const { data, error } = await this.client
      .from("generation_jobs")
      .insert({
        user_id: userId,
        session_id: input.sessionId,
        type: input.type,
        status: input.status ?? "queued",
        idempotency_key_hash: input.idempotencyKeyHash,
        generation_mode: input.generationMode ?? "mock",
        provider_kind: input.providerKind,
        provider_name: input.providerName,
        max_attempts: input.maxAttempts ?? 1,
        input_artifact_versions_json: input.inputArtifactVersionsJson ?? {}
      })
      .select(jobColumns)
      .single();

    return unwrapRepositoryResult("create_generation_job", data, error);
  }

  async findActiveByIdempotencyKey(userId: string, idempotencyKeyHash: string) {
    const { data, error } = await this.client
      .from("generation_jobs")
      .select(jobColumns)
      .eq("user_id", userId)
      .eq("idempotency_key_hash", idempotencyKeyHash)
      .is("tombstoned_at", null)
      .maybeSingle();

    return unwrapRepositoryResult("find_active_generation_job", data, error);
  }

  async markSucceeded(userId: string, jobId: string, input: CompleteGenerationJobInput) {
    const { data, error } = await this.client
      .from("generation_jobs")
      .update({
        ended_at: (input.endedAt ?? new Date()).toISOString(),
        output_artifact_id: input.outputArtifactId,
        status: "succeeded"
      })
      .eq("id", jobId)
      .eq("user_id", userId)
      .is("tombstoned_at", null)
      .select(jobColumns)
      .single();

    return unwrapRepositoryResult("mark_generation_job_succeeded", data, error);
  }
}
