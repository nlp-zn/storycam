import type { SupabaseClient } from "@supabase/supabase-js";
import { clipPromptPacketSchema, generatedClipSchema } from "@/features/storycam/domain/artifactSchemas";
import type { ClipPromptPacket } from "@/features/storycam/domain/artifacts";
import {
  defaultStoryCamVideoModel,
  parseStoryCamVideoModel,
  storyCamSeedanceOutputResolution,
  type StoryCamVideoOutputResolution,
  type StoryCamVideoModel
} from "@/features/storycam/domain/videoSettings";
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
import {
  assertStoryCamPrivateBucket,
  createStoryCamSignedUrl,
  createStoryCamProviderReferenceSignedUrl,
  storyCamSignedUrlTtlSeconds,
  storyCamProviderReferenceSignedUrlTtlSeconds,
  StoryCamMediaStoreError,
  type StoryCamPrivateBucket
} from "./mediaStore";
import { storeMockGeneratedClipForJob, storeProviderGeneratedClip } from "./videoGenerationService";

export type GenerateClipRequestBody = {
  confirmedArtifactVersions?: unknown;
  coreStoryboardGroupId?: unknown;
  generationMode?: unknown;
  idempotencyKey?: unknown;
  providerSendConfirmed?: unknown;
  sessionId?: unknown;
  videoModel?: unknown;
};

export type GenerationJobSummary = {
  attempts: number;
  id: string;
  outputArtifactId?: string;
  outputPreview?: {
    durationSeconds: number;
    mimeType: string;
    signedUrl: string;
    signedUrlExpiresIn: number;
  };
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
  resolution?: StoryCamVideoOutputResolution;
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
  outputArtifactId?: string;
  providerErrorCategory?: string;
  providerHttpStatus?: number;
  providerName: string;
  redactedError?: string;
  status: GenerationJobRow["status"];
};

