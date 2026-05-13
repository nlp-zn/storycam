const sensitiveKeys = new Set([
  "apiKey",
  "authorization",
  "body",
  "clipPromptPacket",
  "cookie",
  "data_json",
  "prompt",
  "providerPrompt",
  "providerRequest",
  "providerResponse",
  "script",
  "secret",
  "signedUrl",
  "storagePath",
  "url"
]);

export function scrubSentryEvent<T>(event: T): T {
  const scrubbed = deepScrub(event) as {
    request?: {
      method?: string;
      url?: string;
    };
    user?: unknown;
  };

  delete scrubbed.user;
  scrubbed.request = scrubbed.request
    ? {
        method: scrubbed.request.method,
        url: scrubbed.request.url ? redactUrl(scrubbed.request.url) : undefined
      }
    : undefined;

  return scrubbed as T;
}

function deepScrub(value: unknown, key?: string): unknown {
  if (key && shouldRedactKey(key)) {
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepScrub(item));
  }

  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactMaybeSensitiveString(value) : value;
  }

  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, deepScrub(entryValue, entryKey)]));
}

function shouldRedactKey(key: string) {
  const normalized = key.toLowerCase();

  return [...sensitiveKeys].some((sensitiveKey) => normalized.includes(sensitiveKey.toLowerCase()));
}

function redactMaybeSensitiveString(value: string) {
  if (/https?:\/\/[^\s"]+storage[^\s"]+/i.test(value) || /bearer\s+[a-z0-9._-]+/i.test(value)) {
    return "[redacted]";
  }

  return value;
}

function redactUrl(value: string) {
  try {
    const parsed = new URL(value);

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[redacted]";
  }
}
