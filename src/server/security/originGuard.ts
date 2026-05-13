export class OriginGuardError extends Error {
  constructor(readonly code: "origin_not_allowed" | "origin_required") {
    super(`StoryCam unsafe request rejected: ${code}`);
    this.name = "OriginGuardError";
  }
}

export function assertUnsafeRequestOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    if (process.env.NODE_ENV !== "production" || process.env.STORYCAM_ALLOW_MISSING_ORIGIN === "1") {
      return;
    }

    throw new OriginGuardError("origin_required");
  }

  if (!allowedOrigins(request).has(origin)) {
    throw new OriginGuardError("origin_not_allowed");
  }
}

export function originGuardResponse(error: OriginGuardError) {
  return Response.json(
    {
      error: error.code,
      redactedError: "Request origin is not allowed.",
      redactionApplied: true
    },
    { status: 403 }
  );
}

function allowedOrigins(request: Request) {
  const origins = new Set<string>();
  const requestOrigin = safeOrigin(request.url);

  if (requestOrigin) {
    origins.add(requestOrigin);
  }

  addOrigin(origins, process.env.NEXT_PUBLIC_APP_URL);
  for (const origin of (process.env.STORYCAM_ALLOWED_ORIGINS ?? "").split(",")) {
    addOrigin(origins, origin);
  }

  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
}

function addOrigin(origins: Set<string>, value: string | undefined) {
  const origin = safeOrigin(value);

  if (origin) {
    origins.add(origin);
  }
}

function safeOrigin(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}
