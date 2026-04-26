import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { createStitchSuggestion, FinalWorkRequestError } from "@/server/storycam/finalWorkService";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const result = await createStitchSuggestion(createSupabaseAdminClient(), user.id, await request.json());

    return NextResponse.json(
      {
        ok: true,
        ...result.value
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 });
    }

    if (error instanceof FinalWorkRequestError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "Invalid final work request.",
          redactionApplied: true
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "stitch_suggestion_failed",
        redactedError: "Stitch suggestion failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}
