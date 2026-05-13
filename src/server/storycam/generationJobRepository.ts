import type { GenerationJobRow, Json } from "@/server/db/types";
import type { StoryCamDbClient } from "./sessionRepository";
import { StoryCamRepositoryError, unwrapRepositoryResult } from "./repositoryErrors";

export type CreateGenerationJobInput = {
  generationMode?: GenerationJobRow["generation_mode"];
  idempotencyKeyHash: string;
  inputArtifactVersionsJson?: Json;
  maxAttempts?: number;
  outputArtifactId?: string | null;
  providerKind: GenerationJobRow["provider_kind"];
  providerName: string;
  providerRequestId?: string | null;
  sessionId: string;
  status?: GenerationJobRow["status"];
  type: GenerationJobRow["type"];
};

export type CompleteGenerationJobInput = {
  endedAt?: Date;
  outputArtifactId: string;
};

export type FailGenerationJobInput = {
  endedAt?: Date;
  errorCode: string;
  providerErrorCategory?: string | null;
  providerHttpStatus?: number | null;
  redactedError: string;
};

export type CancelGenerationJobInput = {
  endedAt?: Date;
};

export type TombstoneGenerationJobInput = {
  tombstonedAt?: Date;
};

const jobColumns =
  "id,user_id,session_id,type,status,idempotency_key_hash,generation_mode,provider_kind,provider_name,provider_request_id,attempts,max_attempts,input_artifact_versions_json,output_artifact_id,error_code,provider_error_category,provider_http_status,redacted_error,started_at,ended_at,locked_by,locked_at,run_after,created_at,updated_at,tombstoned_at" as const;

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
        provider_request_id: input.providerRequestId ?? null,
        max_attempts: input.maxAttempts ?? 1,
        input_artifact_versions_json: input.inputArtifactVersionsJson ?? {},
        output_artifact_id: input.outputArtifactId ?? null
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

  async listBySession(userId: string, sessionId: string) {
    const { data, error } = await this.client
      .from("generation_jobs")
      .select(jobColumns)
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .is("tombstoned_at", null)
      .order("created_at", { ascending: true });

    return unwrapRepositoryResult("list_generation_jobs_by_session", data, error);
  }

  async markSucceeded(userId: string, jobId: string, input: CompleteGenerationJobInput) {
    const { data, error } = await this.client
      .from("generation_jobs")
      .update({
        ended_at: (input.endedAt ?? new Date()).toISOString(),
        locked_at: null,
        locked_by: null,
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

  async markRunning(userId: string, jobId: string, input: { startedAt?: Date } = {}) {
    const { data, error } = await this.client
      .from("generation_jobs")
      .update({
        started_at: (input.startedAt ?? new Date()).toISOString(),
        status: "running"
      })
      .eq("id", jobId)
      .eq("user_id", userId)
      .is("tombstoned_at", null)
      .select(jobColumns)
      .single();

    return unwrapRepositoryResult("mark_generation_job_running", data, error);
  }

  async markFailed(userId: string, jobId: string, input: FailGenerationJobInput) {
    const { data, error } = await this.client
      .from("generation_jobs")
      .update({
        ended_at: (input.endedAt ?? new Date()).toISOString(),
        error_code: input.errorCode,
        locked_at: null,
        locked_by: null,
        provider_error_category: input.providerErrorCategory ?? null,
        provider_http_status: input.providerHttpStatus ?? null,
        redacted_error: input.redactedError,
        status: "failed"
      })
      .eq("id", jobId)
      .eq("user_id", userId)
      .is("tombstoned_at", null)
      .select(jobColumns)
      .single();

    return unwrapRepositoryResult("mark_generation_job_failed", data, error);
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
        locked_at: null,
        locked_by: null,
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
        locked_at: null,
        locked_by: null,
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

  async claimRunnable(input: {
    jobTypes: GenerationJobRow["type"][];
    limit?: number;
    lockTtlSeconds?: number;
    workerId: string;
  }) {
    const { data, error } = await this.client.rpc("claim_storycam_generation_jobs", {
      job_types: input.jobTypes,
      limit_count: input.limit ?? 5,
      lock_ttl_seconds: input.lockTtlSeconds ?? 300,
      worker_id: input.workerId
    });

    return unwrapRepositoryResult("claim_generation_jobs", data ?? [], error);
  }

  async releaseForRetry(userId: string, jobId: string, input: { runAfter?: Date } = {}) {
    const { data, error } = await this.client
      .from("generation_jobs")
      .update({
        locked_at: null,
        locked_by: null,
        run_after: (input.runAfter ?? new Date()).toISOString()
      })
      .eq("id", jobId)
      .eq("user_id", userId)
      .is("tombstoned_at", null)
      .select(jobColumns)
      .single();

    return unwrapRepositoryResult("release_generation_job_for_retry", data, error);
  }

  async countCreatedSince(userId: string, type: GenerationJobRow["type"], since: Date) {
    const { count, error } = await this.client
      .from("generation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", type)
      .gte("created_at", since.toISOString());

    if (error) {
      throw new StoryCamRepositoryError("count_generation_jobs", error.code);
    }

    return count ?? 0;
  }
}
