import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generatedClipSchema } from "@/features/storycam/domain/artifactSchemas";
import type { GeneratedClip } from "@/features/storycam/domain/artifacts";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type { ProviderFailure, ProviderResult, VideoGenerationProvider } from "@/lib/providers/types";
import type { Database } from "@/server/db/types";
import { StoryCamArtifactRepository } from "@/server/storycam/artifactRepository";
import { StoryCamGenerationJobRepository } from "@/server/storycam/generationJobRepository";
import { StoryCamMediaAssetRepository } from "@/server/storycam/mediaAssetRepository";
import {
  createStoryCamSignedUrl,
  storyCamMockBucket,
  storyCamSignedUrlTtlSeconds,
  uploadStoryCamObject
} from "@/server/storycam/mediaStore";

export type MockVideoScenario = "policy_refusal" | "provider_error" | "success" | "timeout";

export type MockVideoProviderConfig = {
  scenario?: MockVideoScenario;
  signedUrlExpiresIn?: number;
};

export type MockVideoGenerationInput = {
  clipPromptPacketId: string;
  coreGroupId: string;
  durationSeconds: number;
  expandedCardIds?: string[];
  idempotencyKey?: string;
  inputArtifactVersions?: Record<string, number>;
  sessionId: string;
  userId: string;
};

export type MockVideoGenerationOutput = {
  generatedClip: GeneratedClip;
  media: {
    bucket: typeof storyCamMockBucket;
    id: string;
    mimeType: "video/mp4";
    path: string;
    signedUrl: string;
    signedUrlExpiresIn: number;
  };
};

export function createMockVideoProvider(
  client: SupabaseClient<Database>,
  config: MockVideoProviderConfig = {}
): VideoGenerationProvider<MockVideoGenerationInput, MockVideoGenerationOutput> {
  return {
    providerKind: "video",
    providerName: "mock",
    async generateClip(input) {
      return generateMockVideoClip(client, input, config);
    }
  };
}

async function generateMockVideoClip(
  client: SupabaseClient<Database>,
  input: MockVideoGenerationInput,
  config: MockVideoProviderConfig
): Promise<ProviderResult<MockVideoGenerationOutput>> {
  const scenario = config.scenario ?? "success";

  if (scenario !== "success") {
    return mockVideoFailure(scenario);
  }

  const jobs = new StoryCamGenerationJobRepository(client);
  const mediaAssets = new StoryCamMediaAssetRepository(client);
  const artifacts = new StoryCamArtifactRepository(client);
  const idempotencyKeyHash = hashMockVideoIdempotencyKey(input);
  const job = await jobs.create(input.userId, {
    generationMode: "mock",
    idempotencyKeyHash,
    inputArtifactVersionsJson: input.inputArtifactVersions ?? {},
    providerKind: "video",
    providerName: "mock",
    sessionId: input.sessionId,
    status: "running",
    type: "video_clip"
  });

  if (!job) {
    return providerFailure(identity, new Error("Mock video job was not created."), {
      errorCode: "MOCK_VIDEO_JOB_FAILED",
      retryable: true
    });
  }

  const bytes = createMockMp4Bytes(input);
  const storagePath = buildMockVideoStoragePath(input.userId, input.sessionId, input.coreGroupId);

  await uploadStoryCamObject(client, storyCamMockBucket, storagePath, bytes, "video/mp4");

  const media = await mediaAssets.create(input.userId, {
    byteSize: bytes.byteLength,
    kind: "mock_clip",
    mimeType: "video/mp4",
    sessionId: input.sessionId,
    source: "mock",
    storageBucket: storyCamMockBucket,
    storagePath
  });

  if (!media) {
    return providerFailure(identity, new Error("Mock video media metadata was not created."), {
      errorCode: "MOCK_VIDEO_MEDIA_FAILED",
      retryable: true
    });
  }

  const generatedClip = generatedClipSchema.parse({
    clipPromptPacketId: input.clipPromptPacketId,
    coreGroupId: input.coreGroupId,
    durationSeconds: input.durationSeconds,
    id: `generated-clip-${input.coreGroupId}`,
    jobId: job.id,
    mediaAssetId: media.id,
    providerName: "mock",
    reviewState: "pending",
    sessionId: input.sessionId,
    state: "ready",
    version: 1
  });
  const artifact = await artifacts.createVersion(input.userId, {
    dataJson: generatedClip,
    dependsOnJson: input.inputArtifactVersions ?? {},
    sessionId: input.sessionId,
    state: "ready",
    type: "generated_clip",
    version: 1
  });

  if (!artifact) {
    return providerFailure(identity, new Error("Mock video generated clip artifact was not created."), {
      errorCode: "MOCK_VIDEO_ARTIFACT_FAILED",
      retryable: true
    });
  }

  await jobs.markSucceeded(input.userId, job.id, {
    outputArtifactId: artifact.id
  });

  const signedUrlExpiresIn = config.signedUrlExpiresIn ?? storyCamSignedUrlTtlSeconds;
  const signedUrl = await createStoryCamSignedUrl(client, storyCamMockBucket, storagePath, signedUrlExpiresIn);

  return providerSuccess(identity, {
    generatedClip,
    media: {
      bucket: storyCamMockBucket,
      id: media.id,
      mimeType: "video/mp4",
      path: storagePath,
      signedUrl,
      signedUrlExpiresIn
    }
  });
}

const identity = {
  providerKind: "video",
  providerName: "mock"
} as const;

function mockVideoFailure(scenario: Exclude<MockVideoScenario, "success">): ProviderFailure {
  const errorCodeByScenario = {
    policy_refusal: "MOCK_VIDEO_POLICY_REFUSAL",
    provider_error: "MOCK_VIDEO_PROVIDER_ERROR",
    timeout: "MOCK_VIDEO_TIMEOUT"
  } as const;

  return providerFailure(identity, new Error(`Mock video scenario: ${scenario}`), {
    errorCode: errorCodeByScenario[scenario],
    retryable: scenario !== "policy_refusal"
  });
}

function hashMockVideoIdempotencyKey(input: MockVideoGenerationInput) {
  const raw = input.idempotencyKey ?? `${input.userId}:${input.sessionId}:${input.coreGroupId}:${input.clipPromptPacketId}`;

  return createHash("sha256").update(raw).digest("hex");
}

function buildMockVideoStoragePath(userId: string, sessionId: string, coreGroupId: string) {
  return `users/${sanitizePathSegment(userId)}/sessions/${sanitizePathSegment(sessionId)}/mock/clips/${sanitizePathSegment(
    coreGroupId
  )}-${randomUUID()}.mp4`;
}

function createMockMp4Bytes(input: MockVideoGenerationInput) {
  return new TextEncoder().encode(
    `storycam-mock-mp4\ncoreGroup=${input.coreGroupId}\nduration=${input.durationSeconds}\n`
  );
}

function sanitizePathSegment(segment: string) {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "_");
}
