import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const deleteSessionMock = vi.hoisted(() => vi.fn());
const fromSupabaseClientMock = vi.hoisted(() => vi.fn());
const StoryCamStorageCleanupErrorMock = vi.hoisted(
  () =>
    class StoryCamStorageCleanupError extends Error {
      readonly code = "remove_failed";

      constructor() {
        super("StoryCam storage cleanup failed: remove_failed");
        this.name = "StoryCamStorageCleanupError";
      }
    }
);

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

vi.mock("@/server/storycam/storageCleanupService", () => ({
  StoryCamSessionDeletionService: {
    fromSupabaseClient: fromSupabaseClientMock
  },
  StoryCamStorageCleanupError: StoryCamStorageCleanupErrorMock
}));

describe("StoryCam session deletion API route", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    deleteSessionMock.mockReset();
    fromSupabaseClientMock.mockReset();
    fromSupabaseClientMock.mockReturnValue({ deleteSession: deleteSessionMock });
  });

  it("deletes session media and metadata for the authenticated owner", async () => {
    const { DELETE } = await import("@/app/api/storycam-sessions/[id]/route");
    const client = { storage: {} };

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client);
    deleteSessionMock.mockResolvedValue({
      bucketsTouched: ["storycam-generated"],
      removedObjectCount: 2,
      skippedObjectCount: 0
    });

    const response = await DELETE(new Request("https://storycam.test/api/storycam-sessions/session-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "session-1" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      bucketsTouched: ["storycam-generated"],
      ok: true,
      removedObjectCount: 2,
      sessionId: "session-1",
      skippedObjectCount: 0
    });
    expect(fromSupabaseClientMock).toHaveBeenCalledWith(client);
    expect(deleteSessionMock).toHaveBeenCalledWith("user-1", "session-1");
  });

  it("requires authentication", async () => {
    const { DELETE } = await import("@/app/api/storycam-sessions/[id]/route");
    const { UnauthorizedError } = await import("@/server/auth/requireUser");

    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await DELETE(new Request("https://storycam.test/api/storycam-sessions/session-1", { method: "DELETE" }), {
      params: { id: "session-1" }
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "authentication_required" });
  });

  it("redacts storage cleanup failures", async () => {
    const { DELETE } = await import("@/app/api/storycam-sessions/[id]/route");

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue({ storage: {} });
    deleteSessionMock.mockRejectedValue(new StoryCamStorageCleanupErrorMock());

    const response = await DELETE(new Request("https://storycam.test/api/storycam-sessions/session-1", { method: "DELETE" }), {
      params: { id: "session-1" }
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "remove_failed",
      redactedError: "Session deletion failed.",
      redactionApplied: true
    });
    expect(JSON.stringify(body)).not.toContain("service role key");
    expect(JSON.stringify(body)).not.toContain("signed url");
  });
});
