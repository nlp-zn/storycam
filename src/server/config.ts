import { spawnSync } from "node:child_process";
import type { StoryCamVideoModel } from "@/features/storycam/domain/videoSettings";

export type GenerationMode = "mock" | "real";
export type TextProvider = "deepseek" | "mock" | "openrouter";
export type StoryWorldTextProvider = TextProvider;
export type StoryboardTextProvider = "mock" | "openrouter";
export type MultimodalProvider = "mock" | "openrouter";
export type ImageProvider = "inference_sh" | "mock" | "openrouter";
export type VideoProvider = "mock" | "seedance_2_0";
export type FinalWorkProvider = "mock" | "ffmpeg";

type Env = Record<string, string | undefined>;

type ConfigIssueCode =
  | "INVALID_ENV"
  | "INVALID_URL"
  | "INVALID_PROVIDER_FOR_MODE"
  | "MISSING_RUNTIME"
  | "MISSING_ENV";

type ConfigIssue = {
  code: ConfigIssueCode;
  variable: string;
  message: string;
};

export type RedactedConfigError = {
  code: "STORYCAM_CONFIG_INVALID";
  message: string;
  retryable: false;
  redactionApplied: true;
  issues: ConfigIssue[];
};

export type StoryCamConfig = {
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  media: {
    providerReferenceSignedUrlTtlSeconds: number;
  };
  generation: {
    mode: GenerationMode;
    textProvider: TextProvider;
    storyWorldTextProvider?: StoryWorldTextProvider;
    storyboardTextProvider?: StoryboardTextProvider;
    multimodalProvider: MultimodalProvider;
    imageProvider: ImageProvider;
    videoProvider: VideoProvider;
    finalWorkProvider: FinalWorkProvider;
  };
  quotas?: {
    dailyFinalWorkJobLimit: number;
    dailyImageJobLimit: number;
    dailyVideoJobLimit: number;
  };
  openrouter?: {
    apiKey: string;
    textFallbackModels?: string[];
    textModel?: string;
    multimodalModel?: string;
    imageModel?: string;
  };
  deepseek?: {
    apiKey: string;
    textBaseUrl: string;
    textFallbackModels?: string[];
    textModel: string;
  };
  inferenceSh?: {
    apiKey: string;
    imageApp: string;
  };
  seedance?: {
    apiKey: string;
    models: Record<StoryCamVideoModel, string>;
  };
};

export class StoryCamConfigError extends Error {
  readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[]) {
    super(formatIssueSummary(issues));
    this.name = "StoryCamConfigError";
    this.issues = issues;
  }
}

const defaultProviders = {
  STORYCAM_GENERATION_MODE: "mock",
  STORYCAM_TEXT_PROVIDER: "mock",
  STORYCAM_STORY_WORLD_TEXT_PROVIDER: undefined,
  STORYCAM_STORYBOARD_TEXT_PROVIDER: undefined,
  STORYCAM_MULTIMODAL_PROVIDER: "mock",
  STORYCAM_IMAGE_PROVIDER: "mock",
  STORYCAM_VIDEO_PROVIDER: "mock",
  STORYCAM_FINAL_WORK_PROVIDER: "mock"
} as const;

let ffmpegReadyCache: boolean | undefined;

