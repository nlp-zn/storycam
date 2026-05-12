import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { restoreCurrentStoryCamSession } from "@/server/storycam/sessionRestoreService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const result = await restoreCurrentStoryCamSession(createSupabaseAdminClient(), user.id);

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" }, status: 200 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "authentication_required" }, { headers: { "Cache-Control": "no-store" }, status: 401 });
    }

    return NextResponse.json(
      {
        error: "session_restore_failed",
        redactedError: "Session restore failed.",
        redactionApplied: true
      },
      { headers: { "Cache-Control": "no-store" }, status: 500 }
    );
  }
}
