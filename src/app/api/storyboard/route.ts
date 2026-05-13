import { NextResponse } from "next/server";
import { redactForLog } from "@/lib/privacy/redact";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import { createConfiguredStoryboardImageProvider } from "@/server/storycam/storyboardImageProviderFactory";
import { createConfiguredStoryboardProvider } from "@/server/storycam/storyboardProviderFactory";
import { createStoryboard, StoryboardRequestError } from "@/server/storycam/storyboardService";
import { assertStoryCamDailyJobQuota, quotaErrorResponse, StoryCamQuotaError } from "@/server/storycam/quotaService";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const config = loadStoryCamConfig();
    const provider = createConfiguredStoryboardProvider(config);
    const imageProvider = createConfiguredStoryboardImageProvider(config);
    const requestBody = await parseStoryboardJson(request);
    const client = createSupabaseAdminClient();
    await assertStoryCamDailyJobQuota(client, user.id, config, "image");
    const result = await createStoryboard(client, user.id, requestBody, provider, imageProvider, {
      providerReferenceSignedUrlTtlSeconds: config.media.providerReferenceSignedUrlTtlSeconds
    });
    const responseHeaders = {
      "x-storycam-text-provider": provider?.providerName ?? "mock",
      "x-storycam-image-provider": imageProvider?.providerName ?? "mock"
    };

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.errorCode,
          redactedError: result.redactedError,
          redactionApplied: true
        },
        { headers: responseHeaders, status: 502 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        ...result.value
      },
      { headers: responseHeaders, status: 201 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 });
    }

    if (error instanceof StoryboardRequestError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "Invalid storyboard request.",
          redactionApplied: true
        },
        { status: error.code === "story_world_asset_images_not_ready" ? 409 : 400 }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: "invalid_input",
          redactedError: "Invalid storyboard request.",
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

    console.error("storyboard route failed", redactForLog(error));

    return NextResponse.json(
      {
        error: "storyboard_failed",
        redactedError: "Storyboard generation failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}

async function parseStoryboardJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new SyntaxError("Invalid storyboard JSON request body.");
  }
}
