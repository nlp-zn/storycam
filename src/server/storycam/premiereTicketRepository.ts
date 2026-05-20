import type { GenerationJobRow, PremiereTicketRow } from "@/server/db/types";
import type { StoryCamDbClient } from "./sessionRepository";
import { StoryCamRepositoryError, unwrapRepositoryResult } from "./repositoryErrors";

export type PremiereTicketSource = PremiereTicketRow["source"];
export type PremiereTicketBudgetFamily = "final_work" | "image" | "story_world" | "storyboard" | "video";

export type IssuePremiereTicketInput = {
  expiresAt?: Date | null;
  issuedByUserId?: string | null;
  note?: string | null;
  source: PremiereTicketSource;
};

type PremiereTicketBudget = {
  limit: number;
  types: GenerationJobRow["type"][];
};

const ticketColumns =
  "id,user_id,status,reserved_session_id,source,issued_by_user_id,note,expires_at,reserved_at,spent_at,created_at,updated_at" as const;

const premiereTicketBudgets: Record<PremiereTicketBudgetFamily, PremiereTicketBudget> = {
  final_work: { limit: 1, types: ["final_work"] },
  image: { limit: 30, types: ["story_world_asset_image", "storyboard_image", "expanded_storyboard_image"] },
  story_world: { limit: 3, types: ["story_world"] },
  storyboard: { limit: 3, types: ["storyboard"] },
  video: { limit: 1, types: ["video_clip"] }
};

export class StoryCamPremiereTicketRepository {
  constructor(private readonly client: StoryCamDbClient) {}

  async create(userId: string, input: IssuePremiereTicketInput) {
    const { data, error } = await this.client
      .from("storycam_premiere_tickets")
      .insert({
        user_id: userId,
        status: "available",
        source: input.source,
        issued_by_user_id: input.issuedByUserId ?? null,
        note: input.note ?? null,
        expires_at: input.expiresAt === undefined ? null : input.expiresAt?.toISOString() ?? null
      })
      .select(ticketColumns)
      .single();

    return unwrapRepositoryResult("create_premiere_ticket", data, error);
  }

  async findAutoTicket(userId: string) {
    const { data, error } = await this.client
      .from("storycam_premiere_tickets")
      .select(ticketColumns)
      .eq("user_id", userId)
      .eq("source", "new_user_auto")
      .maybeSingle();

    return unwrapRepositoryResult<PremiereTicketRow | null>("find_auto_premiere_ticket", data, error);
  }

  async listByUser(userId: string) {
    const { data, error } = await this.client
      .from("storycam_premiere_tickets")
      .select(ticketColumns)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    return unwrapRepositoryResult("list_premiere_tickets", data ?? [], error);
  }

  async findForSession(userId: string, sessionId: string) {
    const { data, error } = await this.client
      .from("storycam_premiere_tickets")
      .select(ticketColumns)
      .eq("user_id", userId)
      .eq("reserved_session_id", sessionId)
      .in("status", ["reserved", "spent"])
      .order("reserved_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    return unwrapRepositoryResult<PremiereTicketRow | null>("find_session_premiere_ticket", data, error);
  }

  async reserve(userId: string, ticketId: string, sessionId: string, reservedAt = new Date()) {
    const { data, error } = await this.client
      .from("storycam_premiere_tickets")
      .update({
        reserved_at: reservedAt.toISOString(),
        reserved_session_id: sessionId,
        status: "reserved"
      })
      .eq("id", ticketId)
      .eq("user_id", userId)
      .eq("status", "available")
      .select(ticketColumns)
      .maybeSingle();

    return unwrapRepositoryResult<PremiereTicketRow | null>("reserve_premiere_ticket", data, error);
  }

  async markSpent(userId: string, ticketId: string, spentAt = new Date()) {
    const { data, error } = await this.client
      .from("storycam_premiere_tickets")
      .update({
        spent_at: spentAt.toISOString(),
        status: "spent"
      })
      .eq("id", ticketId)
      .eq("user_id", userId)
      .eq("status", "reserved")
      .select(ticketColumns)
      .maybeSingle();

    return unwrapRepositoryResult<PremiereTicketRow | null>("spend_premiere_ticket", data, error);
  }
}

export function isAvailablePremiereTicket(ticket: PremiereTicketRow, now = new Date()): boolean {
  if (ticket.status !== "available") {
    return false;
  }

  if (!ticket.expires_at) {
    return true;
  }

  return new Date(ticket.expires_at).getTime() > now.getTime();
}

export function premiereTicketBudgetTypes(family: PremiereTicketBudgetFamily): PremiereTicketBudget {
  const budget = premiereTicketBudgets[family];

  return {
    limit: budget.limit,
    types: [...budget.types]
  };
}

export function premiereTicketCounts(tickets: PremiereTicketRow[], now = new Date()): { activeCount: number; availableCount: number } {
  return {
    activeCount: tickets.filter((ticket) => ticket.status === "reserved").length,
    availableCount: tickets.filter((ticket) => isAvailablePremiereTicket(ticket, now)).length
  };
}

export { StoryCamRepositoryError };
