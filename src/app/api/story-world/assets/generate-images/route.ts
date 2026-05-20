import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import { assertStoryCamDailyJobQuota, quotaErrorResponse, StoryCamQuotaError } from "@/server/storycam/quotaService";
import { premiereTicketErrorResponse, StoryCamPremiereTicketError } from "@/server/storycam/premiereTicketService";
import {
  StoryWorldAssetImageRequestError,
  type StoryWorldAssetImagesRequestBody,
  submitStoryWorldAssetImageJobs
} from "@/server/storycam/storyWorldAssetImageService";
import { createConfiguredStoryWorldAssetImageProvider } from "@/server/storycam/storyWorldAssetImageProviderFactory";

type BatchAssetImageFallback = {
  assetArtifactId: string;
  assetKind: "scene";
  image: {
    placeholder: true;
    reason: "storage_failed";
    redactedError: string;
    status: "placeholder";
  };
};

export async function POST(request: Request) {
  let body: unknown;

  try {
    const user = await requireUser();
    try {
      body = await request.json();
    } catch {
      throw new StoryWorldAssetImageRequestError("invalid_input");
    }

    const config = loadStoryCamConfig();
    const provider = createConfiguredStoryWorldAssetImageProvider(config);
    const client = createSupabaseAdminClient();
    await assertStoryCamDailyJobQuota(client, user.id, config, "image");
    const result = await submitStoryWorldAssetImageJobs(
      client,
      user.id,
      body as StoryWorldAssetImagesRequestBody,
      provider
    );

    return NextResponse.json(
      {
        ok: true,
        ...result.value
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 });
    }

    if (error instanceof StoryWorldAssetImageRequestError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "Invalid asset image request.",
          redactionApplied: true
        },
        { status: error.code === "image_provider_not_configured" ? 409 : 400 }
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

    return NextResponse.json({ ok: true, imagesByArtifactId: fallbackBatchAssetImages(body) }, { status: 202 });
  }
}

function fallbackBatchAssetImages(body: unknown): Record<string, BatchAssetImageFallback> {
  return Object.fromEntries(
    assetArtifactIdsFromBody(body).map((assetArtifactId) => [assetArtifactId, fallbackAssetImage(assetArtifactId)])
  );
}

function fallbackAssetImage(assetArtifactId: string): BatchAssetImageFallback {
  return {
    assetArtifactId,
    assetKind: "scene",
    image: {
      placeholder: true,
      reason: "storage_failed",
      redactedError: "Asset image generation is temporarily unavailable.",
      status: "placeholder"
    }
  };
}

function assetArtifactIdsFromBody(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.assetArtifactIds)) {
    return [];
  }

  return body.assetArtifactIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
