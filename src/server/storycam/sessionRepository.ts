import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, StoryCamSessionRow } from "@/server/db/types";

export type StoryCamDbClient = SupabaseClient<Database>;

export type CreateStoryCamSessionInput = {
  coreGroupTargetCount?: number;
  generationMode?: StoryCamSessionRow["generation_mode"];
  plannedDurationSeconds?: number;
  status?: StoryCamSessionRow["status"];
};

export type UpdateStoryCamSessionInput = Partial<CreateStoryCamSessionInput>;

const sessionColumns =
  "id,user_id,status,generation_mode,planned_duration_seconds,core_group_target_count,created_at,updated_at,deleted_at" as const;

export class StoryCamRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly code = "repository_error"
  ) {
    super(`StoryCam repository operation failed: ${operation}`);
    this.name = "StoryCamRepositoryError";
  }
}

export class StoryCamSessionRepository {
  constructor(private readonly client: StoryCamDbClient) {}

  async create(userId: string, input: CreateStoryCamSessionInput = {}) {
    const { data, error } = await this.client
      .from("storycam_sessions")
      .insert({
        user_id: userId,
        status: input.status ?? "draft",
        generation_mode: input.generationMode ?? "mock",
        planned_duration_seconds: input.plannedDurationSeconds ?? 12,
        core_group_target_count: input.coreGroupTargetCount ?? 1
      })
      .select(sessionColumns)
      .single();

    return unwrapRepositoryResult("create_session", data, error);
  }

  async findById(userId: string, sessionId: string) {
    const { data, error } = await this.client
      .from("storycam_sessions")
      .select(sessionColumns)
      .eq("id", sessionId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    return unwrapRepositoryResult("find_session", data, error);
  }

  async update(userId: string, sessionId: string, input: UpdateStoryCamSessionInput) {
    const { data, error } = await this.client
      .from("storycam_sessions")
      .update(toSessionUpdate(input))
      .eq("id", sessionId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select(sessionColumns)
      .single();

    return unwrapRepositoryResult("update_session", data, error);
  }

  async softDelete(userId: string, sessionId: string, deletedAt = new Date()) {
    const { error } = await this.client.rpc("soft_delete_storycam_session", {
      target_deleted_at: deletedAt.toISOString(),
      target_session_id: sessionId,
      target_user_id: userId
    });

    if (error) {
      throw new StoryCamRepositoryError("soft_delete_session", error.code);
    }
  }
}

function toSessionUpdate(input: UpdateStoryCamSessionInput) {
  return {
    ...(input.coreGroupTargetCount === undefined ? {} : { core_group_target_count: input.coreGroupTargetCount }),
    ...(input.generationMode === undefined ? {} : { generation_mode: input.generationMode }),
    ...(input.plannedDurationSeconds === undefined ? {} : { planned_duration_seconds: input.plannedDurationSeconds }),
    ...(input.status === undefined ? {} : { status: input.status })
  };
}

function unwrapRepositoryResult<T>(operation: string, data: T, error: { code?: string } | null) {
  if (error) {
    throw new StoryCamRepositoryError(operation, error.code);
  }

  return data;
}
