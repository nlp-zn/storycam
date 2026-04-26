import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";
import { StoryCamMediaStoreError } from "@/server/storycam/mediaStore";
import { StoryCamSessionRepository } from "@/server/storycam/sessionRepository";
import { parseUploadFormData, StoryCamUploadRequestError, uploadStoryCamPhoto } from "@/server/storycam/uploadPhotoService";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { file, sessionId } = await parseUploadFormData(request);
    const client = createSupabaseAdminClient();
    const session = sessionId ? undefined : await new StoryCamSessionRepository(client).create(user.id);
    const targetSessionId = sessionId ?? session?.id;

    if (!targetSessionId) {
      return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    }

    const media = await uploadStoryCamPhoto(client, {
      file,
      sessionId: targetSessionId,
      userId: user.id
    });
    const uploadedPhotoRefs = [{ mediaAssetId: media.id }];

    return NextResponse.json(
      {
        ok: true,
        media: {
          byteSize: media.byteSize,
          id: media.id,
          kind: "uploaded_photo",
          mimeType: media.mimeType
        },
        sessionId: targetSessionId,
        uploadedPhotoIds: uploadedPhotoRefs.map((ref) => ref.mediaAssetId),
        uploadedPhotoRefs
      },
      { status: 201 }
    );
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