type ParsedGenerateClipRequest = {
  confirmedArtifactVersions: Record<string, number>;
  coreStoryboardGroupId: string;
  generationMode: GenerationJobRow["generation_mode"];
  idempotencyKey: string;
  providerSendConfirmed: true;
  sessionId: string;
  videoModel: StoryCamVideoModel;
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
  videoProviders?: Partial<Record<StoryCamVideoModel, GenerationJobServiceVideoProvider>>,
  options: {
    providerReferenceSignedUrlTtlSeconds?: number;
  } = {}
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
        providerName: existingJob.provider_name,
        ...(existingJob.redacted_error ? { redactedError: existingJob.redacted_error } : {}),
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
    const inputArtifactVersionsJson = {
      [packetArtifact.id]: packetArtifact.version,
      ...packetResult.value.clipPromptPacketPayload.inputArtifactVersions
    };
    const videoProvider = videoProviders?.[input.videoModel];
    const providerName = videoProvider?.providerName ?? "mock";
    let providerRequest: ProviderResult<{ providerRequestId: string }> | undefined;
    let providerRequestId: string | undefined;

    if (isAsyncVideoProvider(videoProvider)) {
      let videoInput: GenerationJobServiceVideoInput;

      try {
        videoInput = await toVideoProviderInput(client, userId, packetResult.value.clipPromptPacketPayload, {
          providerReferenceSignedUrlTtlSeconds: options.providerReferenceSignedUrlTtlSeconds
        });
      } catch (error) {
        if (!(error instanceof StoryCamMediaStoreError) || error.code !== "provider_reference_url_not_public") {
          throw error;
        }

        const failedJob = await createFailedVideoClipJob(client, userId, {
          errorCode: "VIDEO_REFERENCE_MEDIA_NOT_PUBLIC",
          generationMode: input.generationMode,
          idempotencyKeyHash,
          inputArtifactVersionsJson,
          providerName,
          redactedError:
            "Storyboard reference images are only available on this local machine. Expose storage through public HTTPS before real Seedance image-reference testing.",
          sessionId: input.sessionId
        });

        return {
          ok: true,
          value: {
            confirmationSummary: packetResult.value.confirmationSummary,
            jobId: failedJob.id,
            ...(failedJob.provider_error_category ? { providerErrorCategory: failedJob.provider_error_category } : {}),
            ...(failedJob.provider_http_status !== null ? { providerHttpStatus: failedJob.provider_http_status } : {}),
            providerName: failedJob.provider_name,
            ...(failedJob.redacted_error ? { redactedError: failedJob.redacted_error } : {}),
            status: failedJob.status
          }
        };
      }

      const nonPublicReferenceUrls = findNonPublicReferenceUrls(videoInput.referenceImageUrls ?? []);

      if (nonPublicReferenceUrls.length > 0) {
        const failedJob = await createFailedVideoClipJob(client, userId, {
          errorCode: "VIDEO_REFERENCE_MEDIA_NOT_PUBLIC",
          generationMode: input.generationMode,
          idempotencyKeyHash,
          inputArtifactVersionsJson,
          providerName,
          redactedError:
            "Storyboard reference images are only available on this local machine. Expose storage through public HTTPS before real Seedance image-reference testing.",
          sessionId: input.sessionId
        });

        return {
          ok: true,
          value: {
            confirmationSummary: packetResult.value.confirmationSummary,
            jobId: failedJob.id,
            ...(failedJob.provider_error_category ? { providerErrorCategory: failedJob.provider_error_category } : {}),
            ...(failedJob.provider_http_status !== null ? { providerHttpStatus: failedJob.provider_http_status } : {}),
            providerName: failedJob.provider_name,
            ...(failedJob.redacted_error ? { redactedError: failedJob.redacted_error } : {}),
            status: failedJob.status
          }
        };
      }

      providerRequest = await submitVideoProviderTask(videoProvider, videoInput);

      if (!providerRequest.ok) {
        const failedJob = await createFailedVideoClipJob(client, userId, {
          errorCode: providerRequest.errorCode,
          generationMode: input.generationMode,
          idempotencyKeyHash,
          inputArtifactVersionsJson,
          providerErrorCategory: providerRequest.providerErrorCategory,
          providerHttpStatus: providerRequest.providerHttpStatus,
          providerName,
          redactedError: providerRequest.redactedError,
          sessionId: input.sessionId
        });

        return {
          ok: true,
          value: {
            confirmationSummary: packetResult.value.confirmationSummary,
            jobId: failedJob.id,
            ...(failedJob.provider_error_category ? { providerErrorCategory: failedJob.provider_error_category } : {}),
            ...(failedJob.provider_http_status !== null ? { providerHttpStatus: failedJob.provider_http_status } : {}),
            providerName: failedJob.provider_name,
            ...(failedJob.redacted_error ? { redactedError: failedJob.redacted_error } : {}),
            status: failedJob.status
          }
        };
      }

      providerRequestId = providerRequest.value.providerRequestId;
    }

    const job = requireGenerationJobRow(
      await jobs.create(userId, {
        generationMode: input.generationMode,
        idempotencyKeyHash,
        inputArtifactVersionsJson,
        providerKind: "video",
        providerName,
        providerRequestId,
        sessionId: input.sessionId,
        status: providerRequestId || !videoProvider ? "running" : "queued",
        type: "video_clip"
      })
    );
    const completedMockJob = !videoProvider
      ? await completeMockVideoJob(client, userId, {
          job,
          packet: packetResult.value.clipPromptPacketPayload
        })
      : undefined;
    const responseJob = completedMockJob ?? job;

    return {
      ok: true,
      value: {
        confirmationSummary: packetResult.value.confirmationSummary,
        jobId: responseJob.id,
        ...(responseJob.output_artifact_id ? { outputArtifactId: responseJob.output_artifact_id } : {}),
        ...(responseJob.provider_error_category ? { providerErrorCategory: responseJob.provider_error_category } : {}),
        ...(responseJob.provider_http_status !== null ? { providerHttpStatus: responseJob.provider_http_status } : {}),
        providerName: responseJob.provider_name,
        ...(responseJob.redacted_error ? { redactedError: responseJob.redacted_error } : {}),
        status: responseJob.status
      }
    };
  } catch (error) {
    if (error instanceof ClipPromptPacketRequestError) {
      throw new GenerationJobRequestError(error.code);
    }

    throw error;
  }
}