export function loadStoryCamConfig(env: Env = process.env): StoryCamConfig {
  const issues: ConfigIssue[] = [];

  const supabaseUrl = required(env, "NEXT_PUBLIC_SUPABASE_URL", issues);
  const supabaseAnonKey = required(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY", issues);
  const supabaseServiceRoleKey = required(env, "SUPABASE_SERVICE_ROLE_KEY", issues);

  if (supabaseUrl && !isValidUrl(supabaseUrl)) {
    issues.push({
      code: "INVALID_URL",
      variable: "NEXT_PUBLIC_SUPABASE_URL",
      message: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL."
    });
  }

  const mode = enumValue<GenerationMode>(
    env,
    "STORYCAM_GENERATION_MODE",
    ["mock", "real"],
    defaultProviders.STORYCAM_GENERATION_MODE,
    issues
  );
  const textProvider = enumValue<TextProvider>(
    env,
    "STORYCAM_TEXT_PROVIDER",
    ["mock", "openrouter", "deepseek"],
    defaultProviders.STORYCAM_TEXT_PROVIDER,
    issues
  );
  const storyWorldTextProvider = enumValue<StoryWorldTextProvider>(
    env,
    "STORYCAM_STORY_WORLD_TEXT_PROVIDER",
    ["mock", "openrouter", "deepseek"],
    textProvider,
    issues
  );
  const storyboardTextProvider = enumValue<StoryboardTextProvider>(
    env,
    "STORYCAM_STORYBOARD_TEXT_PROVIDER",
    ["mock", "openrouter"],
    textProvider === "openrouter" ? "openrouter" : "mock",
    issues
  );
  const multimodalProvider = enumValue<MultimodalProvider>(
    env,
    "STORYCAM_MULTIMODAL_PROVIDER",
    ["mock", "openrouter"],
    defaultProviders.STORYCAM_MULTIMODAL_PROVIDER,
    issues
  );
  const imageProvider = enumValue<ImageProvider>(
    env,
    "STORYCAM_IMAGE_PROVIDER",
    ["mock", "openrouter", "inference_sh"],
    defaultProviders.STORYCAM_IMAGE_PROVIDER,
    issues
  );
  const videoProvider = enumValue<VideoProvider>(
    env,
    "STORYCAM_VIDEO_PROVIDER",
    ["mock", "seedance_2_0"],
    defaultProviders.STORYCAM_VIDEO_PROVIDER,
    issues
  );
  const finalWorkProvider = enumValue<FinalWorkProvider>(
    env,
    "STORYCAM_FINAL_WORK_PROVIDER",
    ["mock", "ffmpeg"],
    defaultProviders.STORYCAM_FINAL_WORK_PROVIDER,
    issues
  );

  if (mode === "mock") {
    rejectNonMockProvider("STORYCAM_MULTIMODAL_PROVIDER", multimodalProvider, issues);
    rejectNonMockProvider("STORYCAM_VIDEO_PROVIDER", videoProvider, issues);
    rejectNonMockProvider("STORYCAM_FINAL_WORK_PROVIDER", finalWorkProvider, issues);
  }

  if (mode === "real") {
    rejectMockProductionProvider("STORYCAM_STORY_WORLD_TEXT_PROVIDER", storyWorldTextProvider, issues);
    rejectMockProductionProvider("STORYCAM_STORYBOARD_TEXT_PROVIDER", storyboardTextProvider, issues);
    rejectMockProductionProvider("STORYCAM_MULTIMODAL_PROVIDER", multimodalProvider, issues);
    rejectNonProviderValue("STORYCAM_IMAGE_PROVIDER", imageProvider, "inference_sh", issues);
    rejectNonProviderValue("STORYCAM_VIDEO_PROVIDER", videoProvider, "seedance_2_0", issues);
    rejectNonProviderValue("STORYCAM_FINAL_WORK_PROVIDER", finalWorkProvider, "ffmpeg", issues);
    if (finalWorkProvider === "ffmpeg" && !isFfmpegRuntimeReady()) {
      issues.push({
        code: "MISSING_RUNTIME",
        variable: "STORYCAM_FINAL_WORK_PROVIDER",
        message: "ffmpeg must be available at runtime when STORYCAM_GENERATION_MODE=real."
      });
    }
  }

  const needsRequiredOpenRouter =
    storyWorldTextProvider === "openrouter" || storyboardTextProvider === "openrouter" || multimodalProvider === "openrouter";
  const needsOpenRouter = needsRequiredOpenRouter || imageProvider === "openrouter";
  const openrouterApiKey = needsRequiredOpenRouter
    ? required(env, "OPENROUTER_API_KEY", issues)
    : optional(env, "OPENROUTER_API_KEY");
  const openrouterTextModel = storyWorldTextProvider === "openrouter" || storyboardTextProvider === "openrouter"
    ? required(env, "OPENROUTER_TEXT_MODEL", issues)
    : undefined;
  const openrouterTextFallbackModels = storyWorldTextProvider === "openrouter" || storyboardTextProvider === "openrouter"
    ? optionalCsv(env, "OPENROUTER_TEXT_FALLBACK_MODELS")
    : [];
  const openrouterMultimodalModel = multimodalProvider === "openrouter"
    ? required(env, "OPENROUTER_MULTIMODAL_MODEL", issues)
    : undefined;
  const openrouterImageModel = imageProvider === "openrouter" ? optional(env, "OPENROUTER_IMAGE_MODEL") : undefined;

  const needsDeepSeek = storyWorldTextProvider === "deepseek";
  const deepseekApiKey = needsDeepSeek ? required(env, "DEEPSEEK_API_KEY", issues) : optional(env, "DEEPSEEK_API_KEY");
  const deepseekTextModel = needsDeepSeek
    ? optional(env, "DEEPSEEK_TEXT_MODEL") ?? "deepseek-v4-pro"
    : undefined;
  const deepseekTextBaseUrl = needsDeepSeek
    ? optional(env, "DEEPSEEK_TEXT_BASE_URL") ?? "https://api.deepseek.com/beta"
    : undefined;
  const deepseekTextFallbackModels = needsDeepSeek ? optionalCsv(env, "DEEPSEEK_TEXT_FALLBACK_MODELS") : [];

  const needsInferenceSh = imageProvider === "inference_sh";
  const inferenceShApiKey = needsInferenceSh && mode === "real" ? required(env, "INFERENCE_API_KEY", issues) : needsInferenceSh ? optional(env, "INFERENCE_API_KEY") : undefined;
  const inferenceShImageApp = needsInferenceSh && mode === "real" ? required(env, "INFERENCE_IMAGE_APP", issues) : needsInferenceSh ? optional(env, "INFERENCE_IMAGE_APP") : undefined;

  const needsSeedance = videoProvider === "seedance_2_0";
  const seedanceApiKey = needsSeedance ? required(env, "SEEDANCE_API_KEY", issues) : undefined;
  const seedanceModel = needsSeedance ? required(env, "SEEDANCE_MODEL", issues) : undefined;
  const seedanceFastModel = needsSeedance
    ? optional(env, "SEEDANCE_FAST_MODEL") ?? "doubao-seedance-2-0-fast-260128"
    : undefined;
  const providerReferenceSignedUrlTtlSeconds = optionalPositiveInteger(
    env,
    "STORYCAM_PROVIDER_REFERENCE_URL_TTL_SECONDS",
    3600,
    issues
  );
  const dailyImageJobLimit = optionalPositiveInteger(env, "STORYCAM_DAILY_IMAGE_JOB_LIMIT", 30, issues);
  const dailyVideoJobLimit = optionalPositiveInteger(env, "STORYCAM_DAILY_VIDEO_JOB_LIMIT", 5, issues);
  const dailyFinalWorkJobLimit = optionalPositiveInteger(env, "STORYCAM_DAILY_FINAL_WORK_JOB_LIMIT", 5, issues);

  if (issues.length > 0) {
    throw new StoryCamConfigError(issues);
  }

  const openrouter = needsOpenRouter
    ? {
        apiKey: openrouterApiKey ?? "",
        ...(openrouterTextFallbackModels.length ? { textFallbackModels: openrouterTextFallbackModels } : {}),
        ...(openrouterTextModel ? { textModel: openrouterTextModel } : {}),
        ...(openrouterMultimodalModel ? { multimodalModel: openrouterMultimodalModel } : {}),
        ...(openrouterImageModel ? { imageModel: openrouterImageModel } : {})
      }
    : undefined;
  const seedance = seedanceApiKey && seedanceModel && seedanceFastModel
    ? {
        apiKey: seedanceApiKey,
        models: {
          seedance_2_0: seedanceModel,
          seedance_2_0_fast: seedanceFastModel
        }
      }
    : undefined;
  const deepseek = needsDeepSeek && deepseekApiKey && deepseekTextModel && deepseekTextBaseUrl
    ? {
        apiKey: deepseekApiKey,
        textBaseUrl: deepseekTextBaseUrl,
        ...(deepseekTextFallbackModels.length ? { textFallbackModels: deepseekTextFallbackModels } : {}),
        textModel: deepseekTextModel
      }
    : undefined;
  const inferenceSh = inferenceShApiKey && inferenceShImageApp
    ? { apiKey: inferenceShApiKey, imageApp: inferenceShImageApp }
    : undefined;

  return {
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: supabaseServiceRoleKey
    },
    media: {
      providerReferenceSignedUrlTtlSeconds
    },
    generation: {
      mode,
      textProvider,
      storyWorldTextProvider,
      storyboardTextProvider,
      multimodalProvider,
      imageProvider,
      videoProvider,
      finalWorkProvider
    },
    quotas: {
      dailyFinalWorkJobLimit,
      dailyImageJobLimit,
      dailyVideoJobLimit
    },
    ...(openrouter ? { openrouter } : {}),
    ...(deepseek ? { deepseek } : {}),
    ...(inferenceSh ? { inferenceSh } : {}),
    ...(seedance ? { seedance } : {})
  };
}

