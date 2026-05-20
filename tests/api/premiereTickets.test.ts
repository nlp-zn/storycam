import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PremiereTicketRow } from "@/server/db/types";

const requireUserMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/server/auth/requireUser", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/requireUser")>("@/server/auth/requireUser");

  return {
    ...actual,
    requireUser: requireUserMock
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

describe("premiere ticket API surfaces", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    process.env.ADMIN_EMAILS = "admin@example.com";
  });

  it("lazy-issues one automatic ticket through /api/auth/me", async () => {
    const { GET } = await import("@/app/api/auth/me/route");
    const client = new FakeSupabaseClient();

    requireUserMock.mockResolvedValue({ email: "user@example.com", id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const first = await GET();
    const second = await GET();

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      authenticated: true,
      premiereTickets: { activeCount: 0, availableCount: 1 },
      user: { email: "user@example.com", id: "user-1" }
    });
    await expect(second.json()).resolves.toMatchObject({
      premiereTickets: { activeCount: 0, availableCount: 1 }
    });
    expect(client.tickets.filter((ticket) => ticket.source === "new_user_auto")).toHaveLength(1);
  });

  it("rejects non-admin manual ticket issuance", async () => {
    const { POST } = await import("@/app/api/admin/premiere-tickets/route");

    requireUserMock.mockResolvedValue({ email: "user@example.com", id: "user-1" });

    const response = await POST(
      new Request("https://storycam.test/api/admin/premiere-tickets", {
        body: JSON.stringify({ count: 1, email: "target@example.com" }),
        headers: { "content-type": "application/json", origin: "https://storycam.test" },
        method: "POST"
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "admin_forbidden",
      redactionApplied: true
    });
  });

  it("lets admins issue premiere tickets by email and writes an audit event", async () => {
    const { POST } = await import("@/app/api/admin/premiere-tickets/route");
    const client = new FakeSupabaseClient([{ email: "target@example.com", id: "target-1" }]);

    requireUserMock.mockResolvedValue({ email: "admin@example.com", id: "admin-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await POST(
      new Request("https://storycam.test/api/admin/premiere-tickets", {
        body: JSON.stringify({
          count: 2,
          email: "target@example.com",
          expiresInDays: 30,
          note: "seed",
          source: "creator_seed"
        }),
        headers: { "content-type": "application/json", origin: "https://storycam.test" },
        method: "POST"
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      issuedCount: 2,
      ok: true,
      premiereTickets: { activeCount: 0, availableCount: 2 },
      user: { email: "target@example.com", id: "target-1" }
    });
    expect(client.auditEvents).toEqual([
      expect.objectContaining({
        action: "issue_premiere_tickets",
        actor_user_id: "admin-1",
        target_user_id: "target-1"
      })
    ]);
  });
});

type FakeAuthUser = {
  email: string;
  id: string;
};

class FakeSupabaseClient {
  readonly auditEvents: Array<Record<string, unknown>> = [];
  readonly auth: { admin: { listUsers: () => Promise<{ data: { users: FakeAuthUser[] }; error: null }> } };
  readonly tickets: PremiereTicketRow[] = [];

  constructor(users: FakeAuthUser[] = []) {
    this.auth = {
      admin: {
        listUsers: async () => ({ data: { users }, error: null })
      }
    };
  }

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  private filters: Array<{ column: string; op: "eq" | "in"; value: unknown }> = [];
  private insertValue: Record<string, unknown> | null = null;
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

  select() {
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

  then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void, reject?: (reason: unknown) => void) {
    return Promise.resolve({ data: this.materializeRows(), error: null }).then(resolve, reject);
  }

  private materializeSingle() {
    if (this.insertValue) {
      return this.insertRow(this.insertValue);
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
      const duplicateAuto = value.source === "new_user_auto" && this.client.tickets.some((ticket) => ticket.source === "new_user_auto");

      if (duplicateAuto) {
        throw new Error("duplicate");
      }

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
