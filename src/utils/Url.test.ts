import { describe, expect, it } from "vitest";
import { getBaseUrl } from "./Url";

describe("getBaseUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL when configured", () => {
    expect(getBaseUrl({ NEXT_PUBLIC_APP_URL: "https://storycam.example/" })).toBe(
      "https://storycam.example"
    );
  });

  it("uses Vercel preview URLs when present", () => {
    expect(getBaseUrl({ VERCEL_URL: "storycam-preview.vercel.app" })).toBe(
      "https://storycam-preview.vercel.app"
    );
  });

  it("falls back to localhost for local development", () => {
    expect(getBaseUrl({})).toBe("http://localhost:3000");
  });
});
