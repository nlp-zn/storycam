import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { restoreStoryCamSessionById, StoryCamSessionRestoreError } from "@/server/storycam/sessionRestoreService";

type RestoreRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(_request: Request, context: RestoreRouteContext) {
  try {
    const user = await requireUser();
    const params = await context.params;
    const result = await restoreStoryCamSessionById(createSupabaseAdminClient(), user.id, params.id);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 });
    }

    if (error instanceof StoryCamSessionRestoreError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "StoryCam project was not found.",
          redactionApplied: true
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: "session_restore_failed",
        redactedError: "Session restore failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}
