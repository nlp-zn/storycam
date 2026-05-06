import type { StoryCamConfig } from "@/server/config";
import type { GenerationJobServiceVideoProvider } from "./generationJobService";
import { createSeedanceVideoProvider } from "@/lib/providers/seedance/videoProvider";

export function createConfiguredVideoProvider(config: StoryCamConfig): GenerationJobServiceVideoProvider | undefined {
  if (config.generation.videoProvider !== "seedance_2_0") {
    return undefined;
  }

  if (!config.seedance?.apiKey || !config.seedance.model) {
    return undefined;
  }

  return createSeedanceVideoProvider({
    apiKey: config.seedance.apiKey,
    model: config.seedance.model,
    polling: {
      enabled: false
    }
  });
}
