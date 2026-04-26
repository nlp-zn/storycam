import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateImage, generateObject } from "ai";
import type { ImageModel, LanguageModel } from "ai";
import type { z } from "zod";

export type StoryCamGenerateObjectInput<T> = {
  model: LanguageModel;
  prompt: string;
  schema: z.ZodType<T>;
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
  model: ImageModel;
  prompt: string;
  seed?: number;
  size?: `${number}x${number}`;
};

export type StoryCamGenerateImage = (input: StoryCamGenerateImageInput) => Promise<{ image?: StoryCamGeneratedImage }>;

export function createOpenRouterChatModel(input: { apiKey: string; model: string }) {
  return createOpenRouter({
    apiKey: input.apiKey,
    appName: "StoryCam",
    appUrl: "https://storycam.local"
  }).chat(input.model);
}

export function createOpenRouterImageModel(input: { apiKey: string; model: string }) {
  return createOpenRouter({
    apiKey: input.apiKey,
    appName: "StoryCam",
    appUrl: "https://storycam.local"
  }).imageModel(input.model);
}

export const storyCamGenerateObject: StoryCamGenerateObject = async (input) => {
  const result = await generateObject({
    model: input.model,
    prompt: input.prompt,
    schema: input.schema,
    system: input.system,
    temperature: input.temperature ?? 0.4
  });

  return {
    object: result.object
  };
};

export const storyCamGenerateImage: StoryCamGenerateImage = async (input) => {
  const result = await generateImage({
    aspectRatio: input.aspectRatio,
    model: input.model,
    prompt: input.prompt,
    seed: input.seed,
    size: input.size
  });

  return {
    image: result.image
  };
};
