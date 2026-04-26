import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { StoryCamMediaStoreError } from "@/server/storycam/mediaStore";
import { parseUploadFormData, StoryCamUploadRequestError, uploadStoryCamPhoto } from "@/server/storycam/uploadPhotoService";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { file, sessionId } = await parseUploadFormData(request);
    const media = await uploadStoryCamPhoto(createSupabaseAdminClient(), {
      file,
      sessionId,
      userId: user.id
    });

    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "authentication_required" }, { status: 401 });
    }

    if (error instanceof StoryCamUploadRequestError || error instanceof StoryCamMediaStoreError) {
      return NextResponse.json({ error: error.code }, { status: 400 });
    }

    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
