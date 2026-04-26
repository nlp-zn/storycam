import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { createGenerateClipJob, GenerationJobRequestError } from "@/server/storycam/generationJobService";

type GenerateClipRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function POST(request: Request, context: GenerateClipRouteContext) {
  try {
    const user = await requireUser();
    const params = await context.params;
    const result = await createGenerateClipJob(createSupabaseAdminClient(), user.id, params.id, await request.json());

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

    if (error instanceof GenerationJobRequestError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "Invalid generation job request.",
          redactionApplied: true
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "generation_job_failed",
        redactedError: "Generation job request failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}
