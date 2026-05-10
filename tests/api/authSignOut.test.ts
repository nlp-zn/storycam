import { beforeEach, describe, expect, it, vi } from "vitest";
import { localAuthBypassDisabledCookieName } from "@/server/auth/requireUser";

const signOutMock = vi.hoisted(() => vi.fn());
const createServerSupabaseClientMock = vi.hoisted(() => vi.fn());
const originalNodeEnv = process.env.NODE_ENV;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock
}));

describe("POST /api/auth/sign-out", () => {
  beforeEach(() => {
    vi.resetModules();
    signOutMock.mockReset();
    createServerSupabaseClientMock.mockReset();
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        signOut: signOutMock
      }
    });
    signOutMock.mockResolvedValue({ error: null });
    vi.unstubAllEnvs();
    if (originalNodeEnv) {
      vi.stubEnv("NODE_ENV", originalNodeEnv);
    }
    delete process.env.STORYCAM_LOCAL_AUTH_BYPASS;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("signs out through the server Supabase client", async () => {
    const { POST } = await import("@/app/api/auth/sign-out/route");

    const response = await POST();

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("sets a per-browser opt-out cookie when local auth bypass is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.STORYCAM_LOCAL_AUTH_BYPASS = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    const { POST } = await import("@/app/api/auth/sign-out/route");

    const response = await POST();

    expect(response.headers.get("set-cookie")).toContain(`${localAuthBypassDisabledCookieName}=1`);
  });

  it("returns a redacted failure when Supabase sign-out fails", async () => {
    signOutMock.mockResolvedValue({ error: { message: "raw provider failure" } });
    const { POST } = await import("@/app/api/auth/sign-out/route");

    const response = await POST();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "sign_out_failed",
      ok: false
    });
  });
});
