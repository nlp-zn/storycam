import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import {
  submitStoryWorldAssetImageJob,
  type StoryWorldAssetImageRequestBody,
  StoryWorldAssetImageRequestError
} from "@/server/storycam/storyWorldAssetImageService";
import { createConfiguredStoryWorldAssetImageProvider } from "@/server/storycam/storyWorldAssetImageProviderFactory";

type AssetImageFallback = {
  assetArtifactId: string;
  assetKind: "character" | "scene";
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
    const result = await submitStoryWorldAssetImageJob(
      createSupabaseAdminClient(),
      user.id,
      body as StoryWorldAssetImageRequestBody,
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

    return NextResponse.json({ ok: true, ...fallbackSingleAssetImage(body) }, { status: 202 });
  }
}

function fallbackSingleAssetImage(body: unknown): AssetImageFallback {
  return {
    assetArtifactId: assetArtifactIdFromBody(body),
    assetKind: assetKindFromBody(body),
    image: {
      placeholder: true,
      reason: "storage_failed",
      redactedError: "Asset image generation is temporarily unavailable.",
      status: "placeholder"
    }
  };
}

function assetArtifactIdFromBody(body: unknown): string {
  if (isRecord(body) && typeof body.assetArtifactId === "string" && body.assetArtifactId.trim()) {
    return body.assetArtifactId;
  }

  return "unknown-asset";
}

function assetKindFromBody(body: unknown): "character" | "scene" {
  if (isRecord(body) && (body.assetKind === "character" || body.assetKind === "scene")) {
    return body.assetKind;
  }

  return "scene";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
