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

  it("rejects non-mock providers in mock mode", () => {
    expect(() =>
      loadStoryCamConfig({
        ...validMockEnv,
        STORYCAM_TEXT_PROVIDER: "openrouter"
      })
    ).toThrow(/INVALID_PROVIDER_FOR_MODE:STORYCAM_TEXT_PROVIDER/);
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
        OPENROUTER_IMAGE_MODEL: "image-model"
      })
    ).toThrow(/MISSING_ENV:SEEDANCE_API_KEY/);
  });

  it("requires OpenRouter credentials and model names in real mode", () => {
    expect(() =>
      loadStoryCamConfig({
        ...validMockEnv,
        STORYCAM_GENERATION_MODE: "real",
        STORYCAM_TEXT_PROVIDER: "openrouter",
        STORYCAM_MULTIMODAL_PROVIDER: "openrouter",
        STORYCAM_IMAGE_PROVIDER: "openrouter",
        STORYCAM_VIDEO_PROVIDER: "mock",
        STORYCAM_FINAL_WORK_PROVIDER: "ffmpeg"
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
