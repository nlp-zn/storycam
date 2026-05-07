import { createHash } from "node:crypto";

export const redactedValue = "[redacted]" as const;

export type RedactedProviderError = {
  errorCode: string;
  providerErrorCategory?: string;
  providerHttpStatus?: number;
  redactedError: string;
  retryable: boolean;
  redactionApplied: true;
};

const sensitiveContentKeys = new Set([
  "input",
  "privateInput",
  "script",
  "prompt",
  "rawPrompt",
  "promptPacket",
  "clipPromptPacket",
  "providerRequestBody",
  "providerResponseBody",
  "requestBody",
  "responseBody",
  "signedUrl",
  "publicUrl",
  "url"
]);

const secretKeys = new Set([
  "apiKey",
  "authorization",
  "cookie",
  "key",
  "openrouterApiKey",
  "password",
  "seedanceApiKey",
  "secret",
  "serviceRoleKey",
  "supabaseServiceRoleKey",
  "token"
]);

const identifierKeys = new Map([
  ["idempotencyKey", "idempotencyKeyHash"],
  ["sessionId", "sessionIdHash"],
  ["userId", "userIdHash"]
]);

export function hashLogIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function redactForLog<T>(value: T): unknown {
  return redactUnknown(value);
}

export function redactProviderError(
  error: unknown,
  options: { errorCode?: string; providerErrorCategory?: string; providerHttpStatus?: number; retryable?: boolean } = {}
): RedactedProviderError {
  return {
    errorCode: options.errorCode ?? providerErrorCode(error),
    ...(options.providerErrorCategory ? { providerErrorCategory: options.providerErrorCategory } : {}),
    ...(options.providerHttpStatus !== undefined ? { providerHttpStatus: options.providerHttpStatus } : {}),
    redactedError: "Provider request failed.",
    retryable: options.retryable ?? false,
    redactionApplied: true
  };
}

export function hasForbiddenLogValue(value: unknown) {
  const serialized = JSON.stringify(value);

  if (!serialized) {
    return false;
  }

  return [
    "OPENROUTER_API_KEY",
    "SEEDANCE_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "api_key",
    "authorization",
    "privateInput",
    "rawPrompt",
    "service role key",
    "signedUrl"
  ].some((needle) => serialized.includes(needle));
}

function redactUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (value instanceof Error) {
    return {
      message: redactedValue,
      name: value.name,
      redactionApplied: true
    };
  }

  const output: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    const hashKey = identifierKeys.get(key);

    if (hashKey && typeof childValue === "string") {
      output[hashKey] = hashLogIdentifier(childValue);
      continue;
    }

    if (identifierKeys.has(key)) {
      output[`${key}Hash`] = redactedValue;
      continue;
    }

    if (sensitiveContentKeys.has(key) || secretKeys.has(key) || isLikelySensitiveKey(normalizedKey)) {
      output[key] = redactedValue;
      continue;
    }

    output[key] = redactUnknown(childValue);
  }

  return output;
}

function providerErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }

  return "PROVIDER_ERROR";
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isLikelySensitiveKey(normalizedKey: string) {
  return (
    normalizedKey.includes("apikey") ||
    normalizedKey.includes("authorization") ||
    normalizedKey.includes("cookie") ||
    normalizedKey.includes("password") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("signedurl") ||
    normalizedKey.includes("token")
  );
}
