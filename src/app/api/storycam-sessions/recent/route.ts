import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { listRecentStoryCamProjects } from "@/server/storycam/sessionRestoreService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const result = await listRecentStoryCamProjects(createSupabaseAdminClient(), user.id, limit);

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" }, status: 200 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "authentication_required" }, { headers: { "Cache-Control": "no-store" }, status: 401 });
    }

    return NextResponse.json(
      {
        error: "recent_projects_failed",
        redactedError: "Recent StoryCam projects failed to load.",
        redactionApplied: true
      },
      { headers: { "Cache-Control": "no-store" }, status: 500 }
    );
  }
}
