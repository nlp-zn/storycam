import { spawn } from "node:child_process";

type VerificationStep = {
  args: string[];
  label: string;
};

const mockEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-anon-key",
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://storycam.example.supabase.co",
  STORYCAM_FINAL_WORK_PROVIDER: "mock",
  STORYCAM_GENERATION_MODE: "mock",
  STORYCAM_IMAGE_PROVIDER: "mock",
  STORYCAM_MULTIMODAL_PROVIDER: "mock",
  STORYCAM_TEXT_PROVIDER: "mock",
  STORYCAM_VIDEO_PROVIDER: "mock",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "local-service-role-key"
};

const steps: VerificationStep[] = [
  { args: ["lint"], label: "lint" },
  { args: ["typecheck"], label: "typecheck" },
  { args: ["test"], label: "unit tests" },
  { args: ["test:api"], label: "API tests" },
  { args: ["test:e2e"], label: "E2E mock flow" },
  { args: ["qa:visual"], label: "visual QA" },
  { args: ["build"], label: "production build" }
];

async function main() {
  console.log("StoryCam mock verification started.");

  for (const step of steps) {
    await runPnpm(step);
  }

  console.log("StoryCam mock verification succeeded.");
}

function runPnpm(step: VerificationStep) {
  return new Promise<void>((resolve, reject) => {
    console.log(`\n>>> pnpm ${step.args.join(" ")} (${step.label})`);

    const child = spawn("pnpm", step.args, {
      env: mockEnv,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`pnpm ${step.args.join(" ")} failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "StoryCam mock verification failed.");
  process.exit(1);
});