async function submitVideoProviderTask(
  videoProvider: GenerationJobServiceVideoProvider & {
    submitClipTask(input: GenerationJobServiceVideoInput): Promise<ProviderResult<{ providerRequestId: string }>>;
  },
  videoInput: GenerationJobServiceVideoInput
): Promise<ProviderResult<{ providerRequestId: string }>> {
  try {
    return await videoProvider.submitClipTask(videoInput);
  } catch {
    return {
      errorCode: "VIDEO_PROVIDER_SUBMISSION_ERROR",
      ok: false,
      providerKind: "video",
      providerName: videoProvider.providerName,
      redactedError: "Video provider submission failed before a remote task was created.",
      redactionApplied: true,
      retryable: true
    };
  }
}

async function createFailedVideoClipJob(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    errorCode: string;
    generationMode: GenerationJobRow["generation_mode"];
    idempotencyKeyHash: string;
    inputArtifactVersionsJson: Record<string, number>;
    providerErrorCategory?: string | null;
    providerHttpStatus?: number | null;
    providerName: string;
    redactedError: string;
    sessionId: string;
  }
) {
  const jobs = new StoryCamGenerationJobRepository(client);
  const job = requireGenerationJobRow(
    await jobs.create(userId, {
      generationMode: input.generationMode,
      idempotencyKeyHash: input.idempotencyKeyHash,
      inputArtifactVersionsJson: input.inputArtifactVersionsJson,
      providerKind: "video",
      providerName: input.providerName,
      sessionId: input.sessionId,
      status: "running",
      type: "video_clip"
    })
  );

  return (
    (await jobs.markFailed(userId, job.id, {
      errorCode: input.errorCode,
      providerErrorCategory: input.providerErrorCategory,
      providerHttpStatus: input.providerHttpStatus,
      redactedError: input.redactedError
    })) ?? job
  );
}

async function completeMockVideoJob(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    job: GenerationJobRow;
    packet: ClipPromptPacket;
  }
) {
  const stored = await storeMockGeneratedClipForJob(client, {
    clipPromptPacketId: input.packet.id,
    coreGroupId: input.packet.coreGroupId,
    durationSeconds: input.packet.plannedDurationSeconds ?? 15,
    inputArtifactVersions: input.packet.inputArtifactVersions,
    jobId: input.job.id,
    sessionId: input.job.session_id,
    userId
  });

  if (!stored.ok) {
    await new StoryCamGenerationJobRepository(client).markFailed(userId, input.job.id, {
      errorCode: stored.errorCode,
      redactedError: stored.redactedError
    });
    throw new GenerationJobRequestError("video_provider_failed");
  }

  return (
    (await new StoryCamGenerationJobRepository(client).findById(userId, input.job.id)) ?? {
      ...input.job,
      output_artifact_id: stored.value.artifact.id,
      status: "succeeded" as const
    }
  );
}

export async function getGenerationJob(
  client: SupabaseClient<Database>,
  userId: string,
  jobId: string,
  imageProvider?: GenerationJobServiceImageProvider,
  videoProviders?: Partial<Record<StoryCamVideoModel, GenerationJobServiceVideoProvider>>
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
  const jobVideoModel = parseStoryCamVideoModel(job.provider_name);
  const videoProvider = jobVideoModel ? videoProviders?.[jobVideoModel] : undefined;
  const videoResolved = job.type === "video_clip" ? await resolveVideoGenerationJob(client, userId, { job, provider: videoProvider }) : undefined;

  const refreshedJob = await new StoryCamGenerationJobRepository(client).findById(userId, jobId);

  const summarySource = refreshedJob ?? videoResolved ?? job;
  const outputPreview = await createVideoClipOutputPreview(client, userId, summarySource);

  return {
    ok: true,
    value: {
      ...(image ? { image } : {}),
      job: {
        ...toJobSummary(summarySource),
        ...(outputPreview ? { outputPreview } : {})
      }
    }
  };
}

