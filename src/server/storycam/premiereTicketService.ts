import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PremiereTicketRow } from "@/server/db/types";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";
import {
  isAvailablePremiereTicket,
  type PremiereTicketBudgetFamily,
  premiereTicketBudgetTypes,
  premiereTicketCounts,
  StoryCamPremiereTicketRepository,
  type PremiereTicketSource
} from "./premiereTicketRepository";
import { StoryCamAdminAuditRepository } from "./adminAuditRepository";
import { StoryCamRepositoryError } from "./repositoryErrors";

export type PremiereTicketSummary = {
  activeCount: number;
  availableCount: number;
};

export class StoryCamPremiereTicketError extends Error {
  constructor(readonly code: "premiere_ticket_budget_exceeded" | "premiere_ticket_required") {
    super(`StoryCam premiere ticket error: ${code}`);
    this.name = "StoryCamPremiereTicketError";
  }
}

export async function ensureAutoPremiereTicket(
  client: SupabaseClient<Database>,
  userId: string,
  options: { expiresInDays?: number; now?: Date } = {}
): Promise<PremiereTicketSummary> {
  const tickets = new StoryCamPremiereTicketRepository(client);
  const existing = await tickets.findAutoTicket(userId);

  if (!existing) {
    try {
      await tickets.create(userId, {
        expiresAt: addDays(options.now ?? new Date(), options.expiresInDays ?? 14),
        source: "new_user_auto"
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      // A concurrent auth check may have inserted the unique auto ticket first.
    }
  }

  return getPremiereTicketSummary(client, userId, options.now);
}

export async function getPremiereTicketSummary(
  client: SupabaseClient<Database>,
  userId: string,
  now = new Date()
): Promise<PremiereTicketSummary> {
  const tickets = await new StoryCamPremiereTicketRepository(client).listByUser(userId);

  return premiereTicketCounts(tickets, now);
}

export async function ensurePremiereTicketForSession(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  options: { now?: Date } = {}
): Promise<PremiereTicketRow> {
  const tickets = new StoryCamPremiereTicketRepository(client);
  const existing = await tickets.findForSession(userId, sessionId);

  if (existing) {
    return existing;
  }

  await ensureAutoPremiereTicket(client, userId, { now: options.now });

  const now = options.now ?? new Date();
  const available = (await tickets.listByUser(userId)).find((ticket) => isAvailablePremiereTicket(ticket, now));

  if (!available) {
    throw new StoryCamPremiereTicketError("premiere_ticket_required");
  }

  const reserved = await tickets.reserve(userId, available.id, sessionId, now);

  if (!reserved) {
    return ensurePremiereTicketForSession(client, userId, sessionId, options);
  }

  return reserved;
}

export async function assertPremiereTicketBudget(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    family: PremiereTicketBudgetFamily;
    ticketId: string;
  }
): Promise<void> {
  const { limit, types } = premiereTicketBudgetTypes(input.family);
  const count = await new StoryCamGenerationJobRepository(client).countNonFailedByPremiereTicket(userId, {
    premiereTicketId: input.ticketId,
    types
  });

  if (count >= limit) {
    throw new StoryCamPremiereTicketError("premiere_ticket_budget_exceeded");
  }
}

export async function ensurePremiereTicketBudgetForSession(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    family: PremiereTicketBudgetFamily;
    sessionId: string;
  }
): Promise<PremiereTicketRow> {
  const ticket = await ensurePremiereTicketForSession(client, userId, input.sessionId);

  if (ticket.status === "spent") {
    throw new StoryCamPremiereTicketError("premiere_ticket_budget_exceeded");
  }

  await assertPremiereTicketBudget(client, userId, {
    family: input.family,
    ticketId: ticket.id
  });

  return ticket;
}

export async function markPremiereTicketSpentForFinalWorkJob(
  client: SupabaseClient<Database>,
  userId: string,
  ticketId: string | null
): Promise<void> {
  if (!ticketId) {
    return;
  }

  await new StoryCamPremiereTicketRepository(client).markSpent(userId, ticketId);
}

export async function issuePremiereTickets(
  client: SupabaseClient<Database>,
  input: {
    actorUserId: string;
    count: number;
    expiresInDays?: number | null;
    note?: string | null;
    source: Exclude<PremiereTicketSource, "new_user_auto">;
    targetUserId: string;
  }
): Promise<PremiereTicketRow[]> {
  const tickets = new StoryCamPremiereTicketRepository(client);
  const expiresAt = premiereTicketExpiresAt(input.expiresInDays);
  const created: PremiereTicketRow[] = [];

  for (let index = 0; index < input.count; index += 1) {
    const ticket = await tickets.create(input.targetUserId, {
      expiresAt,
      issuedByUserId: input.actorUserId,
      note: input.note ?? null,
      source: input.source
    });

    if (ticket) {
      created.push(ticket);
    }
  }

  await new StoryCamAdminAuditRepository(client).recordTicketIssuance({
    actorUserId: input.actorUserId,
    metadataJson: {
      count: created.length,
      expiresInDays: input.expiresInDays ?? null,
      note: input.note ? input.note.slice(0, 120) : null,
      source: input.source
    },
    targetUserId: input.targetUserId
  });

  return created;
}

export function premiereTicketErrorResponse(error: StoryCamPremiereTicketError): Response {
  return Response.json(
    {
      error: error.code,
      redactedError: "Premiere ticket limit reached.",
      redactionApplied: true
    },
    { status: 429 }
  );
}

function premiereTicketExpiresAt(expiresInDays: number | null | undefined): Date | null {
  if (expiresInDays === null || expiresInDays === undefined) {
    return null;
  }

  return addDays(new Date(), expiresInDays);
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof StoryCamRepositoryError && error.code === "23505";
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
