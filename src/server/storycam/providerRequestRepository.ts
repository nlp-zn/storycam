import type { GenerationJobRow, Json, ProviderRequestRow } from "@/server/db/types";
import type { StoryCamDbClient } from "./sessionRepository";
import { unwrapRepositoryResult } from "./repositoryErrors";

export type CreateProviderRequestInput = {
  jobId: string;
  providerKind: GenerationJobRow["provider_kind"];
  providerName: string;
  providerRequestId?: string | null;
  requestSummaryJson?: Json;
  responseSummaryJson?: Json | null;
  status?: ProviderRequestRow["status"];
};

const providerRequestColumns =
  "id,user_id,job_id,provider_kind,provider_name,provider_request_id,request_summary_json,response_summary_json,status,created_at,updated_at" as const;

export class StoryCamProviderRequestRepository {
  constructor(private readonly client: StoryCamDbClient) {}

  async create(userId: string, input: CreateProviderRequestInput) {
    const { data, error } = await this.client
      .from("provider_requests")
      .insert({
        user_id: userId,
        job_id: input.jobId,
        provider_kind: input.providerKind,
        provider_name: input.providerName,
        provider_request_id: input.providerRequestId ?? null,
        request_summary_json: input.requestSummaryJson ?? {},
        response_summary_json: input.responseSummaryJson ?? null,
        status: input.status ?? "submitted"
      })
      .select(providerRequestColumns)
      .single();

    return unwrapRepositoryResult("create_provider_request", data, error);
  }

  async listByJob(userId: string, jobId: string) {
    const { data, error } = await this.client
      .from("provider_requests")
      .select(providerRequestColumns)
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    return unwrapRepositoryResult("list_provider_requests", data, error);
  }
}
