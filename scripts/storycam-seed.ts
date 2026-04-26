import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/server/db/types";
import { StoryCamArtifactRepository } from "../src/server/storycam/artifactRepository";
import { StoryCamGenerationJobRepository } from "../src/server/storycam/generationJobRepository";
import { StoryCamMediaAssetRepository } from "../src/server/storycam/mediaAssetRepository";
import { StoryCamProviderRequestRepository } from "../src/server/storycam/providerRequestRepository";
import { StoryCamSessionRepository } from "../src/server/storycam/sessionRepository";

type SeedResult = {
  generatedClipArtifactId: string;
  jobId: string;
  mediaAssetId: string;
  providerRequestId: string;
  scriptArtifactId: string;
  sessionId: string;
  userId: string;
};

loadDotEnvFile(".env.local");
loadDotEnvFile(".env");

async function main() {
  const userId = resolveSeedUserId(process.argv.slice(2), process.env);
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const result = await seedStoryCamSample(client, userId);

  console.log("StoryCam sample metadata seeded.");
  console.log(`user_id=${result.userId}`);
  console.log(`session_id=${result.sessionId}`);
  console.log(`script_artifact_id=${result.scriptArtifactId}`);
  console.log(`generated_clip_artifact_id=${result.generatedClipArtifactId}`);
  console.log(`job_id=${result.jobId}`);
  console.log(`media_asset_id=${result.mediaAssetId}`);
  console.log(`provider_request_id=${result.providerRequestId}`);
}

export async function seedStoryCamSample(client: DatabaseClient, userId: string): Promise<SeedResult> {
  const sessions = new StoryCamSessionRepository(client);
  const artifacts = new StoryCamArtifactRepository(client);
  const jobs = new StoryCamGenerationJobRepository(client);
  const mediaAssets = new StoryCamMediaAssetRepository(client);
  const providerRequests = new StoryCamProviderRequestRepository(client);

  const session = requireSeedRow(
    await sessions.create(userId, {
      coreGroupTargetCount: 1,
      generationMode: "mock",
      plannedDurationSeconds: 12,
      status: "draft"
    }),
    "session"
  );

  const scriptArtifact = requireSeedRow(
    await artifacts.createVersion(userId, {
      dataJson: {
        beats: ["private idea", "story world confirmation", "mock clip preview"],
        logline: "A private memory becomes a small cinematic proof of concept.",
        summary: "Seed data for exercising the StoryCam metadata path in mock mode.",
        title: "StoryCam Seed"
      },
      dependsOnJson: { input: 1 },
      sessionId: session.id,
      state: "ready",
      type: "script",
      version: 1
    }),
    "script artifact"
  );

  const job = requireSeedRow(
    await jobs.create(userId, {
      idempotencyKeyHash: hashSeedKey(userId, session.id, "mock-video-clip"),
      inputArtifactVersionsJson: { [scriptArtifact.id]: scriptArtifact.version },
      providerKind: "video",
      providerName: "mock",
      sessionId: session.id,
      status: "running",
      type: "video_clip"
    }),
    "generation job"
  );

  const providerRequest = requireSeedRow(
    await providerRequests.create(userId, {
      jobId: job.id,
      providerKind: "video",
      providerName: "mock",
      providerRequestId: `seed-${job.id}`,
      requestSummaryJson: {
        artifact_type: "generated_clip",
        mode: "mock",
        source: "storycam:seed"
      },
      status: "submitted"
    }),
    "provider request"
  );

  const mediaAsset = requireSeedRow(
    await mediaAssets.create(userId, {
      byteSize: 1024,
      kind: "mock_clip",
      mimeType: "video/mp4",
      sessionId: session.id,
      source: "mock",
      storageBucket: "storycam-mock",
      storagePath: buildSeedStoragePath(userId, session.id)
    }),
    "media asset"
  );

  const generatedClipArtifact = requireSeedRow(
    await artifacts.createVersion(userId, {
      dataJson: {
        coreGroupId: "seed-core-group",
        durationSeconds: 4,
        jobId: job.id,
        mediaAssetId: mediaAsset.id,
        providerName: "mock",
        reviewState: "pending"
      },
      dependsOnJson: { [scriptArtifact.id]: scriptArtifact.version },
      sessionId: session.id,
      state: "ready",
      type: "generated_clip",
      version: 1
    }),
    "generated clip artifact"
  );

  await jobs.markSucceeded(userId, job.id, {
    outputArtifactId: generatedClipArtifact.id
  });

  return {
    generatedClipArtifactId: generatedClipArtifact.id,
    jobId: job.id,
    mediaAssetId: mediaAsset.id,
    providerRequestId: providerRequest.id,
    scriptArtifactId: scriptArtifact.id,
    sessionId: session.id,
    userId
  };
}

export function buildSeedStoragePath(userId: string, sessionId: string) {
  return `users/${userId}/sessions/${sessionId}/mock/storycam-seed-clip.mp4`;
}

export function hashSeedKey(userId: string, sessionId: string, purpose: string) {
  return createHash("sha256").update(`storycam-seed:${userId}:${sessionId}:${purpose}`).digest("hex");
}

export function resolveSeedUserId(args: string[], env: NodeJS.ProcessEnv | { STORYCAM_SEED_USER_ID?: string }) {
  const inlineArg = args.find((arg) => arg.startsWith("--user-id="));
  const splitArgIndex = args.findIndex((arg) => arg === "--user-id");
  const userId =
    inlineArg?.slice("--user-id=".length) ??
    (splitArgIndex >= 0 ? args[splitArgIndex + 1] : undefined) ??
    env.STORYCAM_SEED_USER_ID;

  if (!userId) {
    throw new Error("Missing seed user id. Set STORYCAM_SEED_USER_ID or pass --user-id <auth.users.id>.");
  }

  return userId;
}

function loadDotEnvFile(fileName: string) {
  const filePath = resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());

    process.env[key] ??= value;
  }
}

function unquoteEnvValue(value: string) {
  const first = value.at(0);
  const last = value.at(-1);

  if ((first === `"` && last === `"`) || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }

  return value;
}

function requiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

type DatabaseClient = ConstructorParameters<typeof StoryCamSessionRepository>[0];

function requireSeedRow<T>(row: T | null, label: string): T {
  if (!row) {
    throw new Error(`StoryCam seed failed to create ${label}.`);
  }

  return row;
}

if (process.env.VITEST !== "true" && resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "StoryCam seed failed.");
    process.exit(1);
  });
}
