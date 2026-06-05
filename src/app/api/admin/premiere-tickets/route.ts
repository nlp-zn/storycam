import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertStoryCamAdmin, ForbiddenAdminError } from "@/server/auth/admin";
import { requireUser, UnauthorizedError, type AuthenticatedUser } from "@/server/auth/requireUser";
import { OriginGuardError, assertUnsafeRequestOrigin, originGuardResponse } from "@/server/security/originGuard";
import { getPremiereTicketSummary, issuePremiereTickets } from "@/server/storycam/premiereTicketService";
import type { PremiereTicketSource } from "@/server/storycam/premiereTicketRepository";

type AdminTicketRequest = {
  count?: unknown;
  email?: unknown;
  expiresInDays?: unknown;
  note?: unknown;
  source?: unknown;
};

type AdminUserLookup = {
  email: string;
  id: string;
};

type ManualPremiereTicketSource = Exclude<PremiereTicketSource, "new_user_auto">;

type ParsedAdminTicketRequest = {
  count: number;
  email: string;
  expiresInDays: number;
  note: string | null;
  source: ManualPremiereTicketSource;
};

const manualSources = ["manual_beta", "support_compensation", "internal_testing", "creator_seed"] as const satisfies readonly ManualPremiereTicketSource[];
const adminUserLookupPageSize = 1000;

export async function GET(request: Request): Promise<Response> {
  try {
    const admin = await requireAdmin();
    const client = createSupabaseAdminClient();
    const email = normalizeEmail(new URL(request.url).searchParams.get("email") ?? "");
    const target = await findUserByEmail(client, email);

    if (!target) {
      return NextResponse.json({ error: "user_not_found", redactionApplied: true }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      adminUserId: admin.id,
      premiereTickets: await getPremiereTicketSummary(client, target.id),
      user: target
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertUnsafeRequestOrigin(request);
    const admin = await requireAdmin();
    const body = parseAdminTicketRequest(await request.json());
    const client = createSupabaseAdminClient();
    const target = await findUserByEmail(client, body.email);

    if (!target) {
      return NextResponse.json({ error: "user_not_found", redactionApplied: true }, { status: 404 });
    }

    const tickets = await issuePremiereTickets(client, {
      actorUserId: admin.id,
      count: body.count,
      expiresInDays: body.expiresInDays,
      note: body.note,
      source: body.source,
      targetUserId: target.id
    });

    return NextResponse.json(
      {
        issuedCount: tickets.length,
        ok: true,
        premiereTickets: await getPremiereTicketSummary(client, target.id),
        user: target
      },
      { status: 201 }
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}

async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  assertStoryCamAdmin(user);
  return user;
}

async function findUserByEmail(
  client: ReturnType<typeof createSupabaseAdminClient>,
  email: string
): Promise<AdminUserLookup | null> {
  if (!email) {
    return null;
  }

  let page = 1;

  while (true) {
    const users = await client.auth.admin.listUsers({ page, perPage: adminUserLookupPageSize });

    if (users.error) {
      throw new Error("Admin user lookup failed.");
    }

    const user = users.data.users.find((candidate) => normalizeEmail(candidate.email ?? "") === email);

    if (user?.email) {
      return { email: user.email, id: user.id };
    }

    if (users.data.users.length < adminUserLookupPageSize) {
      return null;
    }

    page += 1;
  }
}

function parseAdminTicketRequest(body: AdminTicketRequest): ParsedAdminTicketRequest {
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const count = parseBoundedInteger(body.count, 1, 100, 1);
  const expiresInDays = parseOptionalBoundedInteger(body.expiresInDays, 1, 365);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  const source = parseManualSource(body.source);

  if (!email) {
    throw new AdminTicketInputError();
  }

  return {
    count,
    email,
    expiresInDays: expiresInDays ?? 14,
    note,
    source
  };
}

class AdminTicketInputError extends Error {
  constructor() {
    super("Invalid admin premiere ticket request.");
    this.name = "AdminTicketInputError";
  }
}

function parseManualSource(value: unknown): ManualPremiereTicketSource {
  if (isManualSource(value)) {
    return value;
  }

  return "manual_beta";
}

function isManualSource(value: unknown): value is ManualPremiereTicketSource {
  return typeof value === "string" && manualSources.includes(value as ManualPremiereTicketSource);
}

function parseBoundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = parseIntegerInput(value, fallback);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AdminTicketInputError();
  }

  return parsed;
}

function parseIntegerInput(value: unknown, fallback: number): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return fallback;
}

function parseOptionalBoundedInteger(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return parseBoundedInteger(value, min, max, min);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function adminErrorResponse(error: unknown): Response {
  if (error instanceof OriginGuardError) {
    return originGuardResponse(error);
  }

  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  if (error instanceof ForbiddenAdminError) {
    return NextResponse.json({ error: "admin_forbidden", redactionApplied: true }, { status: 403 });
  }

  if (error instanceof AdminTicketInputError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "invalid_input", redactionApplied: true }, { status: 400 });
  }

  return NextResponse.json({ error: "admin_premiere_ticket_failed", redactionApplied: true }, { status: 500 });
}
