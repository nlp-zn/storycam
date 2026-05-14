import { discoveryEntries } from "@/features/storycam/domain/shellContent";
import {
  createStoryCamSignedUrl,
  storyCamGeneratedBucket,
  storyCamSignedUrlTtlSeconds,
  type SignedUrlStorageClient
} from "./mediaStore";

export type DiscoverySampleSignedAsset = {
  id: string;
  posterUrl: string;
  signedUrlExpiresIn: number;
  videoUrl: string;
};

const discoverySampleStorageAssets = {
  "sample-01": {
    posterPath: "samples/discovery/storycam-sample-01.jpg",
    videoPath: "samples/discovery/storycam-sample-01.mp4"
  },
  "sample-02": {
    posterPath: "samples/discovery/storycam-sample-02.jpg",
    videoPath: "samples/discovery/storycam-sample-02.mp4"
  },
  "sample-03": {
    posterPath: "samples/discovery/storycam-sample-03.jpg",
    videoPath: "samples/discovery/storycam-sample-03.mp4"
  },
  "sample-04": {
    posterPath: "samples/discovery/storycam-sample-04.jpg",
    videoPath: "samples/discovery/storycam-sample-04.mp4"
  },
  "sample-05": {
    posterPath: "samples/discovery/storycam-sample-05.jpg",
    videoPath: "samples/discovery/storycam-sample-05.mp4"
  },
  "sample-06": {
    posterPath: "samples/discovery/storycam-sample-06.jpg",
    videoPath: "samples/discovery/storycam-sample-06.mp4"
  },
  "sample-07": {
    posterPath: "samples/discovery/storycam-sample-07.jpg",
    videoPath: "samples/discovery/storycam-sample-07.mp4"
  },
  "sample-08": {
    posterPath: "samples/discovery/storycam-sample-08.jpg",
    videoPath: "samples/discovery/storycam-sample-08.mp4"
  }
} as const;

export async function createDiscoverySampleSignedAssets(
  client: SignedUrlStorageClient,
  expiresIn = storyCamSignedUrlTtlSeconds
) {
  const assets: DiscoverySampleSignedAsset[] = [];
  const unavailableIds: string[] = [];

  for (const entry of discoveryEntries) {
    if (entry.kind !== "sample") {
      continue;
    }

    const storageAsset = discoverySampleStorageAssets[entry.id as keyof typeof discoverySampleStorageAssets];

    if (!storageAsset) {
      unavailableIds.push(entry.id);
      continue;
    }

    try {
      const [posterUrl, videoUrl] = await Promise.all([
        createStoryCamSignedUrl(client, storyCamGeneratedBucket, storageAsset.posterPath, expiresIn),
        createStoryCamSignedUrl(client, storyCamGeneratedBucket, storageAsset.videoPath, expiresIn)
      ]);

      assets.push({
        id: entry.id,
        posterUrl,
        signedUrlExpiresIn: expiresIn,
        videoUrl
      });
    } catch {
      unavailableIds.push(entry.id);
    }
  }

  return {
    assets,
    signedUrlExpiresIn: expiresIn,
    unavailableIds
  };
}

