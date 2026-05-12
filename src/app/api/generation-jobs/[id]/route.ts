import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import { GenerationJobRequestError, getGenerationJob } from "@/server/storycam/generationJobService";
import { createConfiguredStoryboardImageProvider } from "@/server/storycam/storyboardImageProviderFactory";
import { createConfiguredStoryWorldAssetImageProvider } from "@/server/storycam/storyWorldAssetImageProviderFactory";
import { createConfiguredVideoProviders } from "@/server/storycam/videoProviderFactory";

type GenerationJobRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(_request: Request, context: GenerationJobRouteContext) {
  try {
    const user = await requireUser();
    const params = await context.params;
    const config = loadStoryCamConfig();
    const storyboardImageProvider = createConfiguredStoryboardImageProvider(config);
    const storyWorldImageProvider = createConfiguredStoryWorldAssetImageProvider(config);
    const videoProviders = createConfiguredVideoProviders(config);
    const result = await getGenerationJob(
      createSupabaseAdminClient(),
      user.id,
      params.id,
      (storyboardImageProvider ?? storyWorldImageProvider) as Parameters<typeof getGenerationJob>[3],
      videoProviders
    );

    return NextResponse.json(
      {
        ok: true,
        ...result.value
      },
      { status: 200 }
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
        { status: error.code === "job_not_found" ? 404 : 400 }
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