export function redactConfigError(error: unknown): RedactedConfigError {
  if (error instanceof StoryCamConfigError) {
    return {
      code: "STORYCAM_CONFIG_INVALID",
      message: error.message,
      retryable: false,
      redactionApplied: true,
      issues: error.issues
    };
  }

  return {
    code: "STORYCAM_CONFIG_INVALID",
    message: "StoryCam configuration is invalid.",
    retryable: false,
    redactionApplied: true,
    issues: []
  };
}

function required(env: Env, variable: string, issues: ConfigIssue[]): string {
  const value = env[variable]?.trim();
  if (!value) {
    issues.push({
      code: "MISSING_ENV",
      variable,
      message: `${variable} is required.`
    });
  }
  return value ?? "";
}

function optional(env: Env, variable: string): string | undefined {
  return env[variable]?.trim() || undefined;
}

function enumValue<T extends string>(
  env: Env,
  variable: string,
  allowed: readonly T[],
  fallback: T,
  issues: ConfigIssue[]
): T {
  const value = (env[variable]?.trim() || fallback) as T;
  if (!allowed.includes(value)) {
    issues.push({
      code: "INVALID_ENV",
      variable,
      message: `${variable} must be one of: ${allowed.join(", ")}.`
    });
    return fallback;
  }
  return value;
}

