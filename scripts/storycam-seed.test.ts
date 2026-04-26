import { describe, expect, it } from "vitest";
import { buildSeedStoragePath, hashSeedKey, resolveSeedUserId } from "./storycam-seed";

describe("storycam seed script helpers", () => {
  it("resolves the target user from args before env", () => {
    expect(resolveSeedUserId(["--user-id", "arg-user"], { STORYCAM_SEED_USER_ID: "env-user" })).toBe("arg-user");
    expect(resolveSeedUserId(["--user-id=inline-user"], { STORYCAM_SEED_USER_ID: "env-user" })).toBe("inline-user");
    expect(resolveSeedUserId([], { STORYCAM_SEED_USER_ID: "env-user" })).toBe("env-user");
  });

  it("requires an explicit user id", () => {
    expect(() => resolveSeedUserId([], {})).toThrow("Missing seed user id");
  });

  it("builds private bucket object paths under the owning user", () => {
    expect(buildSeedStoragePath("user-1", "session-1")).toBe(
      "users/user-1/sessions/session-1/mock/storycam-seed-clip.mp4"
    );
  });

  it("hashes idempotency keys instead of storing the raw seed key", () => {
    const hash = hashSeedKey("user-1", "session-1", "mock-video-clip");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("user-1");
    expect(hash).not.toContain("session-1");
  });
});
