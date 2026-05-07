import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type { ImageGenerationProvider, ProviderResult } from "@/lib/providers/types";

export type InferenceShImagePrompt = {
  height?: number;
  images?: string[];
  prompt: string;
  quality?: "auto" | "high" | "low" | "medium";
  width?: number;
};

export type InferenceShImageProviderOutput = {
  bytes: Uint8Array;
  mimeType: InferenceShGeneratedImageMimeType;
  model: string;
};

export type InferenceShImageTaskSubmission = {
  providerRequestId: string;
};

export type InferenceShImageTaskResolution =
  | {
      status: "running";
    }
  | {
      image: InferenceShImageProviderOutput;
      status: "succeeded";
    };

export type InferenceShImageProviderOptions<Input> = {
  apiKey: string;
  app: string;
  buildPrompt: (input: Input) => InferenceShImagePrompt;
  fetchImage?: FetchImage;
  getTask?: InferenceShGetTask;
  maxAttempts?: number;
  runTask?: InferenceShRunTask;
  supportsReferenceImages?: boolean;
};

export type InferenceShRunTask = (
  input: {
    app: string;
    input: {
      height: number;
      images?: string[];
      n: number;
      output_format: "png";
      prompt: string;
      quality: "auto" | "high" | "low" | "medium";
      width: number;
    };
  },
  options: { stream: false; wait: boolean }
) => Promise<InferenceShTaskResult>;

type InferenceShTaskResult = {
  error?: unknown;
  id?: unknown;
  output?: unknown;
  status?: number | string;
  task_id?: unknown;
};

type FetchImage = (uri: string) => Promise<{ bytes: Uint8Array; mimeType: string }>;
type InferenceShGetTask = (taskId: string) => Promise<InferenceShTaskResult>;

const inferenceShGeneratedImageMimeTypes = ["image/png", "image/jpeg", "image/webp"] as const;
type InferenceShGeneratedImageMimeType = (typeof inferenceShGeneratedImageMimeTypes)[number];
const inferenceShTaskStatusCompleted = 10;
const inferenceShTaskStatusErrored = 11;
const inferenceShTaskStatusFailed = 20;

export type InferenceShAsyncImageProvider<Input> = ImageGenerationProvider<Input, InferenceShImageProviderOutput> & {
  resolveImageTask(taskId: string): Promise<ProviderResult<InferenceShImageTaskResolution>>;
  submitImageTask(input: Input): Promise<ProviderResult<InferenceShImageTaskSubmission>>;
};

export function createInferenceShImageProvider<Input>(
  options: InferenceShImageProviderOptions<Input>
): InferenceShAsyncImageProvider<Input> {
  const identity = {
    providerKind: "image" as const,
    providerName: "inference_sh" as const
  };
  const sdk = createSdkClient(options.apiKey);
  const runTask = options.runTask ?? sdk.runTask;
  const getTask = options.getTask ?? sdk.getTask;
  const fetchImage = options.fetchImage ?? fetchImageFromUri;

  return {
    ...identity,
    ...(options.supportsReferenceImages ? { supportsReferenceImages: true } : {}),
    async generateImage(input): Promise<ProviderResult<InferenceShImageProviderOutput>> {
      const prompt = options.buildPrompt(input);

      return generateValidatedImage({
        app: options.app,
        fetchImage,
        identity,
        maxAttempts: options.maxAttempts ?? 2,
        modelName: options.app,
        prompt,
        runTask
      });
    },
    async resolveImageTask(taskId): Promise<ProviderResult<InferenceShImageTaskResolution>> {
      return resolveValidatedImageTask({
        fetchImage,
        getTask,
        identity,
        modelName: options.app,
        taskId
      });
    },
    async submitImageTask(input): Promise<ProviderResult<InferenceShImageTaskSubmission>> {
      const prompt = options.buildPrompt(input);

      return submitValidatedImageTask({
        app: options.app,
        fetchImage,
        identity,
        prompt,
        runTask
      });
    }
  };
}

