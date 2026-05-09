import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type { ProviderResult, VideoGenerationProvider } from "@/lib/providers/types";
import type { StoryCamVideoOutputResolution } from "@/features/storycam/domain/videoSettings";

export type SeedanceVideoGenerationInput = {
  callbackUrl?: string;
  durationSeconds: number;
  generateAudio?: boolean;
  prompt: string;
  ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "adaptive";
  referenceImageUrls?: string[];
  resolution?: StoryCamVideoOutputResolution;
  seed?: number;
  watermark?: boolean;
};

export type SeedanceTaskStatus = "queued" | "running" | "succeeded" | "failed" | "canceled" | "expired";

export type SeedanceVideoGenerationOutput = {
  model: string;
  providerRequestId: string;
  seed?: number;
  status: Exclude<SeedanceTaskStatus, "failed" | "expired">;
  videoUrl?: string;
};

export type SeedanceVideoTaskSubmission = {
  providerRequestId: string;
};

export type SeedanceVideoProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  model: string;
  polling?: {
    enabled?: boolean;
    intervalMs?: number;
    maxAttempts?: number;
  };
};

type SeedanceCreateTaskResponse = {
  id?: unknown;
};

type SeedanceTaskResponse = {
  content?: {
    video_url?: unknown;
  };
  error?: unknown;
  id?: unknown;
  model?: unknown;
  seed?: unknown;
  status?: unknown;
};

const identity = {
  providerKind: "video",
  providerName: "seedance_2_0"
} as const;

const defaultBaseUrl = "https://ark.cn-beijing.volces.com/api/v3";

export function createSeedanceVideoProvider(
  options: SeedanceVideoProviderOptions
): VideoGenerationProvider<SeedanceVideoGenerationInput, SeedanceVideoGenerationOutput> & {
  resolveClipTask(providerRequestId: string): Promise<ProviderResult<SeedanceVideoGenerationOutput>>;
  submitClipTask(input: SeedanceVideoGenerationInput): Promise<ProviderResult<SeedanceVideoTaskSubmission>>;
} {
  const request = options.fetch ?? fetch;
  const baseUrl = trimTrailingSlash(options.baseUrl ?? defaultBaseUrl);

  return {
    ...identity,
    async generateClip(input): Promise<ProviderResult<SeedanceVideoGenerationOutput>> {
      try {
        const submitted = await submitSeedanceTask({
          apiKey: options.apiKey,
          baseUrl,
          input,
          model: options.model,
          request
        });

        if (!submitted.ok) {
          return submitted;
        }

        const providerRequestId = submitted.value.providerRequestId;

        if (!options.polling?.enabled) {
          return providerSuccess(
            {
              ...identity,
              providerRequestId
            },
            {
              model: options.model,
              providerRequestId,
              status: "queued"
            }
          );
        }

        return pollSeedanceTask({
          apiKey: options.apiKey,
          baseUrl,
          model: options.model,
          providerRequestId,
          request,
          intervalMs: options.polling.intervalMs ?? 10_000,
          maxAttempts: options.polling.maxAttempts ?? 60
        });
      } catch (error) {
        return providerFailure(identity, error, {
          errorCode: "SEEDANCE_PROVIDER_ERROR",
          retryable: true
        });
      }
    },
    async resolveClipTask(providerRequestId) {
      return resolveSeedanceTask({
        apiKey: options.apiKey,
        baseUrl,
        model: options.model,
        providerRequestId,
        request
      });
    },
    async submitClipTask(input) {
      return submitSeedanceTask({
        apiKey: options.apiKey,
        baseUrl,
        input,
        model: options.model,
        request
      });
    }
  };
}

export function normalizeSeedanceTaskResponse(response: SeedanceTaskResponse) {
  const id = typeof response.id === "string" ? response.id : "";
  const status = normalizeSeedanceStatus(response.status);
  const videoUrl = typeof response.content?.video_url === "string" ? response.content.video_url : undefined;
  const seed = typeof response.seed === "number" && Number.isFinite(response.seed) ? response.seed : undefined;
  const model = typeof response.model === "string" ? response.model : undefined;

  if (!id || !status) {
    throw new Error("Seedance task response is missing id or status.");
  }

  if (status === "succeeded" && !videoUrl) {
    throw new Error("Seedance succeeded task is missing content.video_url.");
  }

  return {
    id,
    ...(model ? { model } : {}),
    ...(seed !== undefined ? { seed } : {}),
    status,
    ...(videoUrl ? { videoUrl } : {})
  };
}

async function pollSeedanceTask(input: {
  apiKey: string;
  baseUrl: string;
  intervalMs: number;
  maxAttempts: number;
  model: string;
  providerRequestId: string;
  request: typeof fetch;
}): Promise<ProviderResult<SeedanceVideoGenerationOutput>> {
  const requestIdentity = {
    ...identity,
    providerRequestId: input.providerRequestId
  };

  for (let attempt = 0; attempt < input.maxAttempts; attempt += 1) {
    if (attempt > 0 && input.intervalMs > 0) {
      await sleep(input.intervalMs);
    }

    const resolved = await resolveSeedanceTask(input);

    if (!resolved.ok) {
      return resolved;
    }

    if (resolved.value.status === "succeeded" || resolved.value.status === "canceled") {
      return resolved;
    }
  }

  return providerFailure(requestIdentity, new Error("Seedance task polling timed out."), {
    errorCode: "SEEDANCE_TIMEOUT",
    retryable: true
  });
}

