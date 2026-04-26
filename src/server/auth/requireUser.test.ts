import { describe, expect, it } from "vitest";
import { requireUser, UnauthorizedError } from "./requireUser";

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
});
