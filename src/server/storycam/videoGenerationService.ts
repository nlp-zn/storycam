import type { SupabaseClient } from "@supabase/supabase-js";
import { generatedClipSchema } from "@/features/storycam/domain/artifactSchemas";
import type { GeneratedClip } from "@/features/storycam/domain/artifacts";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type { ProviderResult } from "@/lib/providers/types";
import type { Database, Json, StoryCamArtifactRow } from "@/server/db/types";
import { StoryCamArtifactRepository } from "./artifactRepository";
import {
  storyCamGeneratedMediaMaxBytes,
  writeGeneratedStoryCamMedia,
  type WriteGeneratedStoryCamMediaResult
} from "./generatedMediaService";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";

export type StoreProviderGeneratedClipInput = {
  clipPromptPacketId: string;
  coreGroupId: string;
  durationSeconds: number;
  fetch?: typeof fetch;
  inputArtifactVersions?: Record<string, number>;
  jobId: string;
  providerName: string;
  providerRequestId?: string;
  reviewState?: GeneratedClip["reviewState"];
  sessionId: string;
  userId: string;
  videoUrl: string;
};

export type StoreProviderGeneratedClipOutput = {
  artifact: {
    id: string;
    state: StoryCamArtifactRow["state"];
    type: StoryCamArtifactRow["type"];
    version: number;
  };
  generatedClip: GeneratedClip;
  media: WriteGeneratedStoryCamMediaResult;
};

const identity = {
  providerKind: "video",
  providerName: "seedance_2_0"
} as const;
const mockIdentity = {
  providerKind: "video",
  providerName: "mock"
} as const;
const allowedProviderVideoMimeTypes = new Set(["video/mp4", "application/octet-stream"]);
const providerVideoDownloadTimeoutMs = 60_000;
const providerVideoSizeLimitError = "Provider video download exceeded the StoryCam media size limit.";

export type StoreMockGeneratedClipInput = Omit<StoreProviderGeneratedClipInput, "fetch" | "providerName" | "providerRequestId" | "videoUrl">;

export async function storeMockGeneratedClipForJob(
  client: SupabaseClient<Database>,
  input: StoreMockGeneratedClipInput
): Promise<ProviderResult<StoreProviderGeneratedClipOutput>> {
  try {
    const jobs = new StoryCamGenerationJobRepository(client);
    const job = await jobs.findById(input.userId, input.jobId);

    if (!job || job.tombstoned_at || !canAcceptProviderResult(job.status)) {
      return providerFailure(mockIdentity, new Error("Late mock result discarded."), {
        errorCode: "MOCK_VIDEO_LATE_RESULT_DISCARDED",
        retryable: false
      });
    }

    const media = await writeGeneratedStoryCamMedia(client, {
      bytes: createMockMp4Bytes(input),
      kind: "generated_clip",
      mimeType: "video/mp4",
      sessionId: input.sessionId,
      source: "provider",
      userId: input.userId
    });
    const generatedClip = generatedClipSchema.parse({
      clipPromptPacketId: input.clipPromptPacketId,
      coreGroupId: input.coreGroupId,
      durationSeconds: input.durationSeconds,
      id: `generated-clip-${input.coreGroupId}`,
      jobId: input.jobId,
      mediaAssetId: media.id,
      providerName: "mock",
      reviewState: input.reviewState ?? "pending",
      sessionId: input.sessionId,
      state: "ready",
      version: 1
    });
    const artifact = requireArtifactRow(
      await new StoryCamArtifactRepository(client).createVersion(input.userId, {
        dataJson: generatedClip,
        dependsOnJson: input.inputArtifactVersions ?? ({} satisfies Json),
        sessionId: input.sessionId,
        state: "ready",
        type: "generated_clip",
        version: generatedClip.version
      })
    );
    const completedJob = await jobs.markSucceeded(input.userId, input.jobId, {
      outputArtifactId: artifact.id
    });

    if (!completedJob) {
      return providerFailure(mockIdentity, new Error("Late mock result discarded."), {
        errorCode: "MOCK_VIDEO_LATE_RESULT_DISCARDED",
        retryable: false
      });
    }

    return providerSuccess(mockIdentity, {
      artifact: toArtifactRef(artifact),
      generatedClip,
      media
    });
  } catch (error) {
    return providerFailure(mockIdentity, error, {
      errorCode: "MOCK_VIDEO_CLIP_STORE_FAILED",
      retryable: true
    });
  }
}