async function createVideoClipOutputPreview(client: SupabaseClient<Database>, userId: string, job: GenerationJobRow) {
  if (job.type !== "video_clip" || job.status !== "succeeded" || !job.output_artifact_id) {
    return undefined;
  }

  const artifacts =
    (await new StoryCamArtifactRepository(client).listBySession(userId, { sessionId: job.session_id, type: "generated_clip" })) ?? [];
  const artifact = artifacts.find((row) => row.id === job.output_artifact_id && row.state === "ready");

  if (!artifact) {
    return undefined;
  }

  const generatedClip = generatedClipSchema.parse(artifact.data_json);
  const mediaRows = (await new StoryCamMediaAssetRepository(client).listBySession(userId, job.session_id)) ?? [];
  const media = mediaRows.find((row) => row.id === generatedClip.mediaAssetId);

  if (!media) {
    return undefined;
  }

  assertStoryCamPrivateBucket(media.storage_bucket);

  return {
    durationSeconds: generatedClip.durationSeconds,
    mimeType: media.mime_type,
    signedUrl: await createStoryCamSignedUrl(client, media.storage_bucket, media.storage_path, storyCamSignedUrlTtlSeconds),
    signedUrlExpiresIn: storyCamSignedUrlTtlSeconds
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
        providerErrorCategory: providerResult.providerErrorCategory,
        providerHttpStatus: providerResult.providerHttpStatus,
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
  packet: ClipPromptPacket,
  options: {
    providerReferenceSignedUrlTtlSeconds?: number;
  } = {}
): Promise<GenerationJobServiceVideoInput> {
  const mediaRows = (await new StoryCamMediaAssetRepository(client).listBySession(userId, packet.sessionId)) ?? [];
  const providerReferenceSignedUrlTtlSeconds =
    options.providerReferenceSignedUrlTtlSeconds ?? storyCamProviderReferenceSignedUrlTtlSeconds;
  const referenceImageUrls = await Promise.all(
    packet.referenceImageMedia.map(async (reference) => {
      const media = mediaRows.find((row) => row.id === reference.mediaId);

      return media
        ? createStoryCamProviderReferenceSignedUrl(
            client,
            media.storage_bucket as StoryCamPrivateBucket,
            media.storage_path,
            providerReferenceSignedUrlTtlSeconds
          )
        : null;
    })
  );

  return {
    durationSeconds: Math.min(15, packet.plannedDurationSeconds ?? 15),
    generateAudio: true,
    prompt: packet.providerPrompt ?? packet.redactedPromptSummary,
    ratio: packet.aspectRatio,
    referenceImageUrls: referenceImageUrls.filter((url): url is string => Boolean(url)),
    resolution: packet.resolution ?? storyCamSeedanceOutputResolution,
    watermark: false
  };
}

function findNonPublicReferenceUrls(urls: string[]) {
  return urls.filter((url) => {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      return (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.endsWith(".localhost")
      );
    } catch {
      return true;
    }
  });
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
    sessionId,
    videoModel: parseOptionalVideoModel(body.videoModel)
  };
}

function parseOptionalVideoModel(value: unknown): StoryCamVideoModel {
  if (value === undefined) {
    return defaultStoryCamVideoModel;
  }

  const videoModel = parseStoryCamVideoModel(value);

  if (!videoModel) {
    throw new GenerationJobRequestError("invalid_input");
  }

  return videoModel;
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
    ...(job.provider_error_category ? { providerErrorCategory: job.provider_error_category } : {}),
    ...(job.provider_http_status !== null ? { providerHttpStatus: job.provider_http_status } : {}),
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
