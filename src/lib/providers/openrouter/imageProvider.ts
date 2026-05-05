import type { ImageModel } from "ai";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type { ImageGenerationProvider, ProviderResult } from "@/lib/providers/types";
import {
  createOpenRouterImageModel,
  storyCamGenerateImage,
  type StoryCamGenerateImage
} from "@/server/ai/vercelAiClient";

export type OpenRouterImagePrompt = {
  aspectRatio?: `${number}:${number}`;
  prompt: string;
  seed?: number;
  size?: `${number}x${number}`;
};

export type OpenRouterImageProviderOutput = {
  bytes: Uint8Array;
  mimeType: OpenRouterGeneratedImageMimeType;
  model: string;
};

export type OpenRouterImageProviderOptions<Input> = {
  apiKey: string;
  buildPrompt: (input: Input) => OpenRouterImagePrompt;
  generateImage?: StoryCamGenerateImage;
  maxAttempts?: number;
  model: string;
};

const openRouterGeneratedImageMimeTypes = ["image/png", "image/jpeg", "image/webp"] as const;
type OpenRouterGeneratedImageMimeType = (typeof openRouterGeneratedImageMimeTypes)[number];

export function createOpenRouterImageProvider<Input>(
  options: OpenRouterImageProviderOptions<Input>
): ImageGenerationProvider<Input, OpenRouterImageProviderOutput> {
  const identity = {
    providerKind: "image" as const,
    providerName: "openrouter" as const
  };
  const model = createOpenRouterImageModel({
    apiKey: options.apiKey,
    model: options.model
  });
  const generate = options.generateImage ?? storyCamGenerateImage;

  return {
    ...identity,
    async generateImage(input): Promise<ProviderResult<OpenRouterImageProviderOutput>> {
      const prompt = options.buildPrompt(input);

      return generateValidatedImage({
        generate,
        identity,
        maxAttempts: options.maxAttempts ?? 2,
        model,
        modelName: options.model,
        prompt
      });
    }
  };
}

async function generateValidatedImage(input: {
  generate: StoryCamGenerateImage;
  identity: { providerKind: "image"; providerName: "openrouter" };
  maxAttempts: number;
  model: ImageModel;
  modelName: string;
  prompt: OpenRouterImagePrompt;
}) {
  let lastError: unknown = new Error("OpenRouter returned no image.");

  for (let attempt = 0; attempt < input.maxAttempts; attempt += 1) {
    try {
      const result = await input.generate({
        aspectRatio: input.prompt.aspectRatio,
        model: input.model,
        prompt: input.prompt.prompt,
        seed: input.prompt.seed,
        size: input.prompt.size
      });
      const image = result.image;

      if (
        image &&
        image.uint8Array.byteLength > 0 &&
        openRouterGeneratedImageMimeTypes.includes(image.mediaType as OpenRouterGeneratedImageMimeType)
      ) {
        return providerSuccess(input.identity, {
          bytes: image.uint8Array,
          mimeType: image.mediaType as OpenRouterGeneratedImageMimeType,
          model: input.modelName
        });
      }

      lastError = new Error("OpenRouter returned an unsupported image.");
    } catch (error) {
      lastError = error;

      if (isNonRetryableOpenRouterImageError(error)) {
        break;
      }
    }
  }

  const classifiedFailure = classifyOpenRouterImageError(lastError);

  return providerFailure(input.identity, lastError, {
    errorCode: classifiedFailure.errorCode,
    retryable: classifiedFailure.retryable
  });
}

function classifyOpenRouterImageError(error: unknown) {
  const message = providerErrorMessage(error).toLowerCase();
  const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === "number"
    ? (error as { statusCode: number }).statusCode
    : undefined;

  if (message.includes("not available in your region")) {
    return {
      errorCode: "OPENROUTER_IMAGE_REGION_UNAVAILABLE",
      retryable: false
    };
  }

  if (statusCode === 403 || message.includes("terms of service") || message.includes("prohibited")) {
    return {
      errorCode: "OPENROUTER_IMAGE_PROVIDER_BLOCKED",
      retryable: false
    };
  }

  return {
    errorCode: "OPENROUTER_IMAGE_INVALID_OUTPUT",
    retryable: true
  };
}

function isNonRetryableOpenRouterImageError(error: unknown) {
  return !classifyOpenRouterImageError(error).retryable;
}

function providerErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
