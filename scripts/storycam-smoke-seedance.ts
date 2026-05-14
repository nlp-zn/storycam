import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createSeedanceVideoProvider } from "../src/lib/providers/seedance/videoProvider";

const smokeOutputDir = ".temp/storycam-smoke";
const defaultPrompt = "静物电影镜头：雨夜窗边一只旧台灯照亮手写明信片，镜头缓慢推近，温暖胶片质感。";
const defaultSeedanceFastModel = "doubao-seedance-2-0-fast-260128";

loadDotEnvFile(".env.local");
loadDotEnvFile(".env");

async function main() {
  if (process.env.STORYCAM_RUN_REAL_SMOKE !== "1") {
    console.log("Skipped Seedance smoke. Set STORYCAM_RUN_REAL_SMOKE=1 to call the real provider.");
    return;
  }

  const apiKey = requiredEnv("SEEDANCE_API_KEY");
  const providerName = providerNameEnv();
  const model = providerName === "seedance_2_0_fast" ? process.env.SEEDANCE_FAST_MODEL ?? defaultSeedanceFastModel : requiredEnv("SEEDANCE_MODEL");
  const provider = createSeedanceVideoProvider({
    apiKey,
    ...(process.env.SEEDANCE_BASE_URL ? { baseUrl: process.env.SEEDANCE_BASE_URL } : {}),
    model,
    providerName,
    polling: {
      enabled: true,
      intervalMs: numberEnv("SEEDANCE_SMOKE_POLL_INTERVAL_MS", 10_000),
      maxAttempts: numberEnv("SEEDANCE_SMOKE_MAX_ATTEMPTS", 60)
    }
  });

  const result = await provider.generateClip({
    durationSeconds: numberEnv("SEEDANCE_SMOKE_DURATION_SECONDS", 5),
    generateAudio: process.env.SEEDANCE_SMOKE_GENERATE_AUDIO === "1",
    prompt: process.env.SEEDANCE_SMOKE_PROMPT ?? defaultPrompt,
    ratio: ratioEnv()
  });

  if (!result.ok) {
    throw new Error(`Seedance smoke failed: ${result.errorCode}`);
  }

  console.log("Seedance smoke succeeded.");
  console.log(`provider_name=${providerName}`);
  console.log(`provider_request_id=${result.value.providerRequestId}`);
  console.log(`model=${result.value.model}`);
  console.log(`status=${result.value.status}`);

  if (result.value.seed !== undefined) {
    console.log(`seed=${result.value.seed}`);
  }

  if (!result.value.videoUrl) {
    console.log("Seedance task completed without a downloadable video URL.");
    return;
  }

  const outputPath = await downloadVideo(result.value.videoUrl, result.value.providerRequestId);

  console.log(`downloaded_video=${outputPath}`);
}

async function downloadVideo(videoUrl: string, providerRequestId: string) {
  const response = await fetch(videoUrl);

  if (!response.ok) {
    throw new Error(`Seedance smoke video download failed with HTTP ${response.status}.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const outputDir = resolve(process.cwd(), smokeOutputDir);
  const outputPath = join(outputDir, `${safeFileName(providerRequestId)}.mp4`);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, bytes);

  return outputPath;
}

function ratioEnv() {
  const value = process.env.SEEDANCE_SMOKE_RATIO;

  if (!value) {
    return "16:9";
  }

  if (value === "16:9" || value === "9:16" || value === "1:1" || value === "4:3" || value === "3:4" || value === "adaptive") {
    return value;
  }

  throw new Error("SEEDANCE_SMOKE_RATIO must be one of 16:9, 9:16, 1:1, 4:3, 3:4, adaptive.");
}

function providerNameEnv() {
  const value = process.env.SEEDANCE_SMOKE_PROVIDER;

  if (!value) {
    return process.env.SEEDANCE_SMOKE_FAST === "1" ? "seedance_2_0_fast" : "seedance_2_0";
  }

  if (value === "seedance_2_0" || value === "seedance_2_0_fast") {
    return value;
  }

  throw new Error("SEEDANCE_SMOKE_PROVIDER must be seedance_2_0 or seedance_2_0_fast.");
}

function numberEnv(key: string, fallback: number) {
  const raw = process.env[key];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be a positive number.`);
  }

  return value;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "seedance-smoke";
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seedance smoke failed.");
  process.exit(1);
});
