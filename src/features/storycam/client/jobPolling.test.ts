import { describe, expect, it, vi } from "vitest";
import {
  imageGenerationPollingPolicy,
  mapWithConcurrencyLimit,
  nextImageGenerationPollDelayMs
} from "./jobPolling";

describe("image generation polling", () => {
  it("backs off to the final image polling delay after repeated attempts", () => {
    expect(nextImageGenerationPollDelayMs(0)).toBe(3_000);
    expect(nextImageGenerationPollDelayMs(1)).toBe(4_000);
    expect(nextImageGenerationPollDelayMs(2)).toBe(6_000);
    expect(nextImageGenerationPollDelayMs(5)).toBe(15_000);
    expect(nextImageGenerationPollDelayMs(99)).toBe(15_000);
  });

  it("limits concurrent polling requests", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const mapper = vi.fn(async (input: number) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeRequests -= 1;

      return input * 2;
    });

    const results = await mapWithConcurrencyLimit(
      [1, 2, 3, 4, 5, 6, 7, 8],
      imageGenerationPollingPolicy.maxConcurrentRequests,
      mapper
    );

    expect(maxActiveRequests).toBeLessThanOrEqual(imageGenerationPollingPolicy.maxConcurrentRequests);
    expect(results).toHaveLength(8);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
  });
});
