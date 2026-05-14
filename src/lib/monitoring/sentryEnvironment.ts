type SentryEnv = Record<string, string | undefined>;

export function getSentryEnvironment(env: SentryEnv = currentSentryEnv()): string {
  return readEnv(env, "SENTRY_ENVIRONMENT") ?? readEnv(env, "NEXT_PUBLIC_SENTRY_ENVIRONMENT") ?? readEnv(env, "NODE_ENV") ?? "development";
}

export function getSentryRelease(env: SentryEnv = currentSentryEnv()): string | undefined {
  return (
    readEnv(env, "SENTRY_RELEASE") ??
    readEnv(env, "NEXT_PUBLIC_SENTRY_RELEASE") ??
    readEnv(env, "RENDER_GIT_COMMIT") ??
    readEnv(env, "VERCEL_GIT_COMMIT_SHA") ??
    readEnv(env, "GITHUB_SHA")
  );
}

function currentSentryEnv(): SentryEnv {
  return {
    GITHUB_SHA: process.env.GITHUB_SHA,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    NODE_ENV: process.env.NODE_ENV,
    RENDER_GIT_COMMIT: process.env.RENDER_GIT_COMMIT,
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
    SENTRY_RELEASE: process.env.SENTRY_RELEASE,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA
  };
}

function readEnv(env: SentryEnv, key: string): string | undefined {
  const value = env[key]?.trim();

  return value || undefined;
}
