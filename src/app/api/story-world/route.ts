import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import { createConfiguredStoryWorldProvider } from "@/server/storycam/storyWorldProviderFactory";
import { createStoryWorld, StoryWorldRequestError } from "@/server/storycam/storyWorldService";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const config = loadStoryCamConfig();
    const provider = createConfiguredStoryWorldProvider(config);
    const result = await createStoryWorld(createSupabaseAdminClient(), user.id, await request.json(), provider);

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
