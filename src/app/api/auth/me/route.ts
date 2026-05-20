import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { ensureAutoPremiereTicket } from "@/server/storycam/premiereTicketService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const premiereTickets = await ensureAutoPremiereTicket(createSupabaseAdminClient(), user.id);

    return NextResponse.json(
      {
        authenticated: true,
        premiereTickets,
        user
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ authenticated: false, user: null }, { headers: { "Cache-Control": "no-store" } });
    }

    throw error;
  }
}
