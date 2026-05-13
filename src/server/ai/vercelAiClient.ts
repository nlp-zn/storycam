import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { extractJsonMiddleware, generateImage, generateText, Output, wrapLanguageModel } from "ai";
import type { ImageModel, LanguageModel } from "ai";
import type { z } from "zod";
import { createOpenRouterFetch } from "./openrouterProxyFetch";

export type StoryCamGenerateObjectInput<T> = {
  model: LanguageModel;
  prompt: string;
  schema: z.ZodType<T>;
  schemaDescription?: string;
  schemaName?: string;
  system: string;
  temperature?: number;
};

export type StoryCamGenerateObject = <T>(input: StoryCamGenerateObjectInput<T>) => Promise<{ object: unknown }>;

export type StoryCamGeneratedImage = {
  mediaType: string;
  uint8Array: Uint8Array;
};

export type StoryCamGenerateImageInput = {
  aspectRatio?: `${number}:${number}`;
  images?: string[];
  model: ImageModel;
  prompt: string;
  seed?: number;
  size?: `${number}x${number}`;
};

export type StoryCamGenerateImage = (input: StoryCamGenerateImageInput) => Promise<{ image?: StoryCamGeneratedImage }>;

export function createOpenRouterChatModel(input: { apiKey: string; model: string }) {
  const openrouter = createOpenRouter({
    apiKey: input.apiKey,
    appName: "StoryCam",
    appUrl: "https://storycam.local",
    ...openRouterFetchOption()
  });

  return wrapLanguageModel({
    model: openrouter.chat(input.model, {
      plugins: [{ id: "response-healing" }],
      provider: {
        require_parameters: true
      }
    }),
    middleware: extractJsonMiddleware()
  });
}

export function createOpenRouterImageModel(input: { apiKey: string; model: string }) {
  return createOpenRouter({
    apiKey: input.apiKey,
    appName: "StoryCam",
    appUrl: "https://storycam.local",
    ...openRouterFetchOption()
  }).imageModel(input.model);
}

function openRouterFetchOption() {
  const proxiedFetch = createOpenRouterFetch();

  return proxiedFetch ? { fetch: proxiedFetch } : {};
}

export const storyCamGenerateObject: StoryCamGenerateObject = async (input) => {
  const result = await generateText({
    model: input.model,
    output: Output.object({
      description: input.schemaDescription,
      name: input.schemaName,
      schema: input.schema
    }),
    prompt: input.prompt,
    system: input.system,
    temperature: input.temperature ?? 0.4,
    timeout: 90_000
  });

  return {
    object: result.output
  };
};

export const storyCamGenerateImage: StoryCamGenerateImage = async (input) => {
  const prompt = input.images?.length
    ? {
        images: input.images,
        text: input.prompt
      }
    : input.prompt;

  const result = await generateImage({
    aspectRatio: input.aspectRatio,
    model: input.model,
    prompt,
    seed: input.seed,
    size: input.size
  });

  return {
    image: result.image
  };
};
