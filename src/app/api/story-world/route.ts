import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import { createConfiguredStoryWorldProvider } from "@/server/storycam/storyWorldProviderFactory";
import { premiereTicketErrorResponse, StoryCamPremiereTicketError } from "@/server/storycam/premiereTicketService";
import { createStoryWorld, createStoryWorldJob, StoryWorldRequestError } from "@/server/storycam/storyWorldService";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const config = loadStoryCamConfig();
    const provider = createConfiguredStoryWorldProvider(config);
    const requestBody = await request.json();
    const client = createSupabaseAdminClient();
    const providerName = provider?.providerName ?? "mock";
    const responseHeaders = {
      "x-storycam-text-provider": providerName
    };
    const diagnostics = storyWorldDiagnostics(providerName);

    if (config.generation.mode === "real" && providerName !== "mock") {
      const job = await createStoryWorldJob(client, user.id, requestBody, {
        generationMode: config.generation.mode,
        providerName
      });

      return NextResponse.json(
        {
          ...(diagnostics ? { diagnostics } : {}),
          job,
          ok: true,
          providerName: job.providerName,
          sessionId: job.sessionId,
          status: job.status
        },
        { headers: responseHeaders, status: 202 }
      );
    }

    const result = await createStoryWorld(client, user.id, requestBody, provider);

    if (!result.ok) {
      return NextResponse.json(
        {
          ...(diagnostics ? { diagnostics } : {}),
          error: result.errorCode,
          redactedError: result.redactedError,
          redactionApplied: true
        },
        { headers: responseHeaders, status: 502 }
      );
    }

    return NextResponse.json(
      {
        ...(diagnostics ? { diagnostics } : {}),
        ok: true,
        ...result.value
      },
      { headers: responseHeaders, status: 201 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 });
    }

    if (error instanceof StoryWorldRequestError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "Invalid story world request.",
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

    if (error instanceof StoryCamPremiereTicketError) {
      return premiereTicketErrorResponse(error);
    }

    return NextResponse.json(
      {
        error: "story_world_failed",
        redactedError: "Story world generation failed.",
        redactionApplied: true
      },
      { status: 500 }
    );
  }
}

function storyWorldDiagnostics(providerName: string) {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  return {
    textProvider: providerName
  };
}
