import type { SupabaseClient } from "@supabase/supabase-js";
import { hashLogIdentifier } from "@/lib/privacy/redact";
import type { Database, GenerationJobRow } from "@/server/db/types";
import { createClipPromptPacket, ClipPromptPacketRequestError } from "./clipPromptPacketService";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";
import {
  resolveImageGenerationJob,
  type AsyncImageProviderOutput,
  type ImageJobState
} from "./imageGenerationJobService";
import type { ImageGenerationProvider } from "@/lib/providers/types";

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
  constructor(readonly code: "invalid_input" | "job_not_found" | ClipPromptPacketRequestError["code"]) {
    super(`StoryCam generation job request error: ${code}`);
    this.name = "GenerationJobRequestError";
  }
}

export async function createGenerateClipJob(
  client: SupabaseClient<Database>,
  userId: string,
  coreStoryboardGroupId: string,
  body: GenerateClipRequestBody
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
    const job = requireGenerationJobRow(
      await jobs.create(userId, {
        generationMode: input.generationMode,
        idempotencyKeyHash,
        inputArtifactVersionsJson: { [packetArtifact.id]: packetArtifact.version },
        providerKind: "video",
        providerName: "mock",
        sessionId: input.sessionId,
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
  imageProvider?: GenerationJobServiceImageProvider
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

  const refreshedJob = await new StoryCamGenerationJobRepository(client).findById(userId, jobId);

  return {
    ok: true,
    value: {
      ...(image ? { image } : {}),
      job: toJobSummary(refreshedJob ?? job)
    }
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
