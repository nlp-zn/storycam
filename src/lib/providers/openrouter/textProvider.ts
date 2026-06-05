import type { LanguageModel } from "ai";
import type { z } from "zod";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type { ProviderResult, TextGenerationProvider } from "@/lib/providers/types";
import { createOpenRouterChatModel, storyCamGenerateObject, type StoryCamGenerateObject } from "@/server/ai/vercelAiClient";

export type OpenRouterStructuredPrompt = {
  prompt: string;
  system: string;
  temperature?: number;
};

export type OpenRouterTextProviderOptions<Input, Output> = {
  apiKey: string;
  buildPrompt: (input: Input) => OpenRouterStructuredPrompt;
  fallbackModels?: string[];
  generateObject?: StoryCamGenerateObject;
  maxAttempts?: number;
  model: string;
  outputSchema: z.ZodType<Output>;
  schemaDescription?: string;
  schemaName?: string;
};

export function createOpenRouterTextProvider<Input, Output>(
  options: OpenRouterTextProviderOptions<Input, Output>
): TextGenerationProvider<Input, Output> {
  const identity = {
    providerKind: "text" as const,
    providerName: "openrouter" as const
  };
  const models = [options.model, ...(options.fallbackModels ?? [])].map((modelId) =>
    createOpenRouterChatModel({
      apiKey: options.apiKey,
      model: modelId
    })
  );
  const generate = options.generateObject ?? storyCamGenerateObject;

  return {
    ...identity,
    async generate(input): Promise<ProviderResult<Output>> {
      const prompt = options.buildPrompt(input);

      return generateValidatedObject({
        errorCode: "OPENROUTER_TEXT_INVALID_OUTPUT",
        generate,
        identity,
        maxAttempts: options.maxAttempts ?? 2,
        models,
        outputSchema: options.outputSchema,
        prompt,
        schemaDescription: options.schemaDescription,
        schemaName: options.schemaName
      });
    }
  };
}

async function generateValidatedObject<Output>(input: {
  errorCode: string;
  generate: StoryCamGenerateObject;
  identity: { providerKind: "text"; providerName: "openrouter" };
  maxAttempts: number;
  models: LanguageModel[];
  outputSchema: z.ZodType<Output>;
  prompt: OpenRouterStructuredPrompt;
  schemaDescription?: string;
  schemaName?: string;
}) {
  let lastError: unknown = new Error("OpenRouter returned no object.");

  for (let attempt = 0; attempt < input.maxAttempts; attempt += 1) {
    try {
      const model = input.models[Math.min(attempt, input.models.length - 1)];
      const result = await input.generate({
        model,
        prompt: input.prompt.prompt,
        schema: input.outputSchema,
        schemaDescription: input.schemaDescription,
        schemaName: input.schemaName,
        system: input.prompt.system,
        temperature: input.prompt.temperature
      });
      const parsed = input.outputSchema.safeParse(result.object);

      if (parsed.success) {
        return providerSuccess(input.identity, parsed.data);
      }

      lastError = parsed.error;
    } catch (error) {
      lastError = error;
    }
  }

  return providerFailure(input.identity, lastError, {
    errorCode: input.errorCode,
    retryable: true
  });
}
