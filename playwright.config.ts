import { defineConfig, devices } from "@playwright/test";

process.env.NO_PROXY = appendNoProxy(process.env.NO_PROXY);
process.env.no_proxy = appendNoProxy(process.env.no_proxy);

const PORT = process.env.PORT ?? "3008";
const baseURL = `http://127.0.0.1:${PORT}`;
const reuseExistingServer =
  process.env.STORYCAM_E2E_REUSE_SERVER === "1"
    ? true
    : process.env.STORYCAM_E2E_REUSE_SERVER === "0"
      ? false
      : !process.env.CI;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  timeout: 30 * 1000,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  expect: {
    timeout: 10 * 1000
  },
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: baseURL,
    timeout: 60 * 1000,
    reuseExistingServer,
    gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    env: {
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: "https://storycam.example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key",
      STORYCAM_GENERATION_MODE: "mock",
      STORYCAM_TEXT_PROVIDER: "mock",
      STORYCAM_STORY_WORLD_TEXT_PROVIDER: "mock",
      STORYCAM_STORYBOARD_TEXT_PROVIDER: "mock",
      STORYCAM_MULTIMODAL_PROVIDER: "mock",
      STORYCAM_IMAGE_PROVIDER: "mock",
      STORYCAM_VIDEO_PROVIDER: "mock",
      STORYCAM_FINAL_WORK_PROVIDER: "mock"
    }
  },
  use: {
    baseURL,
    trace: process.env.CI ? "on" : "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});

function appendNoProxy(value: string | undefined) {
  const entries = new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

  entries.add("localhost");
  entries.add("127.0.0.1");
  entries.add("::1");

  return Array.from(entries).join(",");
}
