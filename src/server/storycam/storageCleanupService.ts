import type { MediaAssetRow } from "@/server/db/types";
import { assertStoryCamPrivateBucket, type StoryCamPrivateBucket } from "./mediaStore";
import { StoryCamMediaAssetRepository } from "./mediaAssetRepository";
import { StoryCamSessionRepository } from "./sessionRepository";
import type { StoryCamDbClient } from "./sessionRepository";

export type StorageCleanupSummary = {
  bucketsTouched: StoryCamPrivateBucket[];
  removedObjectCount: number;
  skippedObjectCount: number;
};

export type StorageCleanupRepository = {
  listBySession(userId: string, sessionId: string): Promise<MediaAssetRow[] | null>;
};

export type StorageCleanupSessionRepository = {
  softDelete(userId: string, sessionId: string): Promise<void>;
};

export type StorageCleanupClient = {
  storage: {
    from(bucket: StoryCamPrivateBucket): {
      remove(paths: string[]): Promise<{
        data: unknown;
        error: { message?: string } | null;
      }>;
    };
  };
};

export class StoryCamStorageCleanupError extends Error {
  constructor(readonly code: "remove_failed") {
    super(`StoryCam storage cleanup failed: ${code}`);
    this.name = "StoryCamStorageCleanupError";
  }
}

export class StoryCamStorageCleanupService {
  constructor(
    private readonly storageClient: StorageCleanupClient,
    private readonly mediaRepository: StorageCleanupRepository
  ) {}

  static fromSupabaseClient(client: StoryCamDbClient & StorageCleanupClient) {
    return new StoryCamStorageCleanupService(client, new StoryCamMediaAssetRepository(client));
  }

  async removeSessionMedia(userId: string, sessionId: string): Promise<StorageCleanupSummary> {
    const mediaRows = (await this.mediaRepository.listBySession(userId, sessionId)) ?? [];
    const { pathsByBucket, skippedObjectCount } = groupPrivateStoragePaths(mediaRows);

    let removedObjectCount = 0;
    const bucketsTouched: StoryCamPrivateBucket[] = [];

    for (const [bucket, paths] of pathsByBucket.entries()) {
      if (paths.length === 0) {
        continue;
      }

      const { error } = await this.storageClient.storage.from(bucket).remove(paths);

      if (error) {
        throw new StoryCamStorageCleanupError("remove_failed");
      }

      bucketsTouched.push(bucket);
      removedObjectCount += paths.length;
    }

    return {
      bucketsTouched,
      removedObjectCount,
      skippedObjectCount
    };
  }
}

export class StoryCamSessionDeletionService {
  constructor(
    private readonly storageCleanup: StoryCamStorageCleanupService,
    private readonly sessions: StorageCleanupSessionRepository
  ) {}

  static fromSupabaseClient(client: StoryCamDbClient & StorageCleanupClient) {
    return new StoryCamSessionDeletionService(
      StoryCamStorageCleanupService.fromSupabaseClient(client),
      new StoryCamSessionRepository(client)
    );
  }

  async deleteSession(userId: string, sessionId: string) {
    const cleanupSummary = await this.storageCleanup.removeSessionMedia(userId, sessionId);

    await this.sessions.softDelete(userId, sessionId);

    return cleanupSummary;
  }
}

function groupPrivateStoragePaths(mediaRows: MediaAssetRow[]) {
  const pathsByBucket = new Map<StoryCamPrivateBucket, Set<string>>();
  let skippedObjectCount = 0;

  for (const row of mediaRows) {
    const bucket = toStoryCamPrivateBucket(row.storage_bucket);

    if (!bucket || !row.storage_path) {
      skippedObjectCount += 1;
      continue;
    }

    const paths = pathsByBucket.get(bucket) ?? new Set<string>();
    paths.add(row.storage_path);
    pathsByBucket.set(bucket, paths);
  }

  return {
    pathsByBucket: new Map([...pathsByBucket.entries()].map(([bucket, paths]) => [bucket, [...paths]])),
    skippedObjectCount
  };
}

function toStoryCamPrivateBucket(bucket: string) {
  try {
    assertStoryCamPrivateBucket(bucket);
    return bucket;
  } catch {
    return null;
  }
}
