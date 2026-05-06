import type { SupabaseClient } from "@supabase/supabase-js";
import { clipPromptPacketSchema } from "@/features/storycam/domain/artifactSchemas";
import type { ClipPromptPacket } from "@/features/storycam/domain/artifacts";
import { hashLogIdentifier } from "@/lib/privacy/redact";
import type { ProviderResult, VideoGenerationProvider } from "@/lib/providers/types";
import type { Database, GenerationJobRow } from "@/server/db/types";
import { createClipPromptPacket, ClipPromptPacketRequestError } from "./clipPromptPacketService";
import { StoryCamArtifactRepository } from "./artifactRepository";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";
import {
  resolveImageGenerationJob,
  type AsyncImageProviderOutput,
  type ImageJobState
} from "./imageGenerationJobService";
import type { ImageGenerationProvider } from "@/lib/providers/types";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { createStoryCamSignedUrl, storyCamSignedUrlTtlSeconds } from "./mediaStore";
import { storeProviderGeneratedClip } from "./videoGenerationService";

export type GenerateClipRequestBody = {
  confirmedArtifactVersions?: unknown;
  coreStoryboardGroupId?: unknown;
  generationMode?: unknown;
  idempotencyKey?: unknown;
  providerSendConfirmed?: unknown;
  sessionId?: unknown;
};

export type GenerationJobSummary = {
  attempts: number;
  id: string;
  outputArtifactId?: string;
  providerKind: GenerationJobRow["provider_kind"];
  providerName: string;
  redactedError?: string;
  sessionId: string;
  status: GenerationJobRow["status"];
  type: GenerationJobRow["type"];
};

export type GenerationJobServiceImageProvider = ImageGenerationProvider<unknown, AsyncImageProviderOutput>;
export type GenerationJobServiceVideoInput = {
  durationSeconds: number;
  generateAudio?: boolean;
  prompt: string;
  ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "adaptive";
  referenceImageUrls?: string[];
  watermark?: boolean;
};
export type GenerationJobServiceVideoOutput = {
  model: string;
  providerRequestId: string;
  seed?: number;
  status: "queued" | "running" | "succeeded" | "canceled";
  videoUrl?: string;
};
export type GenerationJobServiceVideoProvider = VideoGenerationProvider<GenerationJobServiceVideoInput, GenerationJobServiceVideoOutput> & {
  resolveClipTask?(providerRequestId: string): Promise<ProviderResult<GenerationJobServiceVideoOutput>>;
  submitClipTask?(input: GenerationJobServiceVideoInput): Promise<ProviderResult<{ providerRequestId: string }>>;
};

export type GenerateClipServiceOutput = {
  confirmationSummary: string;
  jobId: string;
  status: GenerationJobRow["status"];
};

type ParsedGenerateClipRequest = {
  confirmedArtifactVersions: Record<string, number>;
  coreStoryboardGroupId: string;
  generationMode: GenerationJobRow["generation_mode"];
  idempotencyKey: string;
  providerSendConfirmed: true;
  sessionId: string;
};

export class GenerationJobRequestError extends Error {
  constructor(readonly code: "invalid_input" | "job_not_found" | "video_provider_failed" | ClipPromptPacketRequestError["code"]) {
    super(`StoryCam generation job request error: ${code}`);
    this.name = "GenerationJobRequestError";
  }
}

export async function createGenerateClipJob(
  client: SupabaseClient<Database>,
  userId: string,
  coreStoryboardGroupId: string,
  body: GenerateClipRequestBody,
  videoProvider?: GenerationJobServiceVideoProvider
): Promise<{ ok: true; value: GenerateClipServiceOutput }> {
  const input = parseGenerateClipRequest(coreStoryboardGroupId, body);
  const jobs = new StoryCamGenerationJobRepository(client);
  const idempotencyKeyHash = hashLogIdentifier(input.idempotencyKey);
  const existingJob = await jobs.findActiveByIdempotencyKey(userId, idempotencyKeyHash);

  if (existingJob) {
    return {
      ok: true,
      value: {
        confirmationSummary: "Clip generation is already queued for this storyboard group.",
        jobId: existingJob.id,
        status: existingJob.status
      }
    };
  }

  try {
    const packetResult = await createClipPromptPacket(client, userId, {
      confirmedArtifactVersions: input.confirmedArtifactVersions,
      coreStoryboardGroupId: input.coreStoryboardGroupId,
      providerSendConfirmed: input.providerSendConfirmed,
      sessionId: input.sessionId
    });
    const packetArtifact = packetResult.value.clipPromptPacket;
    const providerRequest = isAsyncVideoProvider(videoProvider)
      ? await videoProvider.submitClipTask(await toVideoProviderInput(client, userId, packetResult.value.clipPromptPacketPayload))
      : undefined;

    if (providerRequest && !providerRequest.ok) {
      throw new GenerationJobRequestError("video_provider_failed");
    }

    const job = requireGenerationJobRow(
      await jobs.create(userId, {
        generationMode: input.generationMode,
        idempotencyKeyHash,
        inputArtifactVersionsJson: {
          [packetArtifact.id]: packetArtifact.version,
          ...packetResult.value.clipPromptPacketPayload.inputArtifactVersions
        },
        providerKind: "video",
        providerName: videoProvider?.providerName ?? "mock",
        providerRequestId: providerRequest?.value.providerRequestId,
        sessionId: input.sessionId,
        status: providerRequest ? "running" : "queued",
        type: "video_clip"
      })
    );

    return {
      ok: true,
      value: {
        confirmationSummary: packetResult.value.confirmationSummary,
        jobId: job.id,
        status: job.status
      }
    };
  } catch (error) {
    if (error instanceof ClipPromptPacketRequestError) {
      throw new GenerationJobRequestError(error.code);
    }

    throw error;
  }
}

