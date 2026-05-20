import { describe, expect, it } from "vitest";
import type { MediaAssetRow } from "@/server/db/types";
import type { StoryCamPrivateBucket } from "./mediaStore";
import {
  StoryCamSessionDeletionService,
  StoryCamStorageCleanupError,
  StoryCamStorageCleanupService,
  type StorageCleanupPremiereTicketRepository,
  type StorageCleanupRepository,
  type StorageCleanupSessionRepository
} from "./storageCleanupService";

describe("StoryCamStorageCleanupService", () => {
  it("groups session media removal by private storage bucket", async () => {
    const repository = new FakeMediaRepository([
      media({ id: "media-1", storageBucket: "storycam-generated", storagePath: "generated/clip-1.mp4" }),
      media({ id: "media-2", storageBucket: "storycam-generated", storagePath: "generated/final.mp4" }),
      media({ id: "media-3", storageBucket: "storycam-mock", storagePath: "mock/clip-1.mp4" })
    ]);
    const storage = new FakeStorageClient();
    const service = new StoryCamStorageCleanupService(storage, repository);

    const summary = await service.removeSessionMedia("user-1", "session-1");

    expect(storage.removals).toEqual([
      { bucket: "storycam-generated", paths: ["generated/clip-1.mp4", "generated/final.mp4"] },
      { bucket: "storycam-mock", paths: ["mock/clip-1.mp4"] }
    ]);
    expect(summary).toEqual({
      bucketsTouched: ["storycam-generated", "storycam-mock"],
      removedObjectCount: 3,
      skippedObjectCount: 0
    });
  });

  it("lists media through the repository with owner and session scope", async () => {
    const repository = new FakeMediaRepository([
      media({ id: "media-1", storageBucket: "storycam-uploads", storagePath: "uploads/photo.jpg" })
    ]);
    const storage = new FakeStorageClient();
    const service = new StoryCamStorageCleanupService(storage, repository);

    await service.removeSessionMedia("user-1", "session-1");

    expect(repository.calls).toEqual([{ cleanupCandidates: true, sessionId: "session-1", userId: "user-1" }]);
  });

  it("does nothing when the session has no cleanup media rows", async () => {
    const repository = new FakeMediaRepository([]);
    const storage = new FakeStorageClient();
    const service = new StoryCamStorageCleanupService(storage, repository);

    const summary = await service.removeSessionMedia("user-1", "session-1");

    expect(storage.removals).toEqual([]);
    expect(summary).toEqual({
      bucketsTouched: [],
      removedObjectCount: 0,
      skippedObjectCount: 0
    });
  });

  it("ignores unexpected buckets instead of deleting outside StoryCam private storage", async () => {
    const repository = new FakeMediaRepository([
      media({ id: "media-1", storageBucket: "public-sharing", storagePath: "public/object.mp4" }),
      media({ id: "media-2", storageBucket: "storycam-uploads", storagePath: "uploads/photo.jpg" })
    ]);
    const storage = new FakeStorageClient();
    const service = new StoryCamStorageCleanupService(storage, repository);

    const summary = await service.removeSessionMedia("user-1", "session-1");

    expect(storage.removals).toEqual([{ bucket: "storycam-uploads", paths: ["uploads/photo.jpg"] }]);
    expect(summary).toEqual({
      bucketsTouched: ["storycam-uploads"],
      removedObjectCount: 1,
      skippedObjectCount: 1
    });
  });

  it("throws redacted storage errors when remove fails", async () => {
    const repository = new FakeMediaRepository([
      media({ id: "media-1", storageBucket: "storycam-generated", storagePath: "generated/clip-1.mp4" })
    ]);
    const storage = new FakeStorageClient({
      "storycam-generated": { message: "signed url https://example.test/token and service role key leaked" }
    });
    const service = new StoryCamStorageCleanupService(storage, repository);

    await expect(service.removeSessionMedia("user-1", "session-1")).rejects.toMatchObject({
      code: "remove_failed"
    });
    await expect(service.removeSessionMedia("user-1", "session-1")).rejects.toBeInstanceOf(
      StoryCamStorageCleanupError
    );
    await expect(service.removeSessionMedia("user-1", "session-1")).rejects.not.toThrow("service role key");
    await expect(service.removeSessionMedia("user-1", "session-1")).rejects.not.toThrow("signed url");
  });

  it("soft-deletes session metadata before removing storage objects", async () => {
    const events: string[] = [];
    const repository = new FakeMediaRepository([
      media({ id: "media-1", storageBucket: "storycam-generated", storagePath: "generated/clip-1.mp4" })
    ]);
    const storage = new FakeStorageClient(undefined, events);
    const cleanup = new StoryCamStorageCleanupService(storage, repository);
    const sessions = new FakeSessionRepository(events);
    const premiereTickets = new FakePremiereTicketRepository(events);
    const service = new StoryCamSessionDeletionService(cleanup, sessions, premiereTickets);

    const summary = await service.deleteSession("user-1", "session-1");

    expect(summary.removedObjectCount).toBe(1);
    expect(events).toEqual(["soft-delete:session-1", "release-ticket:session-1", "remove:storycam-generated"]);
    expect(storage.removals).toEqual([{ bucket: "storycam-generated", paths: ["generated/clip-1.mp4"] }]);
    expect(sessions.calls).toEqual([{ sessionId: "session-1", userId: "user-1" }]);
    expect(premiereTickets.calls).toEqual([{ sessionId: "session-1", userId: "user-1" }]);
  });

  it("does not remove storage when session metadata soft delete fails", async () => {
    const repository = new FakeMediaRepository([
      media({ id: "media-1", storageBucket: "storycam-generated", storagePath: "generated/clip-1.mp4" })
    ]);
    const storage = new FakeStorageClient();
    const cleanup = new StoryCamStorageCleanupService(storage, repository);
    const sessions = new FakeSessionRepository([], new Error("database unavailable"));
    const premiereTickets = new FakePremiereTicketRepository();
    const service = new StoryCamSessionDeletionService(cleanup, sessions, premiereTickets);

    await expect(service.deleteSession("user-1", "session-1")).rejects.toThrow("database unavailable");
    expect(storage.removals).toEqual([]);
    expect(premiereTickets.calls).toEqual([]);
  });

  it("does not remove storage when reserved premiere ticket release fails", async () => {
    const repository = new FakeMediaRepository([
      media({ id: "media-1", storageBucket: "storycam-generated", storagePath: "generated/clip-1.mp4" })
    ]);
    const storage = new FakeStorageClient();
    const cleanup = new StoryCamStorageCleanupService(storage, repository);
    const sessions = new FakeSessionRepository();
    const premiereTickets = new FakePremiereTicketRepository([], new Error("ticket unavailable"));
    const service = new StoryCamSessionDeletionService(cleanup, sessions, premiereTickets);

    await expect(service.deleteSession("user-1", "session-1")).rejects.toThrow("ticket unavailable");
    expect(storage.removals).toEqual([]);
    expect(sessions.calls).toEqual([{ sessionId: "session-1", userId: "user-1" }]);
    expect(premiereTickets.calls).toEqual([{ sessionId: "session-1", userId: "user-1" }]);
  });

  it("can retry storage cleanup after session metadata is already soft-deleted", async () => {
    const repository = new FakeMediaRepository([
      media({
        deletedAt: "2026-05-12T00:00:00.000Z",
        id: "media-1",
        storageBucket: "storycam-generated",
        storagePath: "generated/clip-1.mp4"
      })
    ]);
    const storage = new FakeStorageClient();
    const cleanup = new StoryCamStorageCleanupService(storage, repository);
    const sessions = new FakeSessionRepository();
    const premiereTickets = new FakePremiereTicketRepository();
    const service = new StoryCamSessionDeletionService(cleanup, sessions, premiereTickets);

    const summary = await service.deleteSession("user-1", "session-1");

    expect(summary.removedObjectCount).toBe(1);
    expect(storage.removals).toEqual([{ bucket: "storycam-generated", paths: ["generated/clip-1.mp4"] }]);
    expect(repository.calls).toEqual([{ cleanupCandidates: true, sessionId: "session-1", userId: "user-1" }]);
  });
});

