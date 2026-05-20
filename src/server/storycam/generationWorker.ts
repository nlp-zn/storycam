import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FinalWorkComposer } from "@/lib/providers/types";
import type {
  FfmpegComposerInput,
  FfmpegComposerOutput
} from "@/lib/providers/finalWork/ffmpegComposer";
import type { Database, GenerationJobRow } from "@/server/db/types";
import { loadStoryCamConfig, type StoryCamConfig } from "@/server/config";
import { captureStoryCamWorkerException } from "@/server/monitoring/sentryWorker";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";
import {
  type GenerationJobServiceImageProvider,
  resolveVideoGenerationJob,
  type GenerationJobServiceVideoProvider
} from "./generationJobService";
import { resolveImageGenerationJob } from "./imageGenerationJobService";
import { completeFinalWorkJob } from "./finalWorkService";
import { createConfiguredStoryboardImageProvider } from "./storyboardImageProviderFactory";
import { createConfiguredStoryboardProvider } from "./storyboardProviderFactory";
import { completeStoryboardJob } from "./storyboardService";
import { createConfiguredStoryWorldAssetImageProvider } from "./storyWorldAssetImageProviderFactory";
import { createConfiguredStoryWorldProvider } from "./storyWorldProviderFactory";
import { completeStoryWorldJob } from "./storyWorldService";
import { createConfiguredVideoProviders } from "./videoProviderFactory";
import type { StoryCamVideoModel } from "@/features/storycam/domain/videoSettings";

export const storyCamWorkerJobTypes: GenerationJobRow["type"][] = [
  "story_world",
  "story_world_asset_image",
  "storyboard",
  "storyboard_image",
  "expanded_storyboard_image",
  "video_clip",
  "final_work"
];

export type StoryCamWorkerOptions = {
  batchSize?: number;
  client?: SupabaseClient<Database>;
  config?: StoryCamConfig;
  finalWorkComposer?: FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput>;
  lockTtlSeconds?: number;
  logger?: Pick<typeof console, "error" | "info" | "warn">;
  pollIntervalMs?: number;
  runAfterDelayMs?: number;
  signal?: AbortSignal;
  workerId?: string;
};

type StoryCamWorkerRuntime = {
  client: SupabaseClient<Database>;
  config: StoryCamConfig;
  finalWorkComposer?: FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput>;
  imageProviders: {
    storyboard?: GenerationJobServiceImageProvider;
    storyWorld?: GenerationJobServiceImageProvider;
  };
  logger: Pick<typeof console, "error" | "info" | "warn">;
  runAfterDelayMs: number;
  storyboardProvider?: ReturnType<typeof createConfiguredStoryboardProvider>;
  storyWorldProvider?: ReturnType<typeof createConfiguredStoryWorldProvider>;
  videoProviders: Partial<Record<StoryCamVideoModel, GenerationJobServiceVideoProvider>>;
  workerId: string;
};

export async function runStoryCamWorker(options: StoryCamWorkerOptions = {}): Promise<void> {
  const runtime = createStoryCamWorkerRuntime(options);
  const pollIntervalMs = options.pollIntervalMs ?? numberEnv("STORYCAM_WORKER_POLL_INTERVAL_MS", 5_000);

  runtime.logger.info("StoryCam worker started.", { workerId: runtime.workerId });

  while (!options.signal?.aborted) {
    const processedCount = await processStoryCamWorkerOnce({ ...options, ...runtime });

    if (processedCount === 0) {
      await sleep(pollIntervalMs, options.signal);
    }
  }
}

export async function processStoryCamWorkerOnce(options: StoryCamWorkerOptions = {}): Promise<number> {
  const runtime = isStoryCamWorkerRuntime(options) ? options : createStoryCamWorkerRuntime(options);
  const jobs = await new StoryCamGenerationJobRepository(runtime.client).claimRunnable({
    jobTypes: storyCamWorkerJobTypes,
    limit: options.batchSize ?? numberEnv("STORYCAM_WORKER_BATCH_SIZE", 5),
    lockTtlSeconds: options.lockTtlSeconds ?? numberEnv("STORYCAM_WORKER_LOCK_TTL_SECONDS", 300),
    workerId: runtime.workerId
  });

  for (const job of jobs) {
    await processStoryCamWorkerJob(runtime, job);
  }

  return jobs.length;
}

function isStoryCamWorkerRuntime(options: StoryCamWorkerOptions): options is StoryCamWorkerRuntime & StoryCamWorkerOptions {
  return (
    "imageProviders" in options &&
    "logger" in options &&
    "runAfterDelayMs" in options &&
    "videoProviders" in options &&
    typeof options.workerId === "string"
  );
}

