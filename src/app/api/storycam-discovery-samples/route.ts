import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createDiscoverySampleSignedAssets } from "@/server/storycam/discoverySampleAssets";

export async function GET() {
  try {
    const result = await createDiscoverySampleSignedAssets(createSupabaseAdminClient());

    return NextResponse.json(
      {
        assets: result.assets,
        ok: true,
        signedUrlExpiresIn: result.signedUrlExpiresIn,
        unavailableIds: result.unavailableIds
      },
      { headers: { "Cache-Control": "no-store" }, status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        assets: [],
        error: "discovery_samples_unavailable",
        ok: false,
        redactedError: "StoryCam discovery samples are temporarily unavailable.",
        redactionApplied: true
      },
      { headers: { "Cache-Control": "no-store" }, status: 500 }
    );
  }
}