async function generateValidatedImage(input: {
  app: string;
  fetchImage: FetchImage;
  identity: { providerKind: "image"; providerName: "inference_sh" };
  maxAttempts: number;
  modelName: string;
  prompt: InferenceShImagePrompt;
  runTask: InferenceShRunTask;
}) {
  let lastError: unknown = new Error("Inference.sh returned no image.");

  for (let attempt = 0; attempt < input.maxAttempts; attempt += 1) {
    try {
      const task = await input.runTask(
        {
          app: input.app,
          input: {
            height: normalizeDimension(input.prompt.height ?? 864),
            ...(await referenceImagesInput(input.fetchImage, input.prompt)),
            n: 1,
            output_format: "png",
            prompt: input.prompt.prompt,
            quality: input.prompt.quality ?? "high",
            width: normalizeDimension(input.prompt.width ?? 1536)
          }
        },
        { stream: false, wait: true }
      );

      if (isFailedTask(task)) {
        lastError = task.error ?? new Error("Inference.sh image task failed.");
        break;
      }

      if (!isCompletedTaskStatus(task.status)) {
        lastError = new Error("Inference.sh image task did not complete.");
        continue;
      }

      const imageUri = parseFirstImageUri(task.output);
      const image = await input.fetchImage(imageUri);

      if (
        image.bytes.byteLength > 0 &&
        inferenceShGeneratedImageMimeTypes.includes(image.mimeType as InferenceShGeneratedImageMimeType)
      ) {
        return providerSuccess(input.identity, {
          bytes: image.bytes,
          mimeType: image.mimeType as InferenceShGeneratedImageMimeType,
          model: input.modelName
        });
      }

      lastError = new Error("Inference.sh returned an unsupported image.");
    } catch (error) {
      lastError = error;

      if (isNonRetryableInferenceShImageError(error)) {
        break;
      }
    }
  }

  const classifiedFailure = classifyInferenceShImageError(lastError);

  return providerFailure(input.identity, lastError, {
    errorCode: classifiedFailure.errorCode,
    retryable: classifiedFailure.retryable
  });
}

async function submitValidatedImageTask(input: {
  app: string;
  fetchImage: FetchImage;
  identity: { providerKind: "image"; providerName: "inference_sh" };
  prompt: InferenceShImagePrompt;
  runTask: InferenceShRunTask;
}): Promise<ProviderResult<InferenceShImageTaskSubmission>> {
  try {
    const task = await input.runTask(
      {
        app: input.app,
        input: {
          height: normalizeDimension(input.prompt.height ?? 864),
          ...(await referenceImagesInput(input.fetchImage, input.prompt)),
          n: 1,
          output_format: "png",
          prompt: input.prompt.prompt,
          quality: input.prompt.quality ?? "high",
          width: normalizeDimension(input.prompt.width ?? 1536)
        }
      },
      { stream: false, wait: false }
    );
    const providerRequestId = parseTaskId(task);

    return providerSuccess(input.identity, { providerRequestId });
  } catch (error) {
    const classifiedFailure = classifyInferenceShImageError(error);

    return providerFailure(input.identity, error, {
      errorCode: classifiedFailure.errorCode,
      retryable: classifiedFailure.retryable
    });
  }
}

async function resolveValidatedImageTask(input: {
  fetchImage: FetchImage;
  getTask: InferenceShGetTask;
  identity: { providerKind: "image"; providerName: "inference_sh" };
  modelName: string;
  taskId: string;
}): Promise<ProviderResult<InferenceShImageTaskResolution>> {
  try {
    const task = await input.getTask(input.taskId);

    if (isFailedTask(task)) {
      throw task.error ?? new Error("Inference.sh image task failed.");
    }

    if (!isCompletedTaskStatus(task.status)) {
      return providerSuccess(input.identity, { status: "running" });
    }

    const imageUri = parseFirstImageUri(task.output);
    const image = await input.fetchImage(imageUri);

    if (
      image.bytes.byteLength > 0 &&
      inferenceShGeneratedImageMimeTypes.includes(image.mimeType as InferenceShGeneratedImageMimeType)
    ) {
      return providerSuccess(input.identity, {
        image: {
          bytes: image.bytes,
          mimeType: image.mimeType as InferenceShGeneratedImageMimeType,
          model: input.modelName
        },
        status: "succeeded"
      });
    }

    throw new Error("Inference.sh returned an unsupported image.");
  } catch (error) {
    const classifiedFailure = classifyInferenceShImageError(error);

    return providerFailure(input.identity, error, {
      errorCode: classifiedFailure.errorCode,
      retryable: classifiedFailure.retryable
    });
  }
}

function createSdkClient(apiKey: string): { getTask: InferenceShGetTask; runTask: InferenceShRunTask } {
  let clientPromise: Promise<{ getTask?: InferenceShGetTask; run: InferenceShRunTask }> | undefined;

  const loadClient = () => {
    clientPromise ??= import("@inferencesh/sdk").then(({ inference }) => inference({ apiKey, stream: false }));

    return clientPromise;
  };

  return {
    async getTask(taskId) {
      const client = await loadClient();

      if (typeof client.getTask !== "function") {
        throw new Error("Inference.sh SDK client does not expose getTask.");
      }

      return client.getTask(taskId);
    },
    async runTask(input, options) {
      const client = await loadClient();

      return client.run(input, options);
    }
  };
}

