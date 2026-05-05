import type { SupabaseClient } from "@supabase/supabase-js";
import { hashLogIdentifier } from "@/lib/privacy/redact";
import type { ImageGenerationProvider, ProviderResult } from "@/lib/providers/types";
import type { Database, GenerationJobRow, Json, MediaAssetRow } from "@/server/db/types";
import { writeGeneratedStoryCamMedia, type GeneratedStoryCamImageMimeType } from "./generatedMediaService";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { createStoryCamSignedUrl, storyCamGeneratedBucket, storyCamSignedUrlTtlSeconds } from "./mediaStore";
import { StoryCamRepositoryError } from "./repositoryErrors";

export type ImageJobType = Extract<
  GenerationJobRow["type"],
  "expanded_storyboard_image" | "story_world_asset_image" | "storyboard_image"
>;

export type AsyncImageProviderOutput = {
  bytes: Uint8Array;
  mimeType: GeneratedStoryCamImageMimeType;
  model?: string;
};

export type ImageJobState =
  | {
      mediaId: string;
      mimeType: string;
      placeholder: false;
      signedUrl: string;
      signedUrlExpiresIn: number;
      status: "ready";
    }
  | {
      jobId: string;
      placeholder: true;
      status: "generating";
    }
  | {
      placeholder: true;
      redactedError?: string;
      status: "placeholder";
    };

export type SubmitImageJobResult =
  | {
      image: Extract<ImageJobState, { status: "ready" }>;
      job: null;
      status: "ready";
    }
  | {
      image: Extract<ImageJobState, { status: "generating" }>;
      job: GenerationJobRow;
      status: "generating";
    }
  | {
      image: Extract<ImageJobState, { status: "placeholder" }>;
      job: GenerationJobRow | null;
      status: "placeholder";
    };

type AsyncImageProvider<Input> = ImageGenerationProvider<Input, AsyncImageProviderOutput> & {
  resolveImageTask(taskId: string): Promise<
    ProviderResult<
      | {
          status: "running";
        }
      | {
          image: AsyncImageProviderOutput;
          status: "succeeded";
        }
    >
  >;
  submitImageTask(input: Input): Promise<ProviderResult<{ providerRequestId: string }>>;
};

export function isAsyncImageProvider<Input>(
  provider: ImageGenerationProvider<Input, AsyncImageProviderOutput> | undefined
): provider is AsyncImageProvider<Input> {
  return Boolean(
    provider &&
      typeof (provider as { submitImageTask?: unknown }).submitImageTask === "function" &&
      typeof (provider as { resolveImageTask?: unknown }).resolveImageTask === "function"
  );
}

export async function submitImageGenerationJob<Input>(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    forceNew?: boolean;
    imageInput: Input;
    idempotencyKeySuffix?: string;
    inputArtifactVersionsJson?: Json;
    linkedArtifactId: string;
    provider?: ImageGenerationProvider<Input, AsyncImageProviderOutput>;
    sessionId: string;
    type: ImageJobType;
  }
): Promise<SubmitImageJobResult> {
  try {
    return await submitImageGenerationJobWithRepositories(client, userId, input);
  } catch (error) {
    if (error instanceof StoryCamRepositoryError) {
      return {
        image: placeholderImage("Image job metadata is unavailable."),
        job: null,
        status: "placeholder"
      };
    }

    throw error;
  }
}

async function submitImageGenerationJobWithRepositories<Input>(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    forceNew?: boolean;
    imageInput: Input;
    idempotencyKeySuffix?: string;
    inputArtifactVersionsJson?: Json;
    linkedArtifactId: string;
    provider?: ImageGenerationProvider<Input, AsyncImageProviderOutput>;
    sessionId: string;
    type: ImageJobType;
  }
): Promise<SubmitImageJobResult> {
  const existingMedia = input.forceNew
    ? null
    : await findReadyImageByArtifact(client, userId, {
        linkedArtifactId: input.linkedArtifactId,
        sessionId: input.sessionId
      });

  if (existingMedia) {
    return {
      image: existingMedia,
      job: null,
      status: "ready"
    };
  }

  if (!isAsyncImageProvider(input.provider)) {
    return {
      image: placeholderImage(),
      job: null,
      status: "placeholder"
    };
  }

  const idempotencyKeyHash = hashLogIdentifier(
    [
      "storycam-image",
      input.type,
      input.sessionId,
      input.linkedArtifactId,
      stableJson(input.inputArtifactVersionsJson ?? {}),
      input.idempotencyKeySuffix ?? "default"
    ].join(":")
  );
  const jobs = new StoryCamGenerationJobRepository(client);
  const existingJob = input.forceNew ? null : await jobs.findActiveByIdempotencyKey(userId, idempotencyKeyHash);

  if (existingJob) {
    if (existingJob.status === "succeeded") {
      const media = await findReadyImageByArtifact(client, userId, {
        linkedArtifactId: input.linkedArtifactId,
        sessionId: input.sessionId
      });

      if (media) {
        return { image: media, job: null, status: "ready" };
      }
    }

    if (existingJob.status === "queued" || existingJob.status === "running") {
      return {
        image: generatingImage(existingJob.id),
        job: existingJob,
        status: "generating"
      };
    }
  }

  const submitted = await input.provider.submitImageTask(input.imageInput);

  if (!submitted.ok) {
    return {
      image: placeholderImage(submitted.redactedError),
      job: null,
      status: "placeholder"
    };
  }

  const job = await jobs.create(userId, {
    generationMode: "real",
    idempotencyKeyHash,
    inputArtifactVersionsJson: input.inputArtifactVersionsJson ?? {},
    outputArtifactId: input.linkedArtifactId,
    providerKind: input.provider.providerKind,
    providerName: input.provider.providerName,
    providerRequestId: submitted.value.providerRequestId,
    sessionId: input.sessionId,
    status: "running",
    type: input.type
  });

  if (!job) {
    return {
      image: placeholderImage("Image job creation failed."),
      job: null,
      status: "placeholder"
    };
  }

  return {
    image: generatingImage(job.id),
    job,
    status: "generating"
  };
}