export async function storeProviderGeneratedClip(
  client: SupabaseClient<Database>,
  input: StoreProviderGeneratedClipInput
): Promise<ProviderResult<StoreProviderGeneratedClipOutput>> {
  const providerIdentity = {
    ...identity,
    ...(input.providerRequestId ? { providerRequestId: input.providerRequestId } : {})
  };

  try {
    const jobs = new StoryCamGenerationJobRepository(client);
    const job = await jobs.findById(input.userId, input.jobId);

    if (!job || job.tombstoned_at || !canAcceptProviderResult(job.status)) {
      return providerFailure(providerIdentity, new Error("Late provider result discarded."), {
        errorCode: "SEEDANCE_LATE_RESULT_DISCARDED",
        retryable: false
      });
    }

    const bytes = await downloadProviderVideo(input.fetch ?? fetch, input.videoUrl);
    const media = await writeGeneratedStoryCamMedia(client, {
      bytes,
      kind: "generated_clip",
      mimeType: "video/mp4",
      sessionId: input.sessionId,
      source: "provider",
      userId: input.userId
    });
    const generatedClip = generatedClipSchema.parse({
      clipPromptPacketId: input.clipPromptPacketId,
      coreGroupId: input.coreGroupId,
      durationSeconds: input.durationSeconds,
      id: `generated-clip-${input.coreGroupId}`,
      jobId: input.jobId,
      mediaAssetId: media.id,
      providerName: input.providerName,
      reviewState: input.reviewState ?? "pending",
      sessionId: input.sessionId,
      state: "ready",
      version: 1
    });
    const artifact = requireArtifactRow(
      await new StoryCamArtifactRepository(client).createVersion(input.userId, {
        dataJson: generatedClip,
        dependsOnJson: input.inputArtifactVersions ?? ({} satisfies Json),
        sessionId: input.sessionId,
        state: "ready",
        type: "generated_clip",
        version: generatedClip.version
      })
    );

    const completedJob = await jobs.markSucceeded(input.userId, input.jobId, {
      outputArtifactId: artifact.id
    });

    if (!completedJob) {
      return providerFailure(providerIdentity, new Error("Late provider result discarded."), {
        errorCode: "SEEDANCE_LATE_RESULT_DISCARDED",
        retryable: false
      });
    }

    return providerSuccess(providerIdentity, {
      artifact: toArtifactRef(artifact),
      generatedClip,
      media
    });
  } catch (error) {
    return providerFailure(providerIdentity, error, {
      errorCode: "SEEDANCE_CLIP_STORE_FAILED",
      retryable: true
    });
  }
}

async function downloadProviderVideo(request: typeof fetch, videoUrl: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerVideoDownloadTimeoutMs);

  try {
    const response = await request(videoUrl, { signal: controller.signal });

    assertProviderVideoResponse(response);

    return await readProviderVideoBody(response);
  } finally {
    clearTimeout(timeout);
  }
}

function assertProviderVideoResponse(response: Response): void {
  if (!response.ok) {
    throw new Error("Provider video download failed.");
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();

  if (mimeType && !allowedProviderVideoMimeTypes.has(mimeType)) {
    throw new Error("Provider video download returned an unsupported media type.");
  }

  const contentLength = response.headers.get("content-length");

  if (!contentLength) {
    return;
  }

  const declaredByteSize = Number(contentLength);

  if (!Number.isFinite(declaredByteSize) || declaredByteSize > storyCamGeneratedMediaMaxBytes) {
    throw new Error(providerVideoSizeLimitError);
  }
}

async function readProviderVideoBody(response: Response): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.byteLength > storyCamGeneratedMediaMaxBytes) {
      throw new Error(providerVideoSizeLimitError);
    }

    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    byteLength += value.byteLength;

    if (byteLength > storyCamGeneratedMediaMaxBytes) {
      await reader.cancel();
      throw new Error(providerVideoSizeLimitError);
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function requireArtifactRow(row: StoryCamArtifactRow | null) {
  if (!row) {
    throw new Error("StoryCam generated clip artifact write failed.");
  }

  return row;
}

function toArtifactRef(row: StoryCamArtifactRow): StoreProviderGeneratedClipOutput["artifact"] {
  return {
    id: row.id,
    state: row.state,
    type: row.type,
    version: row.version
  };
}

function canAcceptProviderResult(status: string) {
  return status === "queued" || status === "running";
}

function createMockMp4Bytes(input: Pick<StoreMockGeneratedClipInput, "coreGroupId" | "durationSeconds">) {
  return new TextEncoder().encode(`storycam-mock-mp4\ncoreGroup=${input.coreGroupId}\nduration=${input.durationSeconds}\n`);
}
