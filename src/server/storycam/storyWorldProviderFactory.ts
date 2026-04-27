import { createOpenRouterStoryWorldProvider } from "@/lib/providers/openrouter/storyWorldProvider";
import type { TextGenerationProvider } from "@/lib/providers/types";
import type { StoryWorldProviderInput, StoryWorldProviderOutput } from "@/lib/providers/storyWorld";
import type { StoryCamConfig } from "@/server/config";

export function createConfiguredStoryWorldProvider(
  config: StoryCamConfig
): TextGenerationProvider<StoryWorldProviderInput, StoryWorldProviderOutput> | undefined {
  if (config.generation.textProvider !== "openrouter") {
    return undefined;
  }

  return createOpenRouterStoryWorldProvider({
    apiKey: config.openrouter?.apiKey ?? "",
    maxAttempts: 3,
    model: config.openrouter?.textModel ?? ""
  });
}
