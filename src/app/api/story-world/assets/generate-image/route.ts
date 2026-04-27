import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import {
  generateStoryWorldAssetImage,
  StoryWorldAssetImageRequestError
} from "@/server/storycam/storyWorldAssetImageService";
import { createConfiguredStoryWorldAssetImageProvider } from "@/server/storycam/storyWorldAssetImageProviderFactory";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const config = loadStoryCamConfig();
    const provider = createConfiguredStoryWorldAssetImageProvider(config);
    const result = await generateStoryWorldAssetImage(createSupabaseAdminClient(), user.id, await request.json(), provider);

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
        ok: true,
        ...result.value
      },
      { status: 201 }
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

    return NextResponse.json(
      {
        error: "asset_image_failed",
        redactedError: "Asset image generation failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}
