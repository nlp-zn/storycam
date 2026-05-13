import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { loadStoryCamConfig } from "./src/server/config";

loadStoryCamConfig();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: {
    position: "bottom-right"
  },
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd()
  }
};

export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI
});
