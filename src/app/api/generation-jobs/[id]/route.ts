import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { GenerationJobRequestError, getGenerationJob } from "@/server/storycam/generationJobService";

type GenerationJobRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(_request: Request, context: GenerationJobRouteContext) {
  try {
    const user = await requireUser();
    const params = await context.params;
    const result = await getGenerationJob(createSupabaseAdminClient(), user.id, params.id);

    return NextResponse.json(
      {
        ok: true,
        ...result.value
      },
      { status: 200 }
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
        { status: error.code === "job_not_found" ? 404 : 400 }
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
