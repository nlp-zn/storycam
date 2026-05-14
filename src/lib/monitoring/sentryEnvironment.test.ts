import { describe, expect, it } from "vitest";
import { getSentryEnvironment, getSentryRelease } from "./sentryEnvironment";

describe("Sentry environment metadata", () => {
  it("uses explicit server environment before public and node values", () => {
    expect(
      getSentryEnvironment({
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "browser-prod",
        NODE_ENV: "production",
        SENTRY_ENVIRONMENT: "worker-prod"
      })
    ).toBe("worker-prod");
  });

  it("falls back to development when no environment is set", () => {
    expect(getSentryEnvironment({})).toBe("development");
  });

  it("uses explicit release before platform commit shas", () => {
    expect(
      getSentryRelease({
        GITHUB_SHA: "github-sha",
        RENDER_GIT_COMMIT: "render-sha",
        SENTRY_RELEASE: "manual-release"
      })
    ).toBe("manual-release");
  });

  it("falls back to Render commit sha for hosted builds", () => {
    expect(getSentryRelease({ RENDER_GIT_COMMIT: "render-sha" })).toBe("render-sha");
  });
});