type MediaOverrides = {
  deletedAt?: string | null;
  id: string;
  storageBucket: string;
  storagePath: string;
};

function media(overrides: MediaOverrides): MediaAssetRow {
  return {
    byte_size: 1024,
    created_at: "2026-04-26T00:00:00.000Z",
    deleted_at: overrides.deletedAt ?? null,
    id: overrides.id,
    kind: "generated_clip",
    linked_artifact_id: null,
    mime_type: "video/mp4",
    session_id: "session-1",
    source: "provider",
    storage_bucket: overrides.storageBucket,
    storage_path: overrides.storagePath,
    user_id: "user-1"
  };
}

class FakeMediaRepository implements StorageCleanupRepository {
  readonly calls: Array<{ cleanupCandidates?: boolean; sessionId: string; userId: string }> = [];

  constructor(private readonly rows: MediaAssetRow[]) {}

  listBySession(userId: string, sessionId: string) {
    this.calls.push({ sessionId, userId });
    return Promise.resolve(this.rows);
  }

  listStorageCleanupCandidates(userId: string, sessionId: string) {
    this.calls.push({ cleanupCandidates: true, sessionId, userId });
    return Promise.resolve(this.rows);
  }
}

class FakeStorageClient {
  readonly removals: Array<{ bucket: StoryCamPrivateBucket; paths: string[] }> = [];

  constructor(
    private readonly errors: Partial<Record<StoryCamPrivateBucket, { message?: string }>> = {},
    private readonly events: string[] = []
  ) {}

  storage = {
    from: (bucket: StoryCamPrivateBucket) => ({
      remove: (paths: string[]) => {
        this.events.push(`remove:${bucket}`);
        this.removals.push({ bucket, paths });
        return Promise.resolve({
          data: null,
          error: this.errors[bucket] ?? null
        });
      }
    })
  };
}

class FakeSessionRepository implements StorageCleanupSessionRepository {
  readonly calls: Array<{ sessionId: string; userId: string }> = [];

  constructor(
    private readonly events: string[] = [],
    private readonly error?: Error
  ) {}

  softDelete(userId: string, sessionId: string) {
    if (this.error) {
      throw this.error;
    }

    this.events.push(`soft-delete:${sessionId}`);
    this.calls.push({ sessionId, userId });
    return Promise.resolve();
  }
}

class FakePremiereTicketRepository implements StorageCleanupPremiereTicketRepository {
  readonly calls: Array<{ sessionId: string; userId: string }> = [];

  constructor(
    private readonly events: string[] = [],
    private readonly error?: Error
  ) {}

  releaseForDeletedSession(userId: string, sessionId: string) {
    this.calls.push({ sessionId, userId });

    if (this.error) {
      throw this.error;
    }

    this.events.push(`release-ticket:${sessionId}`);
    return Promise.resolve();
  }
}
