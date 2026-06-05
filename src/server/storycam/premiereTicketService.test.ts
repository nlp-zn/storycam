import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, GenerationJobRow, PremiereTicketRow } from "@/server/db/types";
import {
  assertPremiereTicketBudget,
  ensureAutoPremiereTicket,
  ensurePremiereTicketForSession,
  issuePremiereTickets,
  StoryCamPremiereTicketError
} from "./premiereTicketService";

describe("premiere ticket service", () => {
  it("lazy-issues one automatic premiere ticket per user", async () => {
    const client = new FakeSupabaseClient();
    const now = new Date("2026-05-19T00:00:00.000Z");

    await ensureAutoPremiereTicket(client.asSupabaseClient(), "user-1", { now });
    const summary = await ensureAutoPremiereTicket(client.asSupabaseClient(), "user-1", { now });

    expect(client.tickets).toHaveLength(1);
    expect(client.tickets[0]).toMatchObject({
      source: "new_user_auto",
      status: "available",
      user_id: "user-1"
    });
    expect(summary).toEqual({ activeCount: 0, availableCount: 1 });
  });

  it("reserves the first available ticket for a session and rejects image budget overage", async () => {
    const client = new FakeSupabaseClient();
    const now = new Date("2026-05-19T00:00:00.000Z");
    await ensureAutoPremiereTicket(client.asSupabaseClient(), "user-1", { now });

    const ticket = await ensurePremiereTicketForSession(client.asSupabaseClient(), "user-1", "session-1", { now });

    expect(ticket).toMatchObject({
      reserved_session_id: "session-1",
      status: "reserved"
    });

    client.jobs.push(...Array.from({ length: 29 }, (_, index) => fakeJob(ticket.id, `job-${index}`, "storyboard_image", "queued")));
    client.jobs.push(fakeJob(ticket.id, "job-failed", "expanded_storyboard_image", "failed"));

    await expect(
      assertPremiereTicketBudget(client.asSupabaseClient(), "user-1", {
        family: "image",
        ticketId: ticket.id
      })
    ).resolves.toBeUndefined();

    client.jobs.push(fakeJob(ticket.id, "job-30", "expanded_storyboard_image", "running"));

    await expect(
      assertPremiereTicketBudget(client.asSupabaseClient(), "user-1", {
        family: "image",
        ticketId: ticket.id
      })
    ).rejects.toThrow(new StoryCamPremiereTicketError("premiere_ticket_budget_exceeded"));
  });

  it("issues manual tickets and writes one admin audit event", async () => {
    const client = new FakeSupabaseClient();

    await issuePremiereTickets(client.asSupabaseClient(), {
      actorUserId: "admin-1",
      count: 3,
      expiresInDays: 30,
      note: "seed user",
      source: "manual_beta",
      targetUserId: "user-1"
    });

    expect(client.tickets).toHaveLength(3);
    expect(client.tickets.every((ticket) => ticket.source === "manual_beta")).toBe(true);
    expect(client.auditEvents).toEqual([
      expect.objectContaining({
        action: "issue_premiere_tickets",
        actor_user_id: "admin-1",
        metadata_json: expect.objectContaining({
          count: 3,
          expiresInDays: 30,
          note: "seed user",
          source: "manual_beta"
        }),
        target_user_id: "user-1"
      })
    ]);
  });

  it("does not leave partial manual tickets when atomic issuance fails", async () => {
    const client = new FakeSupabaseClient({ failIssueRpc: true });

    await expect(
      issuePremiereTickets(client.asSupabaseClient(), {
        actorUserId: "admin-1",
        count: 2,
        expiresInDays: 30,
        source: "manual_beta",
        targetUserId: "user-1"
      })
    ).rejects.toThrow();

    expect(client.tickets).toHaveLength(0);
    expect(client.auditEvents).toHaveLength(0);
  });
});

function fakeJob(
  ticketId: string,
  id: string,
  type: GenerationJobRow["type"],
  status: GenerationJobRow["status"]
): GenerationJobRow {
  return {
    attempts: 0,
    created_at: "2026-05-19T00:00:00.000Z",
    ended_at: null,
    error_code: null,
    generation_mode: "real",
    id,
    idempotency_key_hash: id,
    input_artifact_versions_json: {},
    locked_at: null,
    locked_by: null,
    max_attempts: 1,
    output_artifact_id: null,
    premiere_ticket_id: ticketId,
    provider_error_category: null,
    provider_http_status: null,
    provider_kind: "image",
    provider_name: "inference_sh",
    provider_request_id: null,
    redacted_error: null,
    run_after: "2026-05-19T00:00:00.000Z",
    session_id: "session-1",
    started_at: null,
    status,
    tombstoned_at: null,
    type,
    updated_at: "2026-05-19T00:00:00.000Z",
    user_id: "user-1"
  };
}

type IssuePremiereTicketsArgs = Database["public"]["Functions"]["issue_storycam_premiere_tickets"]["Args"];

