import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import { ExpansionRequestError, regenerateStoryboardFrameImage } from "@/server/storycam/expansionService";
import { createConfiguredStoryboardImageProvider } from "@/server/storycam/storyboardImageProviderFactory";

type RegenerateFrameRouteContext = {
  params: Promise<{ frameNumber: string; id: string }> | { frameNumber: string; id: string };
};

export async function POST(request: Request, context: RegenerateFrameRouteContext) {
  try {
    const user = await requireUser();
    const params = await context.params;
    const frameNumber = Number(params.frameNumber);
    const config = loadStoryCamConfig();
    const imageProvider = createConfiguredStoryboardImageProvider(config);
    const result = await regenerateStoryboardFrameImage(
      createSupabaseAdminClient(),
      user.id,
      params.id,
      await request.json(),
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

    return NextResponse.json(
      {
        error: "storyboard_frame_image_failed",
        redactedError: "Storyboard frame image regeneration failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}
