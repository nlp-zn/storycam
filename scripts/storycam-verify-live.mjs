#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://storycam.znbuild.com";

const config = {
  baseUrl: normalizeBaseUrl(process.env.STORYCAM_LIVE_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_BASE_URL),
  deepHealthToken: readOptionalEnv("STORYCAM_DEEP_HEALTH_TOKEN"),
  requireCloudflareStaticCache: readBooleanEnv("STORYCAM_REQUIRE_CLOUDFLARE_STATIC_CACHE")
};

let failed = false;

await check("public health", () => checkPublicHealth(config.baseUrl));
await check("deep health is hidden without token", () => checkDeepHealthUnauthorized(config.baseUrl));
await check("auth callback canonical redirect", () => checkAuthCallback(config.baseUrl));
await check("deep health with token", () => checkDeepHealthAuthorized(config.baseUrl, config.deepHealthToken), {
  skip: !config.deepHealthToken,
  skipReason: "STORYCAM_DEEP_HEALTH_TOKEN is not set"
});
await check("Next.js static asset cache", () => checkStaticAssetCache(config.baseUrl, config.requireCloudflareStaticCache), {
  warnOnly: !config.requireCloudflareStaticCache
});

if (failed) {
  process.exitCode = 1;
}

async function check(name, fn, options = {}) {
  if (options.skip) {
    console.log(`[skip] ${name}: ${options.skipReason}`);
    return;
  }

  try {
    const detail = await fn();
    console.log(`[ok] ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (options.warnOnly) {
      console.warn(`[warn] ${name}: ${message}`);
      return;
    }

    failed = true;
    console.error(`[fail] ${name}: ${message}`);
  }
}

async function checkPublicHealth(baseUrl) {
  const response = await fetch(new URL("/api/health", baseUrl), { redirect: "manual" });

  assertStatus(response, 200);
  assertNoStore(response);

  const body = await readJson(response, "public health");

  if (body?.ok !== true) {
    throw new Error("health response did not return ok=true");
  }

  return `mode=${body.generationMode ?? "unknown"}`;
}

async function checkDeepHealthUnauthorized(baseUrl) {
  const response = await fetch(new URL("/api/health/deep", baseUrl), { redirect: "manual" });

  assertStatus(response, 404);
  assertNoStore(response);

  return "unauthorized requests receive 404";
}

async function checkDeepHealthAuthorized(baseUrl, token) {
  const response = await fetch(new URL("/api/health/deep", baseUrl), {
    headers: { authorization: `Bearer ${token}` },
    redirect: "manual"
  });

  assertStatus(response, 200);
  assertNoStore(response);

  const body = await readJson(response, "deep health");

  if (body?.ok !== true || body?.database !== "ok" || body?.storage !== "ok") {
    throw new Error("deep health did not confirm database and storage readiness");
  }

  return "database=ok storage=ok";
}

async function checkAuthCallback(baseUrl) {
  const nextPath = "/storycam/input";
  const response = await fetch(new URL(`/auth/callback?next=${encodeURIComponent(nextPath)}`, baseUrl), {
    redirect: "manual"
  });

  if (![307, 308].includes(response.status)) {
    throw new Error(`expected 307/308 redirect, received ${response.status}`);
  }

  const location = response.headers.get("location");

  if (!location) {
    throw new Error("redirect did not include a location header");
  }

  const redirectedTo = new URL(location, baseUrl).toString();
  const expected = new URL(nextPath, baseUrl).toString();

  if (redirectedTo !== expected) {
    throw new Error(`expected redirect to ${expected}, received ${redactUrlForError(redirectedTo)}`);
  }

  return expected;
}

async function checkStaticAssetCache(baseUrl, requireCloudflareStaticCache) {
  const pageResponse = await fetch(baseUrl);

  assertOk(pageResponse, "homepage");

  const html = await pageResponse.text();
  const staticAssetPath = findNextStaticAssetPath(html);

  if (!staticAssetPath) {
    throw new Error("could not find a /_next/static asset in the homepage HTML");
  }

  const assetUrl = new URL(staticAssetPath, baseUrl);
  await fetch(assetUrl);
  const response = await fetch(assetUrl);

  assertOk(response, "static asset");

  const cacheControl = response.headers.get("cache-control")?.toLowerCase() ?? "";

  if (!cacheControl.includes("immutable") && !cacheControl.includes("max-age=31536000")) {
    throw new Error(`static asset cache-control is not immutable: ${cacheControl || "missing"}`);
  }

  const cfCacheStatus = response.headers.get("cf-cache-status");

  if (requireCloudflareStaticCache && cfCacheStatus && !["HIT", "REVALIDATED", "UPDATING"].includes(cfCacheStatus)) {
    throw new Error(`Cloudflare cache status is ${cfCacheStatus}`);
  }

  return cfCacheStatus ? `cf-cache-status=${cfCacheStatus}` : "origin cache headers ok";
}

function findNextStaticAssetPath(html) {
  const match = html.match(/["'](\/_next\/static\/[^"']+)["']/);

  return match?.[1]?.replaceAll("&amp;", "&");
}

async function readJson(response, label) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} response was not valid JSON`);
  }
}

function assertOk(response, label) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
}

function assertStatus(response, expectedStatus) {
  if (response.status !== expectedStatus) {
    throw new Error(`expected HTTP ${expectedStatus}, received ${response.status}`);
  }
}

function assertNoStore(response) {
  const cacheControl = response.headers.get("cache-control")?.toLowerCase() ?? "";

  if (!cacheControl.includes("no-store")) {
    throw new Error(`expected cache-control no-store, received ${cacheControl || "missing"}`);
  }
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";

  return url;
}

function readOptionalEnv(key) {
  const value = process.env[key]?.trim();

  return value || undefined;
}

function readBooleanEnv(key) {
  return ["1", "true", "yes"].includes((process.env[key] ?? "").trim().toLowerCase());
}

function redactUrlForError(value) {
  try {
    const parsed = new URL(value);

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[redacted]";
  }
}