class FakeSupabaseClient {
  readonly auditEvents: Array<Record<string, unknown>> = [];
  readonly jobs: GenerationJobRow[] = [];
  readonly tickets: PremiereTicketRow[] = [];

  constructor(private readonly options: { failIssueRpc?: boolean } = {}) {}

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  rpc(name: string, args: IssuePremiereTicketsArgs) {
    if (name !== "issue_storycam_premiere_tickets") {
      return Promise.resolve({ data: null, error: { code: "42883" } });
    }

    if (this.options.failIssueRpc) {
      return Promise.resolve({ data: null, error: { code: "XX000" } });
    }

    const created = Array.from({ length: args.ticket_count }, () => {
      const row = {
        created_at: "2026-05-19T00:00:00.000Z",
        expires_at: args.ticket_expires_at ?? null,
        id: `ticket-${this.tickets.length + 1}`,
        issued_by_user_id: args.actor_user_id,
        note: args.ticket_note ?? null,
        reserved_at: null,
        reserved_session_id: null,
        source: args.ticket_source,
        spent_at: null,
        status: "available",
        updated_at: "2026-05-19T00:00:00.000Z",
        user_id: args.target_user_id
      } as PremiereTicketRow;

      this.tickets.push(row);
      return row;
    });

    this.auditEvents.push({
      action: "issue_premiere_tickets",
      actor_user_id: args.actor_user_id,
      created_at: "2026-05-19T00:00:00.000Z",
      id: `audit-${this.auditEvents.length + 1}`,
      metadata_json: {
        count: created.length,
        expiresInDays: args.ticket_expires_in_days ?? null,
        note: args.ticket_note ? args.ticket_note.slice(0, 120) : null,
        source: args.ticket_source
      },
      target_user_id: args.target_user_id
    });

    return Promise.resolve({ data: created, error: null });
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private filters: Array<{ column: string; op: "eq" | "in"; value: unknown }> = [];
  private insertValue: Record<string, unknown> | null = null;
  private isCountOnly = false;
  private updateValue: Record<string, unknown> | null = null;

  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly table: string
  ) {}

  insert(value: Record<string, unknown>) {
    this.insertValue = value;
    return this;
  }

  update(value: Record<string, unknown>) {
    this.updateValue = value;
    return this;
  }

  select(_columns?: string, options?: { head?: boolean }) {
    this.isCountOnly = options?.head === true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: "eq", value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ column, op: "in", value });
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  single() {
    return Promise.resolve({ data: this.materializeSingle(), error: null });
  }

  maybeSingle() {
    return Promise.resolve({ data: this.materializeRows()[0] ?? null, error: null });
  }

  then(
    resolve: (value: { count?: number; data: Array<Record<string, unknown>> | null; error: null }) => void,
    reject?: (reason: unknown) => void
  ) {
    const rows = this.materializeRows();

    if (this.isCountOnly) {
      return Promise.resolve({ count: rows.length, data: null, error: null }).then(resolve, reject);
    }

    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  }

  private materializeSingle() {
    if (this.insertValue) {
      const row = this.insertRow(this.insertValue);
      return row;
    }

    return this.materializeRows()[0] ?? null;
  }

  private materializeRows() {
    const rows = this.rowsForTable();

    if (this.updateValue) {
      const row = rows.find((candidate) => this.matches(candidate));

      if (row) {
        Object.assign(row, this.updateValue);
      }

      return row ? [row] : [];
    }

    return rows.filter((row) => this.matches(row));
  }

  private insertRow(value: Record<string, unknown>) {
    if (this.table === "storycam_premiere_tickets") {
      const row = {
        created_at: "2026-05-19T00:00:00.000Z",
        expires_at: null,
        id: `ticket-${this.client.tickets.length + 1}`,
        issued_by_user_id: null,
        note: null,
        reserved_at: null,
        reserved_session_id: null,
        spent_at: null,
        status: "available",
        updated_at: "2026-05-19T00:00:00.000Z",
        ...value
      } as PremiereTicketRow;
      this.client.tickets.push(row);
      return row;
    }

    const event = {
      created_at: "2026-05-19T00:00:00.000Z",
      id: `audit-${this.client.auditEvents.length + 1}`,
      ...value
    };
    this.client.auditEvents.push(event);
    return event;
  }

  private rowsForTable(): Array<Record<string, unknown>> {
    if (this.table === "storycam_premiere_tickets") {
      return this.client.tickets as unknown as Array<Record<string, unknown>>;
    }

    if (this.table === "generation_jobs") {
      return this.client.jobs as unknown as Array<Record<string, unknown>>;
    }

    return this.client.auditEvents;
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every((filter) => {
      if (filter.op === "eq") {
        return row[filter.column] === filter.value;
      }

      return Array.isArray(filter.value) && filter.value.includes(row[filter.column] as never);
    });
  }
}
