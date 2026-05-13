import { describe, expect, it } from "vitest";
import type { StoryCamConfig } from "@/server/config";
import { createConfiguredVideoProviders } from "./videoProviderFactory";

describe("createConfiguredVideoProviders", () => {
  it("creates regular and fast Seedance providers with distinct provider names", () => {
    const providers = createConfiguredVideoProviders(seedanceConfig());

    expect(providers.seedance_2_0).toMatchObject({
      providerKind: "video",
      providerName: "seedance_2_0"
    });
    expect(providers.seedance_2_0_fast).toMatchObject({
      providerKind: "video",
      providerName: "seedance_2_0_fast"
    });
  });
});

function seedanceConfig(): StoryCamConfig {
  return {
    generation: {
      finalWorkProvider: "ffmpeg",
      imageProvider: "openrouter",
      mode: "real",
      multimodalProvider: "openrouter",
      textProvider: "openrouter",
      videoProvider: "seedance_2_0"
    },
    media: {
      providerReferenceSignedUrlTtlSeconds: 3600
    },
    openrouter: {
      apiKey: "openrouter-key",
      imageModel: "image-model",
      multimodalModel: "multimodal-model",
      textModel: "text-model"
    },
    seedance: {
      apiKey: "seedance-key",
      models: {
        seedance_2_0: "doubao-seedance-2-0-260128",
        seedance_2_0_fast: "doubao-seedance-2-0-fast-260128"
      }
    },
    supabase: {
      anonKey: "anon-key",
      serviceRoleKey: "service-role-key",
      url: "https://storycam.example.supabase.co"
    }
  };
}
