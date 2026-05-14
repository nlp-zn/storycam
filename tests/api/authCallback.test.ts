import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSessionMock = vi.hoisted(() => vi.fn());
const createServerSupabaseClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock
}));

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    exchangeCodeForSessionMock.mockReset();
    createServerSupabaseClientMock.mockReset();
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        exchangeCodeForSession: exchangeCodeForSessionMock
      }
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exchanges an OAuth code and redirects home by default", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(new NextRequest("https://storycam.test/auth/callback?code=oauth-code"));

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("oauth-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://storycam.test/");
  });

  it("allows safe in-app next paths", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://storycam.test/auth/callback?code=oauth-code&next=%2Fstorycam%2Finput")
    );

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("oauth-code");
    expect(response.headers.get("location")).toBe("https://storycam.test/storycam/input");
  });

  it("uses the configured app URL instead of an internal runtime origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://storycam.znbuild.com");
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(
      new NextRequest("https://localhost:10000/auth/callback?code=oauth-code&next=%2Fstorycam%2Finput")
    );

    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("oauth-code");
    expect(response.headers.get("location")).toBe("https://storycam.znbuild.com/storycam/input");
  });

  it("sanitizes protocol-relative next paths", async () => {
    const { GET } = await import("@/app/auth/callback/route");

    const response = await GET(new NextRequest("https://storycam.test/auth/callback?next=%2F%2Fevil.test"));

    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://storycam.test/");
  });
});
