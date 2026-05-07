import { describe, expect, it } from "vitest";
import { isLocalAuthBypassEnabled, requireUser, UnauthorizedError } from "./requireUser";

describe("requireUser", () => {
  it("returns the authenticated user from validated claims", async () => {
    await expect(
      requireUser({
        auth: {
          getClaims: async () => ({
            data: { claims: { sub: "user-123", email: "user@example.com" } },
            error: null
          })
        }
      })
    ).resolves.toEqual({ id: "user-123", email: "user@example.com" });
  });

  it("rejects missing claims", async () => {
    await expect(
      requireUser({
        auth: {
          getClaims: async () => ({ data: { claims: {} }, error: null })
        }
      })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects auth errors without leaking provider details", async () => {
    await expect(
      requireUser({
        auth: {
          getClaims: async () => ({
            data: null,
            error: { message: "raw provider token failure" }
          })
        }
      })
    ).rejects.toThrow("Authentication required.");
  });

  it("allows local auth bypass for non-production local Supabase", () => {
    expect(
      isLocalAuthBypassEnabled({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NODE_ENV: "development",
        STORYCAM_LOCAL_AUTH_BYPASS: "1"
      })
    ).toBe(true);

    expect(
      isLocalAuthBypassEnabled({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NODE_ENV: "production",
        STORYCAM_LOCAL_AUTH_BYPASS: "1"
      })
    ).toBe(false);
  });

  it("allows hosted dev auth bypass only for explicitly allowlisted Supabase refs", () => {
    expect(
      isLocalAuthBypassEnabled({
        NEXT_PUBLIC_SUPABASE_URL: "https://devref.supabase.co",
        NODE_ENV: "development",
        STORYCAM_LOCAL_AUTH_BYPASS: "1",
        STORYCAM_LOCAL_AUTH_BYPASS_ALLOWED_SUPABASE_REFS: "devref"
      })
    ).toBe(true);

    expect(
      isLocalAuthBypassEnabled({
        NEXT_PUBLIC_SUPABASE_URL: "https://otherref.supabase.co",
        NODE_ENV: "development",
        STORYCAM_LOCAL_AUTH_BYPASS: "1",
        STORYCAM_LOCAL_AUTH_BYPASS_ALLOWED_SUPABASE_REFS: "devref"
      })
    ).toBe(false);

    expect(
      isLocalAuthBypassEnabled({
        NEXT_PUBLIC_SUPABASE_URL: "https://devref.supabase.co",
        NODE_ENV: "development",
        STORYCAM_LOCAL_AUTH_BYPASS: "1"
      })
    ).toBe(false);

    expect(
      isLocalAuthBypassEnabled({
        NEXT_PUBLIC_SUPABASE_URL: "https://devref.supabase.co",
        NODE_ENV: "production",
        STORYCAM_LOCAL_AUTH_BYPASS: "1",
        STORYCAM_LOCAL_AUTH_BYPASS_ALLOWED_SUPABASE_REFS: "devref"
      })
    ).toBe(false);
  });

  it("keeps explicit test clients on validated claims even when bypass env is enabled", async () => {
    process.env.STORYCAM_LOCAL_AUTH_BYPASS = "1";

    await expect(
      requireUser({
        auth: {
          getClaims: async () => ({
            data: { claims: { sub: "claimed-user", email: "claimed@example.test" } },
            error: null
          })
        }
      })
    ).resolves.toEqual({ id: "claimed-user", email: "claimed@example.test" });

    delete process.env.STORYCAM_LOCAL_AUTH_BYPASS;
  });
});
