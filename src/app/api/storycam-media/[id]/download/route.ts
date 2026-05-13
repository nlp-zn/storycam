import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { downloadFinalWorkMp4, StoryCamMediaDownloadError } from "@/server/storycam/mediaDownloadService";
import { StoryCamMediaStoreError } from "@/server/storycam/mediaStore";

type StoryCamMediaDownloadRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(_request: Request, context: StoryCamMediaDownloadRouteContext) {
  try {
    const user = await requireUser();
    const params = await context.params;
    const result = await downloadFinalWorkMp4(createSupabaseAdminClient(), user.id, params.id ?? "");
    const body = new ArrayBuffer(result.bytes.byteLength);

    new Uint8Array(body).set(result.bytes);

    return new NextResponse(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.bytes.byteLength),
        "Content-Type": result.mimeType,
        "X-Content-Type-Options": "nosniff"
      },
      status: 200
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "authentication_required" }, { headers: { "Cache-Control": "no-store" }, status: 401 });
    }

    if (error instanceof StoryCamMediaDownloadError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "StoryCam media was not found.",
          redactionApplied: true
        },
        { headers: { "Cache-Control": "no-store" }, status: error.code === "invalid_media_id" ? 400 : 404 }
      );
    }

    if (error instanceof StoryCamMediaStoreError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "StoryCam media download failed.",
          redactionApplied: true
        },
        { headers: { "Cache-Control": "no-store" }, status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "media_download_failed",
        redactedError: "StoryCam media download failed.",
        redactionApplied: true
      },
      { headers: { "Cache-Control": "no-store" }, status: 500 }
    );
  }
}
