import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { StoryCamSessionDeletionService, StoryCamStorageCleanupError } from "@/server/storycam/storageCleanupService";

type StoryCamSessionRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function DELETE(_request: Request, context: StoryCamSessionRouteContext) {
  try {
    const user = await requireUser();
    const params = await context.params;

    if (!params.id) {
      return NextResponse.json(
        {
          error: "session_id_required",
          redactedError: "Invalid session deletion request.",
          redactionApplied: true
        },
        { status: 400 }
      );
    }

    const summary = await StoryCamSessionDeletionService.fromSupabaseClient(createSupabaseAdminClient()).deleteSession(
      user.id,
      params.id
    );

    return NextResponse.json(
      {
        ok: true,
        sessionId: params.id,
        ...summary
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 });
    }

    if (error instanceof StoryCamStorageCleanupError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "Session deletion failed.",
          redactionApplied: true
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "session_deletion_failed",
        redactedError: "Session deletion failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}
