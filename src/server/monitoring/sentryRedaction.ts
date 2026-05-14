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
  const original = event as SentryEventShape;
  const scrubbed = deepScrub(event) as SentryEventShape;

  delete scrubbed.user;
  scrubbed.request = original.request
    ? {
        method: typeof original.request.method === "string" ? original.request.method : undefined,
        url: typeof original.request.url === "string" ? redactUrl(original.request.url) : undefined
      }
    : undefined;

  return scrubbed as T;
}

type SentryEventShape = {
  request?: {
    method?: unknown;
    url?: unknown;
  };
  user?: unknown;
};

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

    if (/storage/i.test(`${parsed.hostname}${parsed.pathname}`)) {
      return "[redacted]";
    }

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[redacted]";
  }
}
