import { NextResponse } from "next/server";
import { loadStoryCamConfig, redactConfigError, StoryCamConfigError } from "@/server/config";

export async function GET() {
  try {
    const config = loadStoryCamConfig();

    return NextResponse.json(
      {
        ok: true,
        generationMode: config.generation.mode,
        service: "storycam-web"
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 200
      }
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
        {
          headers: { "Cache-Control": "no-store" },
          status: 503
        }
      );
    }

    return NextResponse.json({ error: "health_check_failed", ok: false }, { headers: { "Cache-Control": "no-store" }, status: 503 });
  }
}
