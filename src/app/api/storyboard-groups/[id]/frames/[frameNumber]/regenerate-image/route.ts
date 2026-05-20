import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import {
  ExpansionRequestError,
  regenerateStoryboardFrameImage,
  type ExpansionRequestBody
} from "@/server/storycam/expansionService";
import { premiereTicketErrorResponse, StoryCamPremiereTicketError } from "@/server/storycam/premiereTicketService";
import { assertStoryCamDailyJobQuota, quotaErrorResponse, StoryCamQuotaError } from "@/server/storycam/quotaService";
import { createConfiguredStoryboardImageProvider } from "@/server/storycam/storyboardImageProviderFactory";

type RegenerateFrameRouteContext = {
  params: Promise<{ frameNumber: string; id: string }> | { frameNumber: string; id: string };
};

type RegenerateFrameFallback = {
  frameNumber: number;
  image: {
    placeholder: true;
    reason: "storage_failed";
    status: "placeholder";
  };
  ok: true;
  sessionId: string;
};

export async function POST(request: Request, context: RegenerateFrameRouteContext) {
  let body: unknown;
  let frameNumber = 0;

  try {
    const user = await requireUser();
    const params = await context.params;
    frameNumber = Number(params.frameNumber);
    try {
      body = await request.json();
    } catch {
      throw new ExpansionRequestError("invalid_input");
    }

    const config = loadStoryCamConfig();
    const imageProvider = createConfiguredStoryboardImageProvider(config);
    const client = createSupabaseAdminClient();
    await assertStoryCamDailyJobQuota(client, user.id, config, "image");
    const result = await regenerateStoryboardFrameImage(
      client,
      user.id,
      params.id,
      body as ExpansionRequestBody,
      frameNumber,
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
        status: 202
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
          redactedError: "Invalid storyboard frame image request.",
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

    return NextResponse.json(fallbackRegenerateFrame(body, frameNumber), { status: 202 });
  }
}

function fallbackRegenerateFrame(body: unknown, frameNumber: number): RegenerateFrameFallback {
  return {
    frameNumber,
    image: {
      placeholder: true,
      reason: "storage_failed",
      status: "placeholder"
    },
    ok: true,
    sessionId: fallbackSessionId(body)
  };
}

function fallbackSessionId(body: unknown) {
  if (isRecord(body) && typeof body.sessionId === "string") {
    return body.sessionId;
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
