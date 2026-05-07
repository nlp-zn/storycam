import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import { createGenerateClipJob, GenerationJobRequestError } from "@/server/storycam/generationJobService";
import { createConfiguredVideoProvider } from "@/server/storycam/videoProviderFactory";

type GenerateClipRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function POST(request: Request, context: GenerateClipRouteContext) {
  try {
    const user = await requireUser();
    const params = await context.params;
    const config = loadStoryCamConfig();
    const videoProvider = createConfiguredVideoProvider(config);
    const body = await request.json();
    const result = await createGenerateClipJob(
      createSupabaseAdminClient(),
      user.id,
      params.id,
      {
        ...body,
        generationMode: config.generation.mode
      },
      videoProvider,
      {
        providerReferenceSignedUrlTtlSeconds: config.media.providerReferenceSignedUrlTtlSeconds
      }
    );

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

    if (error instanceof GenerationJobRequestError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "Invalid generation job request.",
          redactionApplied: true
        },
        { status: error.code === "video_provider_failed" ? 502 : 400 }
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
        error: "generation_job_failed",
        redactedError: "Generation job request failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}
