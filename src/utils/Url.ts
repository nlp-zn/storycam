export function getBaseUrl(env: Record<string, string | undefined> = process.env) {
  const configuredUrl = env.NEXT_PUBLIC_APP_URL?.trim();

  if (configuredUrl) {
    return trimTrailingSlash(configuredUrl);
  }

  if (env.VERCEL_URL) {
    return `https://${trimTrailingSlash(env.VERCEL_URL)}`;
  }

  return "http://localhost:3000";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