export async function getGenerationJob(
  client: SupabaseClient<Database>,
  userId: string,
  jobId: string,
  imageProvider?: GenerationJobServiceImageProvider,
  videoProvider?: GenerationJobServiceVideoProvider
): Promise<{ ok: true; value: { image?: ImageJobState; job: GenerationJobSummary } }> {
  if (!jobId) {
    throw new GenerationJobRequestError("invalid_input");
  }

  const job = await new StoryCamGenerationJobRepository(client).findById(userId, jobId);

  if (!job) {
    throw new GenerationJobRequestError("job_not_found");
  }

  const image = isImageJobType(job.type)
    ? await resolveImageGenerationJob(client, userId, {
        job,
        provider: imageProvider
      })
    : undefined;
  const videoResolved = job.type === "video_clip" ? await resolveVideoGenerationJob(client, userId, { job, provider: videoProvider }) : undefined;

  const refreshedJob = await new StoryCamGenerationJobRepository(client).findById(userId, jobId);

  return {
    ok: true,
    value: {
      ...(image ? { image } : {}),
      job: toJobSummary(refreshedJob ?? videoResolved ?? job)
    }
  };
}

async function resolveVideoGenerationJob(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    job: GenerationJobRow;
    provider?: GenerationJobServiceVideoProvider;
  }
) {
  if (
    input.job.status === "succeeded" ||
    input.job.status === "failed" ||
    input.job.status === "canceled" ||
    input.job.status === "expired" ||
    !input.job.provider_request_id ||
    !isAsyncVideoProvider(input.provider)
  ) {
    return input.job;
  }

  const providerResult = await input.provider.resolveClipTask(input.job.provider_request_id);
  const jobs = new StoryCamGenerationJobRepository(client);

  if (!providerResult.ok) {
    return (
      (await jobs.markFailed(userId, input.job.id, {
        errorCode: providerResult.errorCode,
        redactedError: providerResult.redactedError
      })) ?? input.job
    );
  }

  if (providerResult.value.status === "queued" || providerResult.value.status === "running") {
    return input.job.status === "queued" ? (await jobs.markRunning(userId, input.job.id)) ?? input.job : input.job;
  }

  if (providerResult.value.status === "canceled") {
    return (await jobs.markCanceled(userId, input.job.id)) ?? input.job;
  }

  if (!providerResult.value.videoUrl) {
    return (
      (await jobs.markFailed(userId, input.job.id, {
        errorCode: "SEEDANCE_INVALID_RESPONSE",
        redactedError: "Seedance completed without a downloadable video."
      })) ?? input.job
    );
  }

  const packet = await loadClipPromptPacketForJob(client, userId, input.job);
  const stored = await storeProviderGeneratedClip(client, {
    clipPromptPacketId: packet.id,
    coreGroupId: packet.coreGroupId,
    durationSeconds: packet.plannedDurationSeconds ?? 15,
    inputArtifactVersions: packet.inputArtifactVersions,
    jobId: input.job.id,
    providerName: input.job.provider_name,
    providerRequestId: input.job.provider_request_id,
    sessionId: input.job.session_id,
    userId,
    videoUrl: providerResult.value.videoUrl
  });

  if (!stored.ok) {
    return (
      (await jobs.markFailed(userId, input.job.id, {
        errorCode: stored.errorCode,
        redactedError: stored.redactedError
      })) ?? input.job
    );
  }

  return (await jobs.findById(userId, input.job.id)) ?? input.job;
}

async function loadClipPromptPacketForJob(
  client: SupabaseClient<Database>,
  userId: string,
  job: GenerationJobRow
) {
  const packetArtifactId = Object.keys((job.input_artifact_versions_json ?? {}) as Record<string, unknown>)[0];
  const rows = (await new StoryCamArtifactRepository(client).listBySession(userId, { sessionId: job.session_id, type: "clip_prompt_packet" })) ?? [];
  const versionMap = (job.input_artifact_versions_json ?? {}) as Record<string, unknown>;
  const row = rows.find(
    (artifact) =>
      artifact.type === "clip_prompt_packet" &&
      artifact.state === "ready" &&
      (artifact.id === packetArtifactId || versionMap[artifact.id] === artifact.version)
  );

  if (!row) {
    throw new GenerationJobRequestError("stale_packet");
  }

  return clipPromptPacketSchema.parse(row.data_json);
}

