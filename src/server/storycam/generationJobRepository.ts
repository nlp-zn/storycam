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

export type CancelGenerationJobInput = {
  endedAt?: Date;
};

export type TombstoneGenerationJobInput = {
  tombstonedAt?: Date;
};

const jobColumns =
  "id,user_id,session_id,type,status,idempotency_key_hash,generation_mode,provider_kind,provider_name,provider_request_id,attempts,max_attempts,input_artifact_versions_json,output_artifact_id,error_code,redacted_error,started_at,ended_at,created_at,updated_at,tombstoned_at" as const;

export class StoryCamGenerationJobRepository {
  constructor(private readonly client: StoryCamDbClient) {}

  async createOrFindActiveByIdempotencyKey(userId: string, input: CreateGenerationJobInput) {
    const existingJob = await this.findActiveByIdempotencyKey(userId, input.idempotencyKeyHash);

    if (existingJob) {
      return existingJob;
    }

    return this.create(userId, input);
  }

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

  async findById(userId: string, jobId: string) {
    const { data, error } = await this.client
      .from("generation_jobs")
      .select(jobColumns)
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle();

    return unwrapRepositoryResult<GenerationJobRow | null>("find_generation_job", data, error);
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

  async requestCancel(userId: string, jobId: string) {
    const { data, error } = await this.client
      .from("generation_jobs")
      .update({
        status: "cancel_requested"
      })
      .eq("id", jobId)
      .eq("user_id", userId)
      .is("tombstoned_at", null)
      .select(jobColumns)
      .single();

    return unwrapRepositoryResult("request_generation_job_cancel", data, error);
  }

  async markCanceled(userId: string, jobId: string, input: CancelGenerationJobInput = {}) {
    const { data, error } = await this.client
      .from("generation_jobs")
      .update({
        ended_at: (input.endedAt ?? new Date()).toISOString(),
        status: "canceled"
      })
      .eq("id", jobId)
      .eq("user_id", userId)
      .is("tombstoned_at", null)
      .select(jobColumns)
      .single();

    return unwrapRepositoryResult("mark_generation_job_canceled", data, error);
  }

  async tombstone(userId: string, jobId: string, input: TombstoneGenerationJobInput = {}) {
    const tombstonedAt = input.tombstonedAt ?? new Date();
    const { data, error } = await this.client
      .from("generation_jobs")
      .update({
        status: "canceled",
        tombstoned_at: tombstonedAt.toISOString()
      })
      .eq("id", jobId)
      .eq("user_id", userId)
      .is("tombstoned_at", null)
      .select(jobColumns)
      .single();

    return unwrapRepositoryResult("tombstone_generation_job", data, error);
  }
}