export async function resolveImageGenerationJob<Input>(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    job: GenerationJobRow;
    provider?: ImageGenerationProvider<Input, AsyncImageProviderOutput>;
  }
): Promise<ImageJobState> {
  const existingMedia = input.job.output_artifact_id
    ? await findReadyImageByArtifact(client, userId, {
        linkedArtifactId: input.job.output_artifact_id,
        sessionId: input.job.session_id
      })
    : null;

  if (existingMedia) {
    return existingMedia;
  }

  if (input.job.status === "failed" || input.job.status === "canceled" || input.job.status === "expired") {
    return placeholderImage(input.job.redacted_error ?? undefined);
  }

  if (!input.job.provider_request_id || !input.job.output_artifact_id || !isAsyncImageProvider(input.provider)) {
    return placeholderImage("Image provider is not available.");
  }

  const providerResult = await input.provider.resolveImageTask(input.job.provider_request_id);
  const jobs = new StoryCamGenerationJobRepository(client);

  if (!providerResult.ok) {
    await jobs.markFailed(userId, input.job.id, {
      errorCode: providerResult.errorCode,
      redactedError: providerResult.redactedError
    });

    return placeholderImage(providerResult.redactedError);
  }

  if (providerResult.value.status === "running") {
    if (input.job.status === "queued") {
      await jobs.markRunning(userId, input.job.id);
    }

    return generatingImage(input.job.id);
  }

  const media = await writeGeneratedStoryCamMedia(client, {
    bytes: providerResult.value.image.bytes,
    kind: "thumbnail",
    linkedArtifactId: input.job.output_artifact_id,
    mimeType: providerResult.value.image.mimeType,
    sessionId: input.job.session_id,
    source: "provider",
    userId
  });

  await jobs.markSucceeded(userId, input.job.id, {
    outputArtifactId: input.job.output_artifact_id
  });

  return toReadyImage(client, {
    id: media.id,
    mimeType: media.mimeType,
    path: media.path
  });
}

export async function findReadyImageByArtifact(
  client: SupabaseClient<Database>,
  userId: string,
  input: { linkedArtifactId: string; sessionId: string }
) {
  const media = await new StoryCamMediaAssetRepository(client).findLatestThumbnailByLinkedArtifact(userId, input);

  return media ? toReadyImageFromMedia(client, media) : null;
}

export function generatingImage(jobId: string): Extract<ImageJobState, { status: "generating" }> {
  return {
    jobId,
    placeholder: true,
    status: "generating"
  };
}

export function placeholderImage(redactedError?: string): Extract<ImageJobState, { status: "placeholder" }> {
  return {
    placeholder: true,
    ...(redactedError ? { redactedError } : {}),
    status: "placeholder"
  };
}

async function toReadyImageFromMedia(client: SupabaseClient<Database>, media: MediaAssetRow) {
  return toReadyImage(client, {
    id: media.id,
    mimeType: media.mime_type,
    path: media.storage_path
  });
}

async function toReadyImage(
  client: SupabaseClient<Database>,
  input: { id: string; mimeType: string; path: string }
): Promise<Extract<ImageJobState, { status: "ready" }>> {
  const signedUrlExpiresIn = storyCamSignedUrlTtlSeconds;

  return {
    mediaId: input.id,
    mimeType: input.mimeType,
    placeholder: false,
    signedUrl: await createStoryCamSignedUrl(client, storyCamGeneratedBucket, input.path, signedUrlExpiresIn),
    signedUrlExpiresIn,
    status: "ready"
  };
}

function stableJson(value: Json) {
  return JSON.stringify(value, Object.keys(value && typeof value === "object" && !Array.isArray(value) ? value : {}).sort());
}