export async function processStoryCamWorkerJob(runtime: StoryCamWorkerRuntime, job: GenerationJobRow): Promise<void> {
  const jobs = new StoryCamGenerationJobRepository(runtime.client);

  try {
    runtime.logger.info("StoryCam worker processing job.", safeJobLog(job));

    if (job.locked_by && job.locked_by !== runtime.workerId) {
      runtime.logger.warn("StoryCam worker skipped job locked by another worker.", safeJobLog(job));
      return;
    }

    if (!isActiveJobStatus(job.status)) {
      return;
    }

    if (job.status === "cancel_requested" || job.tombstoned_at) {
      await jobs.markCanceled(job.user_id, job.id);
      return;
    }

    if (job.type === "story_world") {
      await completeStoryWorldJob(runtime.client, job, runtime.storyWorldProvider);
      return;
    }

    if (job.type === "storyboard") {
      await completeStoryboardJob(runtime.client, job, runtime.storyboardProvider, runtime.imageProviders.storyboard, {
        providerReferenceSignedUrlTtlSeconds: runtime.config.media.providerReferenceSignedUrlTtlSeconds
      });
      return;
    }

    if (isImageJobType(job.type)) {
      const imageProvider = job.type === "story_world_asset_image" ? runtime.imageProviders.storyWorld : runtime.imageProviders.storyboard;

      await resolveImageGenerationJob(runtime.client, job.user_id, {
        job,
        provider: imageProvider ?? runtime.imageProviders.storyWorld ?? runtime.imageProviders.storyboard
      });
      await releaseIfStillActive(runtime, job);
      return;
    }

    if (job.type === "video_clip") {
      const provider = runtime.videoProviders[job.provider_name as StoryCamVideoModel];

      await resolveVideoGenerationJob(runtime.client, job.user_id, {
        job,
        provider,
        providerReferenceSignedUrlTtlSeconds: runtime.config.media.providerReferenceSignedUrlTtlSeconds
      });
      await releaseIfStillActive(runtime, job);
      return;
    }

    if (job.type === "final_work") {
      await completeFinalWorkJob(runtime.client, job, runtime.finalWorkComposer);
      return;
    }
  } catch (error) {
    captureStoryCamWorkerException(error, job);
    runtime.logger.error("StoryCam worker job failed.", safeJobLog(job));

    try {
      await jobs.markFailed(job.user_id, job.id, {
        errorCode: "WORKER_JOB_FAILED",
        redactedError: "StoryCam generation worker failed."
      });
    } catch (markFailedError) {
      captureStoryCamWorkerException(markFailedError, job);
      runtime.logger.error("StoryCam worker could not mark failed job.", safeJobLog(job));
    }
  }
}

function createStoryCamWorkerRuntime(options: StoryCamWorkerOptions): StoryCamWorkerRuntime {
  const config = options.config ?? loadStoryCamConfig();
  const client = options.client ?? createWorkerSupabaseClient(config);

  return {
    client,
    config,
    finalWorkComposer: options.finalWorkComposer,
    imageProviders: {
      storyboard: createConfiguredStoryboardImageProvider(config),
      storyWorld: createConfiguredStoryWorldAssetImageProvider(config)
    },
    logger: options.logger ?? console,
    runAfterDelayMs: options.runAfterDelayMs ?? numberEnv("STORYCAM_WORKER_RUN_AFTER_DELAY_MS", 10_000),
    storyboardProvider: createConfiguredStoryboardProvider(config),
    storyWorldProvider: createConfiguredStoryWorldProvider(config),
    videoProviders: createConfiguredVideoProviders(config),
    workerId: options.workerId ?? process.env.RENDER_INSTANCE_ID ?? `storycam-worker-${process.pid}`
  };
}

function createWorkerSupabaseClient(config: StoryCamConfig) {
  return createClient<Database>(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function releaseIfStillActive(runtime: StoryCamWorkerRuntime, claimedJob: GenerationJobRow) {
  const jobs = new StoryCamGenerationJobRepository(runtime.client);
  const current = await jobs.findById(claimedJob.user_id, claimedJob.id);

  if (!current || current.tombstoned_at || !isActiveJobStatus(current.status)) {
    return;
  }

  await jobs.releaseForRetry(claimedJob.user_id, claimedJob.id, {
    runAfter: new Date(Date.now() + runtime.runAfterDelayMs)
  });
}

function isImageJobType(type: GenerationJobRow["type"]) {
  return type === "story_world_asset_image" || type === "storyboard_image" || type === "expanded_storyboard_image";
}

function isActiveJobStatus(status: GenerationJobRow["status"]) {
  return status === "queued" || status === "running" || status === "cancel_requested";
}

function safeJobLog(job: GenerationJobRow) {
  return {
    attempts: job.attempts,
    jobId: job.id,
    providerKind: job.provider_kind,
    providerName: job.provider_name,
    status: job.status,
    type: job.type
  };
}

function numberEnv(key: string, fallback: number) {
  const raw = process.env[key];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}
