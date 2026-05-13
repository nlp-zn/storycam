import { afterEach, describe, expect, it, vi } from "vitest";
import { assertUnsafeRequestOrigin, OriginGuardError } from "./originGuard";

describe("origin guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows safe methods without an origin", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => assertUnsafeRequestOrigin(new Request("https://storycam.example.com/api/health"))).not.toThrow();
  });

  it("requires an origin for unsafe production requests", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() =>
      assertUnsafeRequestOrigin(new Request("https://storycam.example.com/api/final-work", { method: "POST" }))
    ).toThrow(new OriginGuardError("origin_required"));
  });

  it("allows the canonical app origin for unsafe requests", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://storycam.example.com");

    expect(() =>
      assertUnsafeRequestOrigin(
        new Request("https://render-storycam.onrender.com/api/final-work", {
          headers: { origin: "https://storycam.example.com" },
          method: "POST"
        })
      )
    ).not.toThrow();
  });

  it("allows explicit staging origins", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORYCAM_ALLOWED_ORIGINS", "https://staging.storycam.example.com");

    expect(() =>
      assertUnsafeRequestOrigin(
        new Request("https://storycam.example.com/api/final-work", {
          headers: { origin: "https://staging.storycam.example.com" },
          method: "POST"
        })
      )
    ).not.toThrow();
  });
});
