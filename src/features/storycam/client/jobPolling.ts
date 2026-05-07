import type { GenerationJobStatus } from "./storycamApi";

export const imageGenerationPollingPolicy = {
  delayScheduleMs: [3_000, 4_000, 6_000, 9_000, 12_000, 15_000] as const,
  maxConcurrentRequests: 3
};

export const videoGenerationPollingPolicy = {
  delayScheduleMs: [2_000, 5_000, 10_000, 20_000, 30_000] as const
};

export function isTerminalGenerationJobStatus(status: GenerationJobStatus) {
  return status === "succeeded" || status === "failed" || status === "canceled" || status === "expired";
}

export function shouldPollGenerationJob(status: GenerationJobStatus) {
  return status === "queued" || status === "running" || status === "cancel_requested";
}

export function nextImageGenerationPollDelayMs(completedAttempts: number) {
  return (
    imageGenerationPollingPolicy.delayScheduleMs[
      Math.min(Math.max(completedAttempts, 0), imageGenerationPollingPolicy.delayScheduleMs.length - 1)
    ] ?? imageGenerationPollingPolicy.delayScheduleMs.at(-1)!
  );
}

export function nextVideoGenerationPollDelayMs(completedAttempts: number) {
  return (
    videoGenerationPollingPolicy.delayScheduleMs[
      Math.min(Math.max(completedAttempts, 0), videoGenerationPollingPolicy.delayScheduleMs.length - 1)
    ] ?? videoGenerationPollingPolicy.delayScheduleMs.at(-1)!
  );
}

export async function mapWithConcurrencyLimit<TInput, TOutput>(
  inputs: TInput[],
  limit: number,
  mapper: (input: TInput, index: number) => Promise<TOutput>
) {
  const results: PromiseSettledResult<TOutput>[] = new Array(inputs.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(limit, 1), inputs.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < inputs.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        try {
          results[currentIndex] = {
            status: "fulfilled",
            value: await mapper(inputs[currentIndex]!, currentIndex)
          };
        } catch (reason) {
          results[currentIndex] = {
            reason,
            status: "rejected"
          };
        }
      }
    })
  );

  return results;
}
