import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { createFinalWorkFromSuggestion, FinalWorkRequestError } from "@/server/storycam/finalWorkService";
import { StoryCamMediaStoreError } from "@/server/storycam/mediaStore";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const result = await createFinalWorkFromSuggestion(createSupabaseAdminClient(), user.id, await request.json());

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.errorCode,
          redactedError: result.redactedError,
          redactionApplied: true
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        finalWork: result.value.artifact,
        media: {
          byteSize: result.value.media.byteSize,
          id: result.value.media.id,
          kind: "final_work",
          mimeType: result.value.media.mimeType
        },
        ok: true
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 });
    }

    if (error instanceof FinalWorkRequestError || error instanceof StoryCamMediaStoreError) {
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
        error: "final_work_failed",
        redactedError: "Final work generation failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}
