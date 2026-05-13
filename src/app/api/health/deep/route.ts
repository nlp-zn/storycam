import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";
import type { Database } from "@/server/db/types";

export async function GET(request: Request) {
  try {
    const token = process.env.STORYCAM_DEEP_HEALTH_TOKEN;

    if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
      return NextResponse.json({ error: "not_found" }, { headers: { "Cache-Control": "no-store" }, status: 404 });
    }

    const config = loadStoryCamConfig();
    const client = createClient<Database>(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error: dbError } = await client.from("storycam_sessions").select("id", { count: "exact", head: true }).limit(1);
    const { data: buckets, error: bucketError } = await client.storage.listBuckets();
    const bucketNames = new Set((buckets ?? []).map((bucket) => bucket.name));
    const missingBuckets = ["storycam-generated", "storycam-uploads"].filter((bucket) => !bucketNames.has(bucket));

    if (dbError || bucketError || missingBuckets.length > 0) {
      return NextResponse.json(
        {
          database: dbError ? "error" : "ok",
          ...(missingBuckets.length > 0 ? { missingBuckets } : {}),
          ok: false,
          storage: bucketError ? "error" : missingBuckets.length > 0 ? "missing_bucket" : "ok"
        },
        { headers: { "Cache-Control": "no-store" }, status: 503 }
      );
    }

    return NextResponse.json(
      {
        database: "ok",
        ok: true,
        storage: "ok"
      },
      { headers: { "Cache-Control": "no-store" }, status: 200 }
    );
  } catch (error) {
    if (error instanceof StoryCamConfigError) {
      const redacted = redactConfigError(error);

      return NextResponse.json(
        {
          error: redacted.code,
          ok: false,
          redactedError: redacted.message,
          redactionApplied: true
        },
        { headers: { "Cache-Control": "no-store" }, status: 503 }
      );
    }

    return NextResponse.json({ error: "deep_health_failed", ok: false }, { headers: { "Cache-Control": "no-store" }, status: 503 });
  }
}
