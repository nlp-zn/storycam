import { createOpenRouterStoryboardProvider } from "@/lib/providers/openrouter/storyboardProvider";
import type { MockStoryboardInput, MockStoryboardOutput } from "@/lib/providers/mock/storyboardProvider";
import type { TextGenerationProvider } from "@/lib/providers/types";
import type { StoryCamConfig } from "@/server/config";

export function createConfiguredStoryboardProvider(
  config: StoryCamConfig
): TextGenerationProvider<MockStoryboardInput, MockStoryboardOutput> | undefined {
  if (config.generation.textProvider !== "openrouter") {
    return undefined;
  }

  return createOpenRouterStoryboardProvider({
    apiKey: config.openrouter?.apiKey ?? "",
    fallbackModels: config.openrouter?.textFallbackModels,
    maxAttempts: 3,
    model: config.openrouter?.textModel ?? ""
  });
}