async function submitSeedanceTask(input: {
  apiKey: string;
  baseUrl: string;
  input: SeedanceVideoGenerationInput;
  model: string;
  request: typeof fetch;
}): Promise<ProviderResult<SeedanceVideoTaskSubmission>> {
  const createResponse = await input.request(`${input.baseUrl}/contents/generations/tasks`, {
    body: JSON.stringify(toCreateTaskBody(input.input, input.model)),
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!createResponse.ok) {
    return seedanceFailure(await safeJson(createResponse), createResponse.status);
  }

  return providerSuccess(identity, parseCreateTaskResponse(await safeJson(createResponse)));
}

async function resolveSeedanceTask(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  providerRequestId: string;
  request: typeof fetch;
}): Promise<ProviderResult<SeedanceVideoGenerationOutput>> {
  const requestIdentity = {
    ...identity,
    providerRequestId: input.providerRequestId
  };
  const response = await input.request(`${input.baseUrl}/contents/generations/tasks/${input.providerRequestId}`, {
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    method: "GET"
  });

  if (!response.ok) {
    return seedanceFailure(await safeJson(response), response.status, input.providerRequestId);
  }

  const responseBody = await safeJson(response);
  let normalized: ReturnType<typeof normalizeSeedanceTaskResponse>;

  try {
    normalized = normalizeSeedanceTaskResponse(responseBody);
  } catch (error) {
    return providerFailure(requestIdentity, error, {
      errorCode: "SEEDANCE_INVALID_RESPONSE",
      retryable: true
    });
  }

  if (normalized.status === "failed" || normalized.status === "expired") {
    return seedanceFailure(responseBody, 200, input.providerRequestId, normalized.status);
  }

  return providerSuccess(requestIdentity, {
    model: normalized.model ?? input.model,
    providerRequestId: input.providerRequestId,
    ...(normalized.seed !== undefined ? { seed: normalized.seed } : {}),
    status: normalized.status,
    ...(normalized.videoUrl ? { videoUrl: normalized.videoUrl } : {})
  });
}

function toCreateTaskBody(input: SeedanceVideoGenerationInput, model: string) {
  return {
    ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
    content: [
      {
        text: input.prompt,
        type: "text"
      },
      ...(input.referenceImageUrls ?? []).map((url) => ({
        image_url: { url },
        role: "reference_image",
        type: "image_url"
      }))
    ],
    duration: Math.max(1, Math.round(input.durationSeconds)),
    generate_audio: input.generateAudio ?? false,
    model,
    ratio: input.ratio ?? "16:9",
    resolution: input.resolution ?? "720p",
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    watermark: input.watermark ?? false
  };
}

function parseCreateTaskResponse(value: unknown) {
  const response = value as SeedanceCreateTaskResponse;

  if (!response || typeof response.id !== "string" || !response.id) {
    throw new Error("Seedance create task response is missing id.");
  }

  return {
    providerRequestId: response.id
  };
}

function seedanceFailure(error: unknown, httpStatus: number, providerRequestId?: string, taskStatus?: SeedanceTaskStatus) {
  const errorCode = seedanceErrorCode(error, httpStatus, taskStatus);
  const providerErrorCategory = seedanceErrorCategory(error, httpStatus, taskStatus);

  return providerFailure(
    {
      ...identity,
      ...(providerRequestId ? { providerRequestId } : {})
    },
    error,
    {
      errorCode,
      providerErrorCategory,
      providerHttpStatus: httpStatus,
      retryable: errorCode !== "SEEDANCE_POLICY_REFUSAL"
    }
  );
}

function seedanceErrorCode(error: unknown, httpStatus: number, taskStatus?: SeedanceTaskStatus) {
  if (taskStatus === "expired") {
    return "SEEDANCE_TIMEOUT";
  }

  if (httpStatus === 408 || httpStatus === 504) {
    return "SEEDANCE_TIMEOUT";
  }

  if (httpStatus === 402 || httpStatus === 429) {
    return "SEEDANCE_QUOTA_OR_RATE_LIMIT";
  }

  const serialized = JSON.stringify(error).toLowerCase();

  if (serialized.includes("policy") || serialized.includes("safety") || serialized.includes("审核") || serialized.includes("违规")) {
    return "SEEDANCE_POLICY_REFUSAL";
  }

  return "SEEDANCE_PROVIDER_ERROR";
}

function seedanceErrorCategory(error: unknown, httpStatus: number, taskStatus?: SeedanceTaskStatus) {
  if (taskStatus === "expired" || httpStatus === 408 || httpStatus === 504) {
    return "timeout";
  }

  if (httpStatus === 402 || httpStatus === 429) {
    return "quota_or_rate_limit";
  }

  const serialized = JSON.stringify(error).toLowerCase();

  if (serialized.includes("policy") || serialized.includes("safety") || serialized.includes("审核") || serialized.includes("违规")) {
    return "policy_refusal";
  }

  if (httpStatus >= 400 && httpStatus < 500) {
    return "request_rejected";
  }

  if (httpStatus >= 500) {
    return "provider_unavailable";
  }

  if (taskStatus === "failed") {
    return "task_failed";
  }

  return "provider_error";
}

function normalizeSeedanceStatus(status: unknown): SeedanceTaskStatus | null {
  if (status === "queued" || status === "running" || status === "succeeded" || status === "failed" || status === "canceled" || status === "expired") {
    return status;
  }

  return null;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/g, "");
}
