import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import { createFinalWorkJobFromSuggestion, FinalWorkRequestError } from "@/server/storycam/finalWorkService";
import { StoryCamMediaStoreError } from "@/server/storycam/mediaStore";
import { premiereTicketErrorResponse, StoryCamPremiereTicketError } from "@/server/storycam/premiereTicketService";
import { assertStoryCamDailyJobQuota, quotaErrorResponse, StoryCamQuotaError } from "@/server/storycam/quotaService";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const config = loadStoryCamConfig();
    const client = createSupabaseAdminClient();
    await assertStoryCamDailyJobQuota(client, user.id, config, "final_work");
    const job = await createFinalWorkJobFromSuggestion(client, user.id, await request.json(), config.generation.mode);

    return NextResponse.json(
      {
        job,
        ok: true,
        providerName: job.providerName,
        status: job.status
      },
      { status: 202 }
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

    if (error instanceof StoryCamConfigError) {
      const redacted = redactConfigError(error);

      return NextResponse.json(
        {
          error: redacted.code,
          redactedError: redacted.message,
          redactionApplied: true
        },
        { status: 500 }
      );
    }

    if (error instanceof StoryCamQuotaError) {
      return quotaErrorResponse(error);
    }

    if (error instanceof StoryCamPremiereTicketError) {
      return premiereTicketErrorResponse(error);
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
