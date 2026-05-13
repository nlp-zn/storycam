import { createDeepSeekStoryWorldProvider } from "@/lib/providers/deepseek/storyWorldProvider";
import { createOpenRouterStoryWorldProvider } from "@/lib/providers/openrouter/storyWorldProvider";
import type { TextGenerationProvider } from "@/lib/providers/types";
import type { StoryWorldProviderInput, StoryWorldProviderOutput } from "@/lib/providers/storyWorld";
import type { StoryCamConfig } from "@/server/config";

export function createConfiguredStoryWorldProvider(
  config: StoryCamConfig
): TextGenerationProvider<StoryWorldProviderInput, StoryWorldProviderOutput> | undefined {
  const provider = config.generation.storyWorldTextProvider ?? config.generation.textProvider;

  if (provider === "deepseek") {
    return createDeepSeekStoryWorldProvider({
      apiKey: config.deepseek?.apiKey ?? "",
      baseUrl: config.deepseek?.textBaseUrl,
      fallbackModels: config.deepseek?.textFallbackModels,
      model: config.deepseek?.textModel ?? "deepseek-v4-pro"
    });
  }

  if (provider === "openrouter") {
    return createOpenRouterStoryWorldProvider({
      apiKey: config.openrouter?.apiKey ?? "",
      fallbackModels: config.openrouter?.textFallbackModels,
      maxAttempts: 3,
      model: config.openrouter?.textModel ?? ""
    });
  }

  return undefined;
}