function rejectNonMockProvider(variable: string, value: string, issues: ConfigIssue[]) {
  if (value !== "mock") {
    issues.push({
      code: "INVALID_PROVIDER_FOR_MODE",
      variable,
      message: `${variable} must be mock when STORYCAM_GENERATION_MODE=mock.`
    });
  }
}

function rejectMockProductionProvider(variable: string, value: string, issues: ConfigIssue[]) {
  if (value === "mock") {
    issues.push({
      code: "INVALID_PROVIDER_FOR_MODE",
      variable,
      message: `${variable} must not be mock when STORYCAM_GENERATION_MODE=real.`
    });
  }
}

function rejectNonProviderValue(variable: string, value: string, expected: string, issues: ConfigIssue[]) {
  if (value !== expected) {
    issues.push({
      code: "INVALID_PROVIDER_FOR_MODE",
      variable,
      message: `${variable} must be ${expected} when STORYCAM_GENERATION_MODE=real.`
    });
  }
}

function optionalCsv(env: Env, variable: string) {
  return (env[variable] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function optionalPositiveInteger(env: Env, variable: string, fallback: number, issues: ConfigIssue[]) {
  const rawValue = env[variable]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    issues.push({
      code: "INVALID_ENV",
      variable,
      message: `${variable} must be a positive integer.`
    });
    return fallback;
  }

  return value;
}

function isFfmpegRuntimeReady() {
  ffmpegReadyCache ??= spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

  return ffmpegReadyCache;
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function formatIssueSummary(issues: ConfigIssue[]) {
  const summary = issues.map((issue) => `${issue.code}:${issue.variable}`).join("; ");
  return `StoryCam configuration is invalid: ${summary}`;
}
