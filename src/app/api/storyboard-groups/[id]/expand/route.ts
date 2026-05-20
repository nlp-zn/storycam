import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import { createExpandedStoryboardCards, ExpansionRequestError } from "@/server/storycam/expansionService";
import { premiereTicketErrorResponse, StoryCamPremiereTicketError } from "@/server/storycam/premiereTicketService";
import { assertStoryCamDailyJobQuota, quotaErrorResponse, StoryCamQuotaError } from "@/server/storycam/quotaService";
import { createConfiguredStoryboardImageProvider } from "@/server/storycam/storyboardImageProviderFactory";

type ExpansionRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function POST(request: Request, context: ExpansionRouteContext) {
  try {
    const user = await requireUser();
    const params = await context.params;
    const config = loadStoryCamConfig();
    const imageProvider = createConfiguredStoryboardImageProvider(config);
    const client = createSupabaseAdminClient();
    await assertStoryCamDailyJobQuota(client, user.id, config, "image");
    const result = await createExpandedStoryboardCards(
      client,
      user.id,
      params.id,
      await request.json(),
      imageProvider,
      {
        providerReferenceSignedUrlTtlSeconds: config.media.providerReferenceSignedUrlTtlSeconds
      }
    );

    return NextResponse.json(
      {
        ok: true,
        ...result.value
      },
      {
        headers: {
          "x-storycam-image-provider": imageProvider?.providerName ?? "mock"
        },
        status: 201
      }
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
        error: "expansion_failed",
        redactedError: "Storyboard expansion failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}
