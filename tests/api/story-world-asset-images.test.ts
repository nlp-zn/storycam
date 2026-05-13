import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const createConfiguredStoryWorldAssetImageProviderMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/server/auth/requireUser", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/requireUser")>("@/server/auth/requireUser");

  return {
    ...actual,
    requireUser: requireUserMock
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/server/storycam/storyWorldAssetImageProviderFactory", () => ({
  createConfiguredStoryWorldAssetImageProvider: createConfiguredStoryWorldAssetImageProviderMock
}));

describe("story-world asset image routes", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createConfiguredStoryWorldAssetImageProviderMock.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storycam.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.STORYCAM_IMAGE_PROVIDER = "mock";
  });

  it("rejects invalid JSON for a single asset image request", async () => {
    const { POST } = await import("@/app/api/story-world/assets/generate-image/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });

    const response = await POST(invalidJsonRequest("/api/story-world/assets/generate-image"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_input",
      redactedError: "Invalid asset image request.",
      redactionApplied: true
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON for a batch asset image request", async () => {
    const { POST } = await import("@/app/api/story-world/assets/generate-images/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });

    const response = await POST(invalidJsonRequest("/api/story-world/assets/generate-images"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_input",
      redactedError: "Invalid asset image request.",
      redactionApplied: true
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns a redacted config error before submitting batch asset image jobs", async () => {
    const { POST } = await import("@/app/api/story-world/assets/generate-images/route");

    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    requireUserMock.mockResolvedValue({ id: "user-1" });

    const response = await POST(
      jsonRequest("/api/story-world/assets/generate-images", {
        assetArtifactIds: ["scene-artifact-1"],
        sessionId: "session-1"
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "STORYCAM_CONFIG_INVALID",
      redactedError: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
      redactionApplied: true
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns a redacted config error before submitting a single asset image job", async () => {
    const { POST } = await import("@/app/api/story-world/assets/generate-image/route");

    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    requireUserMock.mockResolvedValue({ id: "user-1" });

    const response = await POST(
      jsonRequest("/api/story-world/assets/generate-image", {
        assetArtifactId: "scene-artifact-1",
        assetKind: "scene",
        sessionId: "session-1"
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "STORYCAM_CONFIG_INVALID",
      redactedError: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
      redactionApplied: true
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });
});

function jsonRequest(path: string, body: unknown) {
  return new Request(`https://storycam.test${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}

function invalidJsonRequest(path: string) {
  return new Request(`https://storycam.test${path}`, {
    body: "{not-json",
    headers: { "content-type": "application/json" },
    method: "POST"
  });
}
