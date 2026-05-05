import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateImage, generateObject } from "ai";
import { z } from "zod";
import { createOpenRouterFetch } from "../src/server/ai/openrouterProxyFetch";

const smokeOutputDir = ".temp/storycam-smoke";
const defaultTextPrompt = "为一个普通用户的私人记忆预告片生成一个极短中文片名和一句故事基调：雨夜便利店窗边，女孩停下未发送的短信。";
const defaultImagePrompt = "cinematic storyboard keyframe, rainy convenience store window at night, a warm desk lamp reflecting on glass, handwritten postcard, realistic film still";

const textSmokeSchema = z.object({
  mood: z.string().min(1),
  title: z.string().min(1)
});

loadDotEnvFile(".env.local");
loadDotEnvFile(".env");

async function main() {
  if (process.env.STORYCAM_RUN_REAL_SMOKE !== "1") {
    console.log("Skipped OpenRouter smoke. Set STORYCAM_RUN_REAL_SMOKE=1 to call the real provider.");
    return;
  }

  const apiKey = requiredEnv("OPENROUTER_API_KEY");
  const proxiedFetch = createOpenRouterFetch();
  const openrouter = createOpenRouter({
    apiKey,
    appName: "StoryCam",
    appUrl: "https://storycam.local",
    ...(proxiedFetch ? { fetch: proxiedFetch } : {})
  });

  const textModel = requiredEnv("OPENROUTER_TEXT_MODEL");
  const textResult = await generateObject({
    model: openrouter.chat(textModel),
    prompt: process.env.OPENROUTER_SMOKE_TEXT_PROMPT ?? defaultTextPrompt,
    schema: textSmokeSchema,
    system: "Return only the requested structured StoryCam smoke output.",
    temperature: numberEnv("OPENROUTER_SMOKE_TEXT_TEMPERATURE", 0.4)
  });

  console.log("OpenRouter text smoke succeeded.");
  console.log(`text_model=${textModel}`);
  console.log(`title=${textResult.object.title}`);
  console.log(`mood=${textResult.object.mood}`);

  if (process.env.OPENROUTER_SMOKE_SKIP_IMAGE === "1") {
    console.log("Skipped OpenRouter image smoke because OPENROUTER_SMOKE_SKIP_IMAGE=1.");
    return;
  }

  const imageModel = requiredEnv("OPENROUTER_IMAGE_MODEL");
  const imageResult = await generateImage({
    aspectRatio: ratioEnv(),
    model: openrouter.imageModel(imageModel),
    prompt: process.env.OPENROUTER_SMOKE_IMAGE_PROMPT ?? defaultImagePrompt,
    size: sizeEnv()
  });

  if (!imageResult.image || imageResult.image.uint8Array.byteLength === 0) {
    throw new Error("OpenRouter image smoke returned no image bytes.");
  }

  const outputPath = await writeImageOutput(imageResult.image.mediaType, imageResult.image.uint8Array);

  console.log("OpenRouter image smoke succeeded.");
  console.log(`image_model=${imageModel}`);
  console.log(`image_mime_type=${imageResult.image.mediaType}`);
  console.log(`image_output=${outputPath}`);
}

async function writeImageOutput(mediaType: string, bytes: Uint8Array) {
  const extension = imageExtension(mediaType);
  const outputDir = resolve(process.cwd(), smokeOutputDir);
  const outputPath = join(outputDir, `openrouter-storyboard-smoke.${extension}`);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, bytes);

  return outputPath;
}

function imageExtension(mediaType: string) {
  if (mediaType === "image/jpeg") {
    return "jpg";
  }

  if (mediaType === "image/webp") {
    return "webp";
  }

  if (mediaType !== "image/png") {
    throw new Error(`Unsupported OpenRouter smoke image media type: ${mediaType}`);
  }

  return "png";
}

function ratioEnv() {
  const value = process.env.OPENROUTER_SMOKE_IMAGE_ASPECT_RATIO;

  if (!value) {
    return "16:9";
  }

  if (/^\d+:\d+$/.test(value)) {
    return value as `${number}:${number}`;
  }

  throw new Error("OPENROUTER_SMOKE_IMAGE_ASPECT_RATIO must look like 16:9.");
}

function sizeEnv() {
  const value = process.env.OPENROUTER_SMOKE_IMAGE_SIZE;

  if (!value) {
    return undefined;
  }

  if (/^\d+x\d+$/.test(value)) {
    return value as `${number}x${number}`;
  }

  throw new Error("OPENROUTER_SMOKE_IMAGE_SIZE must look like 1024x576.");
}

function numberEnv(key: string, fallback: number) {
  const raw = process.env[key];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a number.`);
  }

  return value;
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
  console.error(error instanceof Error ? error.message : "OpenRouter smoke failed.");
  process.exit(1);
});
