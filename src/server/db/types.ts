import type { ArtifactState, ArtifactType } from "@/features/storycam/domain/artifacts";

export type Json = boolean | number | string | null | { [key: string]: Json | undefined } | Json[];

type TableDefinition<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type StoryCamSessionRow = {
  id: string;
  user_id: string;
  status: "draft" | "generating" | "ready" | "deleted";
  generation_mode: "mock" | "real";
  video_aspect_ratio: "16:9" | "9:16";
  planned_duration_seconds: number;
  core_group_target_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type StoryCamSessionInsert = {
  id?: string;
  user_id: string;
  status?: StoryCamSessionRow["status"];
  generation_mode?: StoryCamSessionRow["generation_mode"];
  video_aspect_ratio?: StoryCamSessionRow["video_aspect_ratio"];
  planned_duration_seconds?: number;
  core_group_target_count?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type StoryCamSessionUpdate = Partial<Omit<StoryCamSessionInsert, "id" | "user_id" | "created_at">>;

export type StoryCamArtifactRow = {
  id: string;
  user_id: string;
  session_id: string;
  type: ArtifactType;
  state: ArtifactState;
  version: number;
  parent_artifact_id: string | null;
  data_json: Json;
  depends_on_json: Json;
  created_at: string;
  updated_at: string;
  stale_at: string | null;
  deleted_at: string | null;
};

export type StoryCamArtifactInsert = {
  id?: string;
  user_id: string;
  session_id: string;
  type: ArtifactType;
  state?: ArtifactState;
  version: number;
  parent_artifact_id?: string | null;
  data_json?: Json;
  depends_on_json?: Json;
  created_at?: string;
  updated_at?: string;
  stale_at?: string | null;
  deleted_at?: string | null;
};

export type StoryCamArtifactUpdate = Partial<Omit<StoryCamArtifactInsert, "id" | "user_id" | "session_id" | "type" | "version" | "created_at">>;

export type GenerationJobRow = {
  id: string;
  user_id: string;
  session_id: string;
  premiere_ticket_id: string | null;
  type:
    | "story_world"
    | "story_world_asset_image"
    | "storyboard"
    | "storyboard_image"
    | "expanded_storyboard_image"
    | "video_clip"
    | "final_work";
  status: "queued" | "running" | "succeeded" | "failed" | "cancel_requested" | "canceled" | "expired";
  idempotency_key_hash: string;
  generation_mode: "mock" | "real";
  provider_kind: "text" | "multimodal" | "image" | "video" | "stitch";
  provider_name: string;
  provider_request_id: string | null;
  attempts: number;
  max_attempts: number;
  input_artifact_versions_json: Json;
  output_artifact_id: string | null;
  error_code: string | null;
  provider_error_category: string | null;
  provider_http_status: number | null;
  redacted_error: string | null;
  started_at: string | null;
  ended_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
  run_after: string;
  created_at: string;
  updated_at: string;
  tombstoned_at: string | null;
};

export type GenerationJobInsert = {
  id?: string;
  user_id: string;
  session_id: string;
  premiere_ticket_id?: string | null;
  type: GenerationJobRow["type"];
  status?: GenerationJobRow["status"];
  idempotency_key_hash: string;
  generation_mode?: GenerationJobRow["generation_mode"];
  provider_kind: GenerationJobRow["provider_kind"];
  provider_name: string;
  provider_request_id?: string | null;
  attempts?: number;
  max_attempts?: number;
  input_artifact_versions_json?: Json;
  output_artifact_id?: string | null;
  error_code?: string | null;
  provider_error_category?: string | null;
  provider_http_status?: number | null;
  redacted_error?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  locked_by?: string | null;
  locked_at?: string | null;
  run_after?: string;
  created_at?: string;
  updated_at?: string;
  tombstoned_at?: string | null;
};

export type GenerationJobUpdate = Partial<Omit<GenerationJobInsert, "id" | "user_id" | "session_id" | "type" | "created_at">>;

export type PremiereTicketRow = {
  id: string;
  user_id: string;
  status: "available" | "reserved" | "spent" | "expired";
  reserved_session_id: string | null;
  source: "new_user_auto" | "manual_beta" | "support_compensation" | "internal_testing" | "creator_seed";
  issued_by_user_id: string | null;
  note: string | null;
  expires_at: string | null;
  reserved_at: string | null;
  spent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PremiereTicketInsert = {
  id?: string;
  user_id: string;
  status?: PremiereTicketRow["status"];
  reserved_session_id?: string | null;
  source: PremiereTicketRow["source"];
  issued_by_user_id?: string | null;
  note?: string | null;
  expires_at?: string | null;
  reserved_at?: string | null;
  spent_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PremiereTicketUpdate = Partial<Omit<PremiereTicketInsert, "id" | "user_id" | "source" | "created_at">>;

export type AdminAuditEventRow = {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  action: "issue_premiere_tickets";
  metadata_json: Json;
  created_at: string;
};

export type AdminAuditEventInsert = {
  id?: string;
  actor_user_id?: string | null;
  target_user_id?: string | null;
  action: AdminAuditEventRow["action"];
  metadata_json?: Json;
  created_at?: string;
};

export type AdminAuditEventUpdate = Partial<Omit<AdminAuditEventInsert, "id" | "created_at">>;

export type MediaAssetRow = {
  id: string;
  user_id: string;
  session_id: string;
  kind: "uploaded_photo" | "mock_clip" | "generated_clip" | "final_work" | "thumbnail";
  mime_type: string;
  byte_size: number;
  storage_bucket: string;
  storage_path: string;
  source: "upload" | "mock" | "provider" | "composer";
  linked_artifact_id: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type MediaAssetInsert = {
  id?: string;
  user_id: string;
  session_id: string;
  kind: MediaAssetRow["kind"];
  mime_type: string;
  byte_size: number;
  storage_bucket: string;
  storage_path: string;
  source: MediaAssetRow["source"];
  linked_artifact_id?: string | null;
  created_at?: string;
  deleted_at?: string | null;
};

export type MediaAssetUpdate = Partial<Omit<MediaAssetInsert, "id" | "user_id" | "session_id" | "created_at">>;

export type ProviderRequestRow = {
  id: string;
  user_id: string;
  job_id: string;
  provider_kind: GenerationJobRow["provider_kind"];
  provider_name: string;
  provider_request_id: string | null;
  request_summary_json: Json;
  response_summary_json: Json | null;
  status: "submitted" | "succeeded" | "failed" | "canceled";
  created_at: string;
  updated_at: string;
};

export type ProviderRequestInsert = {
  id?: string;
  user_id: string;
  job_id: string;
  provider_kind: ProviderRequestRow["provider_kind"];
  provider_name: string;
  provider_request_id?: string | null;
  request_summary_json?: Json;
  response_summary_json?: Json | null;
  status?: ProviderRequestRow["status"];
  created_at?: string;
  updated_at?: string;
};

export type ProviderRequestUpdate = Partial<Omit<ProviderRequestInsert, "id" | "user_id" | "job_id" | "created_at">>;

export type Database = {
  public: {
    Tables: {
      storycam_sessions: TableDefinition<StoryCamSessionRow, StoryCamSessionInsert, StoryCamSessionUpdate>;
      storycam_artifacts: TableDefinition<StoryCamArtifactRow, StoryCamArtifactInsert, StoryCamArtifactUpdate>;
      generation_jobs: TableDefinition<GenerationJobRow, GenerationJobInsert, GenerationJobUpdate>;
      storycam_premiere_tickets: TableDefinition<PremiereTicketRow, PremiereTicketInsert, PremiereTicketUpdate>;
      admin_audit_events: TableDefinition<AdminAuditEventRow, AdminAuditEventInsert, AdminAuditEventUpdate>;
      media_assets: TableDefinition<MediaAssetRow, MediaAssetInsert, MediaAssetUpdate>;
      provider_requests: TableDefinition<ProviderRequestRow, ProviderRequestInsert, ProviderRequestUpdate>;
    };
    Views: Record<string, never>;
    Functions: {
      soft_delete_storycam_session: {
        Args: {
          target_deleted_at?: string;
          target_session_id: string;
          target_user_id: string;
        };
        Returns: undefined;
      };
      claim_storycam_generation_jobs: {
        Args: {
          job_types: string[];
          limit_count?: number;
          lock_ttl_seconds?: number;
          worker_id: string;
        };
        Returns: GenerationJobRow[];
      };
      issue_storycam_premiere_tickets: {
        Args: {
          actor_user_id: string;
          target_user_id: string;
          ticket_count: number;
          ticket_expires_at?: string | null;
          ticket_expires_in_days?: number | null;
          ticket_note?: string | null;
          ticket_source: Exclude<PremiereTicketRow["source"], "new_user_auto">;
        };
        Returns: PremiereTicketRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
