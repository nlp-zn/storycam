import { describe, expect, it } from "vitest";
import { loadStoryCamConfig, redactConfigError } from "./config";

const validMockEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://storycam.example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  STORYCAM_GENERATION_MODE: "mock"
};

describe("loadStoryCamConfig", () => {
  it("loads safe mock defaults", () => {
    const config = loadStoryCamConfig(validMockEnv);

    expect(config.generation).toEqual({
      mode: "mock",
      textProvider: "mock",
      multimodalProvider: "mock",
      imageProvider: "mock",
      videoProvider: "mock",
      finalWorkProvider: "mock"
    });
    expect(config.openrouter).toBeUndefined();
    expect(config.seedance).toBeUndefined();
  });

  it("allows an OpenRouter text provider in mock mode for mixed local verification", () => {
    const config = loadStoryCamConfig({
      ...validMockEnv,
      OPENROUTER_API_KEY: "openrouter-key",
      OPENROUTER_TEXT_MODEL: "deepseek/deepseek-v4-pro",
      STORYCAM_TEXT_PROVIDER: "openrouter"
    });

    expect(config.generation).toMatchObject({
      mode: "mock",
      textProvider: "openrouter",
      imageProvider: "mock",
      videoProvider: "mock"
    });
    expect(config.openrouter).toEqual({
      apiKey: "openrouter-key",
      textModel: "deepseek/deepseek-v4-pro"
    });
  });

  it("allows an OpenRouter image provider in mock mode for story-world asset generation", () => {
    const config = loadStoryCamConfig({
      ...validMockEnv,
      OPENROUTER_API_KEY: "openrouter-key",
      OPENROUTER_IMAGE_MODEL: "openai/gpt-5.4-image-2",
      STORYCAM_IMAGE_PROVIDER: "openrouter"
    });

    expect(config.generation).toMatchObject({
      mode: "mock",
      imageProvider: "openrouter",
      textProvider: "mock",
      videoProvider: "mock"
    });
    expect(config.openrouter).toEqual({
      apiKey: "openrouter-key",
      imageModel: "openai/gpt-5.4-image-2"
    });
  });

  it("rejects non-text real providers in mock mode", () => {
    expect(() =>
      loadStoryCamConfig({
        ...validMockEnv,
        STORYCAM_VIDEO_PROVIDER: "seedance_2_0"
      })
    ).toThrow(/INVALID_PROVIDER_FOR_MODE:STORYCAM_VIDEO_PROVIDER/);
  });

  it("requires Seedance credentials for the Seedance video provider", () => {
    expect(() =>
      loadStoryCamConfig({
        ...validMockEnv,
        STORYCAM_GENERATION_MODE: "real",
        STORYCAM_TEXT_PROVIDER: "openrouter",
        STORYCAM_MULTIMODAL_PROVIDER: "openrouter",
        STORYCAM_IMAGE_PROVIDER: "openrouter",
        STORYCAM_VIDEO_PROVIDER: "seedance_2_0",
        STORYCAM_FINAL_WORK_PROVIDER: "ffmpeg",
        OPENROUTER_API_KEY: "openrouter-key",
        OPENROUTER_TEXT_MODEL: "text-model",
        OPENROUTER_MULTIMODAL_MODEL: "multimodal-model",
        OPENROUTER_IMAGE_MODEL: "image-model",
        SEEDANCE_MODEL: "doubao-seedance-2-0-260128"
      })
    ).toThrow(/MISSING_ENV:SEEDANCE_API_KEY/);
  });

  it("loads Seedance credentials and model in real video mode", () => {
    const config = loadStoryCamConfig({
      ...validMockEnv,
      STORYCAM_GENERATION_MODE: "real",
      STORYCAM_TEXT_PROVIDER: "openrouter",
      STORYCAM_MULTIMODAL_PROVIDER: "openrouter",
      STORYCAM_IMAGE_PROVIDER: "openrouter",
      STORYCAM_VIDEO_PROVIDER: "seedance_2_0",
      STORYCAM_FINAL_WORK_PROVIDER: "ffmpeg",
      OPENROUTER_API_KEY: "openrouter-key",
      OPENROUTER_TEXT_MODEL: "text-model",
      OPENROUTER_MULTIMODAL_MODEL: "multimodal-model",
      OPENROUTER_IMAGE_MODEL: "image-model",
      SEEDANCE_API_KEY: "seedance-key",
      SEEDANCE_MODEL: "doubao-seedance-2-0-260128"
    });

    expect(config.seedance).toEqual({
      apiKey: "seedance-key",
      model: "doubao-seedance-2-0-260128"
    });
  });

  it("requires OpenRouter credentials and enabled provider model names", () => {
    expect(() =>
      loadStoryCamConfig({
        ...validMockEnv,
        STORYCAM_TEXT_PROVIDER: "openrouter",
        STORYCAM_VIDEO_PROVIDER: "mock",
        STORYCAM_FINAL_WORK_PROVIDER: "mock"
      })
    ).toThrow(/MISSING_ENV:OPENROUTER_API_KEY/);
  });

  it("redacts secret values from config errors", () => {
    const secret = "super-secret-service-role-key";

    try {
      loadStoryCamConfig({
        ...validMockEnv,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        SUPABASE_SERVICE_ROLE_KEY: secret
      });
    } catch (error) {
      const redacted = redactConfigError(error);

      expect(redacted.redactionApplied).toBe(true);
      expect(redacted.message).not.toContain(secret);
      expect(JSON.stringify(redacted.issues)).not.toContain(secret);
    }
  });
});
