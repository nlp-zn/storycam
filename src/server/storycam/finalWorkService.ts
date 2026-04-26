import type { SupabaseClient } from "@supabase/supabase-js";
import { finalWorkSchema } from "@/features/storycam/domain/artifactSchemas";
import type { FinalWork } from "@/features/storycam/domain/artifacts";
import type {
  FfmpegComposerInput,
  FfmpegComposerOutput
} from "@/lib/providers/finalWork/ffmpegComposer";
import type { FinalWorkComposer } from "@/lib/providers/types";
import type { Database } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { writeGeneratedStoryCamMedia, type WriteGeneratedStoryCamMediaResult } from "./generatedMediaService";

export type ComposeFinalWorkInput = {
  clips: FfmpegComposerInput["clips"];
  inputArtifactVersions?: Record<string, number>;
  sessionId: string;
  userId: string;
};

export type ComposeFinalWorkOutput = {
  finalWork: FinalWork;
  media: WriteGeneratedStoryCamMediaResult;
};

export async function composeAndStoreFinalWork(
  client: SupabaseClient<Database>,
  composer: FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput>,
  input: ComposeFinalWorkInput
) {
  const composed = await composer.compose({ clips: input.clips });

  if (!composed.ok) {
    return composed;
  }

  const media = await writeGeneratedStoryCamMedia(client, {
    bytes: composed.value.bytes,
    kind: "final_work",
    mimeType: "video/mp4",
    sessionId: input.sessionId,
    source: "composer",
    userId: input.userId
  });
  const finalWork = finalWorkSchema.parse({
    durationSeconds: composed.value.durationSeconds,
    generatedClipIds: input.clips.map((clip) => clip.generatedClipId),
    id: "final-work-1",
    mediaAssetId: media.id,
    previewStatus: "ready",
    sessionId: input.sessionId,
    state: "ready",
    version: 1
  });
  const artifact = await new StoryCamArtifactRepository(client).createVersion(input.userId, {
    dataJson: finalWork,
    dependsOnJson: input.inputArtifactVersions ?? {},
    sessionId: input.sessionId,
    state: "ready",
    type: "final_work",
    version: 1
  });

  if (!artifact) {
    throw new Error("StoryCam final work failed to create artifact metadata.");
  }

  return {
    ok: true,
    providerKind: composed.providerKind,
    providerName: composed.providerName,
    value: {
      finalWork,
      media
    }
  } as const;
}