async function referenceImagesInput(fetchImage: FetchImage, prompt: InferenceShImagePrompt) {
  const images = await Promise.all((prompt.images ?? []).map((image) => toProviderReferenceImage(fetchImage, image)));
  const readyImages = images.filter(Boolean);

  return readyImages.length ? { images: readyImages } : {};
}

async function toProviderReferenceImage(fetchImage: FetchImage, image: string) {
  const trimmed = image.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("data:") || isProviderReachableUrl(trimmed)) {
    return trimmed;
  }

  const fetched = await fetchImage(trimmed);

  return `data:${fetched.mimeType};base64,${Buffer.from(fetched.bytes).toString("base64")}`;
}

function isProviderReachableUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      hostname !== "localhost" &&
      hostname !== "0.0.0.0" &&
      hostname !== "127.0.0.1" &&
      hostname !== "::1" &&
      hostname !== "[::1]" &&
      !hostname.endsWith(".local") &&
      !isPrivateIpv4(hostname)
    );
  } catch {
    return false;
  }
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function parseTaskId(task: InferenceShTaskResult) {
  const id = typeof task.id === "string" && task.id.trim()
    ? task.id.trim()
    : typeof task.task_id === "string" && task.task_id.trim()
      ? task.task_id.trim()
      : "";

  if (!id) {
    throw new Error("Inference.sh async task id is missing.");
  }

  return id;
}

function isCompletedTaskStatus(status: InferenceShTaskResult["status"]) {
  return status === inferenceShTaskStatusCompleted || status === "completed" || status === "succeeded";
}

function isFailedTask(task: InferenceShTaskResult) {
  return Boolean(task.error) || isFailedTaskStatus(task.status);
}

function isFailedTaskStatus(status: InferenceShTaskResult["status"]) {
  return (
    status === inferenceShTaskStatusErrored ||
    status === inferenceShTaskStatusFailed ||
    status === "failed" ||
    status === "canceled" ||
    status === "cancelled"
  );
}

function parseFirstImageUri(output: unknown) {
  if (!output || typeof output !== "object" || !("images" in output)) {
    throw new Error("Inference.sh output is missing images.");
  }

  const images = (output as { images?: unknown }).images;

  if (!Array.isArray(images) || typeof images[0] !== "string" || !images[0].trim()) {
    throw new Error("Inference.sh output images are invalid.");
  }

  return images[0].trim();
}

async function fetchImageFromUri(uri: string) {
  if (uri.startsWith("data:")) {
    return parseDataImageUri(uri);
  }

  if (!uri.startsWith("http://") && !uri.startsWith("https://")) {
    throw new Error("Inference.sh returned a non-downloadable image URI.");
  }

  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error("Inference.sh image download failed.");
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream"
  };
}

function parseDataImageUri(uri: string) {
  const match = uri.match(/^data:([^;,]+);base64,(.*)$/s);

  if (!match) {
    throw new Error("Inference.sh returned an invalid data image URI.");
  }

  return {
    bytes: Uint8Array.from(Buffer.from(match[2], "base64")),
    mimeType: match[1]
  };
}

function normalizeDimension(value: number) {
  return Math.min(3840, Math.max(256, Math.round(value / 16) * 16));
}

function classifyInferenceShImageError(error: unknown) {
  const message = providerErrorMessage(error).toLowerCase();
  const statusCode = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : typeof (error as { statusCode?: unknown })?.statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : undefined;

  if (statusCode === 401 || statusCode === 403 || message.includes("unauthorized") || message.includes("forbidden")) {
    return {
      errorCode: "INFERENCE_SH_IMAGE_AUTH_FAILED",
      retryable: false
    };
  }

  if (
    statusCode === 412 ||
    message.includes("requirements not met") ||
    errorName(error) === "RequirementsNotMetException"
  ) {
    return {
      errorCode: "INFERENCE_SH_IMAGE_REQUIREMENTS_NOT_MET",
      retryable: false
    };
  }

  if (errorName(error) === "InferenceError") {
    return {
      errorCode: "INFERENCE_SH_IMAGE_PROVIDER_FAILED",
      retryable: true
    };
  }

  return {
    errorCode: "INFERENCE_SH_IMAGE_INVALID_OUTPUT",
    retryable: true
  };
}

function isNonRetryableInferenceShImageError(error: unknown) {
  return !classifyInferenceShImageError(error).retryable;
}

function providerErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : typeof (error as { name?: unknown })?.name === "string" ? (error as { name: string }).name : "";
}
