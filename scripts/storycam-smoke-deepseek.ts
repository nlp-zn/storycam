import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDeepSeekStoryWorldProvider } from "../src/lib/providers/deepseek/storyWorldProvider";

const defaultSmokeIdea = "雨夜便利店窗边，女孩停下未发送的短信。";

loadDotEnvFile(".env.local");
loadDotEnvFile(".env");

async function main() {
  if (process.env.STORYCAM_RUN_REAL_SMOKE !== "1") {
    console.log("Skipped DeepSeek smoke. Set STORYCAM_RUN_REAL_SMOKE=1 to call the real provider.");
    return;
  }

  const model = process.env.DEEPSEEK_TEXT_MODEL || "deepseek-v4-pro";
  const fallbackModels = optionalCsv("DEEPSEEK_TEXT_FALLBACK_MODELS");
  const provider = createDeepSeekStoryWorldProvider({
    apiKey: requiredEnv("DEEPSEEK_API_KEY"),
    baseUrl: process.env.DEEPSEEK_TEXT_BASE_URL || "https://api.deepseek.com/beta",
    fallbackModels,
    model
  });
  const result = await provider.generate({
    idea: process.env.DEEPSEEK_SMOKE_TEXT_PROMPT ?? defaultSmokeIdea,
    lightweightChoices: ["像私人回忆", "少说话"],
    sessionId: "deepseek-smoke-session"
  });

  if (!result.ok) {
    console.log("DeepSeek story-world smoke failed.");
    console.log(`error_code=${result.errorCode}`);
    console.log(`retryable=${result.retryable}`);
    process.exitCode = 1;
    return;
  }

  console.log("DeepSeek story-world smoke succeeded.");
  console.log(`text_provider=${provider.providerName}`);
  console.log(`text_model=${model}`);
  console.log(`title=${result.value.script.title}`);
  console.log(`character_count=${result.value.characterAssets.length}`);
  console.log(`scene_count=${result.value.sceneAssets.length}`);
}

function requiredEnv(key: string) {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required for DeepSeek smoke.`);
  }

  return value;
}

function optionalCsv(key: string) {
  return (process.env[key] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
