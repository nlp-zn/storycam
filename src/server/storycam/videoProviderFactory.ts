import type { StoryCamConfig } from "@/server/config";
import { storyCamVideoModels, type StoryCamVideoModel } from "@/features/storycam/domain/videoSettings";
import type { GenerationJobServiceVideoProvider } from "./generationJobService";
import { createSeedanceVideoProvider } from "@/lib/providers/seedance/videoProvider";

export function createConfiguredVideoProvider(config: StoryCamConfig): GenerationJobServiceVideoProvider | undefined {
  return createConfiguredVideoProviders(config).seedance_2_0;
}

export function createConfiguredVideoProviders(
  config: StoryCamConfig
): Partial<Record<StoryCamVideoModel, GenerationJobServiceVideoProvider>> {
  if (config.generation.videoProvider !== "seedance_2_0") {
    return {};
  }

  if (!config.seedance?.apiKey) {
    return {};
  }

  const providers: Partial<Record<StoryCamVideoModel, GenerationJobServiceVideoProvider>> = {};
  const seedance = config.seedance;

  for (const providerName of storyCamVideoModels) {
    const model = seedance.models[providerName];

    if (!model) {
      continue;
    }

    providers[providerName] = createSeedanceVideoProvider({
      apiKey: seedance.apiKey,
      model,
      polling: {
        enabled: false
      },
      providerName
    });
  }

  return providers;
}
