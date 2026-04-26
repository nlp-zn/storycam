import type { GenerationJobStatus } from "./storycamApi";

export function isTerminalGenerationJobStatus(status: GenerationJobStatus) {
  return status === "succeeded" || status === "failed" || status === "canceled" || status === "expired";
}

export function shouldPollGenerationJob(status: GenerationJobStatus) {
  return status === "queued" || status === "running" || status === "cancel_requested";
}
