import type { Json } from "@/server/db/types";
import type { StoryCamDbClient } from "./sessionRepository";
import { unwrapRepositoryResult } from "./repositoryErrors";

export type CreateAdminAuditEventInput = {
  actorUserId: string;
  metadataJson?: Json;
  targetUserId: string;
};

export class StoryCamAdminAuditRepository {
  constructor(private readonly client: StoryCamDbClient) {}

  async recordTicketIssuance(input: CreateAdminAuditEventInput) {
    const { data, error } = await this.client
      .from("admin_audit_events")
      .insert({
        action: "issue_premiere_tickets",
        actor_user_id: input.actorUserId,
        target_user_id: input.targetUserId,
        metadata_json: input.metadataJson ?? {}
      })
      .select("id,actor_user_id,target_user_id,action,metadata_json,created_at")
      .single();

    return unwrapRepositoryResult("create_admin_audit_event", data, error);
  }
}