async function toVideoProviderInput(
  client: SupabaseClient<Database>,
  userId: string,
  packet: ClipPromptPacket
): Promise<GenerationJobServiceVideoInput> {
  const mediaRows = (await new StoryCamMediaAssetRepository(client).listBySession(userId, packet.sessionId)) ?? [];
  const referenceImageUrls = await Promise.all(
    packet.referenceImageMedia.map(async (reference) => {
      const media = mediaRows.find((row) => row.id === reference.mediaId);

      return media
        ? createStoryCamSignedUrl(
            client,
            media.storage_bucket as Parameters<typeof createStoryCamSignedUrl>[1],
            media.storage_path,
            storyCamSignedUrlTtlSeconds
          )
        : null;
    })
  );

  return {
    durationSeconds: Math.min(15, packet.plannedDurationSeconds ?? 15),
    generateAudio: false,
    prompt: packet.providerPrompt ?? packet.redactedPromptSummary,
    ratio: "16:9",
    referenceImageUrls: referenceImageUrls.filter((url): url is string => Boolean(url)),
    watermark: false
  };
}

export async function cancelGenerationJob(
  client: SupabaseClient<Database>,
  userId: string,
  jobId: string
): Promise<{ ok: true; value: { jobId: string; status: "cancel_requested" | "canceled" } }> {
  if (!jobId) {
    throw new GenerationJobRequestError("invalid_input");
  }

  const job = requireGenerationJobRow(await new StoryCamGenerationJobRepository(client).tombstone(userId, jobId));

  return {
    ok: true,
    value: {
      jobId: job.id,
      status: job.status === "cancel_requested" ? "cancel_requested" : "canceled"
    }
  };
}

function parseGenerateClipRequest(coreStoryboardGroupId: string, body: GenerateClipRequestBody): ParsedGenerateClipRequest {
  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : "";
  const requestedCoreGroupId =
    typeof body.coreStoryboardGroupId === "string" && body.coreStoryboardGroupId ? body.coreStoryboardGroupId : coreStoryboardGroupId;
  const generationMode = body.generationMode ?? "mock";

  if (!sessionId || !coreStoryboardGroupId || requestedCoreGroupId !== coreStoryboardGroupId) {
    throw new GenerationJobRequestError("invalid_input");
  }

  if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey) {
    throw new GenerationJobRequestError("invalid_input");
  }

  if (body.providerSendConfirmed !== true) {
    throw new GenerationJobRequestError("invalid_input");
  }

  if (generationMode !== "mock" && generationMode !== "real") {
    throw new GenerationJobRequestError("invalid_input");
  }

  return {
    confirmedArtifactVersions: parseConfirmedArtifactVersions(body.confirmedArtifactVersions),
    coreStoryboardGroupId,
    generationMode,
    idempotencyKey: body.idempotencyKey,
    providerSendConfirmed: body.providerSendConfirmed,
    sessionId
  };
}

function requireGenerationJobRow(job: GenerationJobRow | null) {
  if (!job) {
    throw new GenerationJobRequestError("job_not_found");
  }

  return job;
}

function parseConfirmedArtifactVersions(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.entries(value).some(([artifactId, version]) => !artifactId || typeof version !== "number" || !Number.isInteger(version) || version <= 0)
  ) {
    throw new GenerationJobRequestError("invalid_input");
  }

  return value as Record<string, number>;
}

function toJobSummary(job: GenerationJobRow): GenerationJobSummary {
  return {
    attempts: job.attempts,
    id: job.id,
    ...(job.output_artifact_id ? { outputArtifactId: job.output_artifact_id } : {}),
    providerKind: job.provider_kind,
    providerName: job.provider_name,
    ...(job.redacted_error ? { redactedError: job.redacted_error } : {}),
    sessionId: job.session_id,
    status: job.status,
    type: job.type
  };
}

function isImageJobType(type: GenerationJobRow["type"]) {
  return type === "story_world_asset_image" || type === "storyboard_image" || type === "expanded_storyboard_image";
}

function isAsyncVideoProvider(provider: GenerationJobServiceVideoProvider | undefined): provider is GenerationJobServiceVideoProvider & {
  resolveClipTask(providerRequestId: string): Promise<ProviderResult<GenerationJobServiceVideoOutput>>;
  submitClipTask(input: GenerationJobServiceVideoInput): Promise<ProviderResult<{ providerRequestId: string }>>;
} {
  return Boolean(
    provider &&
      typeof provider.resolveClipTask === "function" &&
      typeof provider.submitClipTask === "function"
  );
}
