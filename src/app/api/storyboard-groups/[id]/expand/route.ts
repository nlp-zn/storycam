import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { createExpandedStoryboardCards, ExpansionRequestError } from "@/server/storycam/expansionService";

type ExpansionRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function POST(request: Request, context: ExpansionRouteContext) {
  try {
    const user = await requireUser();
    const params = await context.params;
    const result = await createExpandedStoryboardCards(createSupabaseAdminClient(), user.id, params.id, await request.json());

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

    if (error instanceof ExpansionRequestError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "Invalid expansion request.",
          redactionApplied: true
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "expansion_failed",
        redactedError: "Storyboard expansion failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}
