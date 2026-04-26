import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";

export type StoryCamGenerateObjectInput<T> = {
  model: LanguageModel;
  prompt: string;
  schema: z.ZodType<T>;
  system: string;
  temperature?: number;
};

export type StoryCamGenerateObject = <T>(input: StoryCamGenerateObjectInput<T>) => Promise<{ object: unknown }>;

export function createOpenRouterChatModel(input: { apiKey: string; model: string }) {
  return createOpenRouter({
    apiKey: input.apiKey,
    appName: "StoryCam",
    appUrl: "https://storycam.local"
  }).chat(input.model);
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
