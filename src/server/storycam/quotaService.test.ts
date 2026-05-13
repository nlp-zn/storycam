import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoryCamConfig } from "@/server/config";
import type { Database } from "@/server/db/types";
import { assertStoryCamDailyJobQuota, quotaErrorResponse, StoryCamQuotaError } from "./quotaService";

describe("StoryCam quota service", () => {
  it("does not query quota counts in mock mode", async () => {
    const client = new FakeSupabaseClient(99);

    await expect(assertStoryCamDailyJobQuota(client.asSupabaseClient(), "user-1", config("mock"), "image")).resolves.toBeUndefined();
    expect(client.queries).toHaveLength(0);
  });

  it("rejects real image generation when the daily family limit is reached", async () => {
    const client = new FakeSupabaseClient(10);

    await expect(assertStoryCamDailyJobQuota(client.asSupabaseClient(), "user-1", config("real"), "image")).rejects.toThrow(
      new StoryCamQuotaError("daily_image_limit_exceeded")
    );
    expect(client.queries).toHaveLength(3);
  });

  it("returns a redacted 429 response", async () => {
    const response = quotaErrorResponse(new StoryCamQuotaError("daily_video_limit_exceeded"));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "daily_video_limit_exceeded",
      redactedError: "Daily generation limit reached.",
      redactionApplied: true
    });
  });
});

function config(mode: StoryCamConfig["generation"]["mode"]): StoryCamConfig {
  return {
    generation: {
      finalWorkProvider: mode === "real" ? "ffmpeg" : "mock",
      imageProvider: mode === "real" ? "inference_sh" : "mock",
      mode,
      multimodalProvider: mode === "real" ? "openrouter" : "mock",
      storyboardTextProvider: mode === "real" ? "openrouter" : "mock",
      storyWorldTextProvider: mode === "real" ? "deepseek" : "mock",
      textProvider: "mock",
      videoProvider: mode === "real" ? "seedance_2_0" : "mock"
    },
    media: { providerReferenceSignedUrlTtlSeconds: 3600 },
    quotas: {
      dailyFinalWorkJobLimit: 5,
      dailyImageJobLimit: 10,
      dailyVideoJobLimit: 5
    },
    supabase: {
      anonKey: "anon",
      serviceRoleKey: "service",
      url: "https://storycam.test"
    }
  };
}

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];

  constructor(private readonly count: number) {}

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  from(table: string) {
    const query = new FakeQuery(table, this.count);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];

  constructor(
    readonly table: string,
    private readonly count: number
  ) {}

  select(columns: string, options?: Record<string, unknown>) {
    this.calls.push(options ? ["select", columns, options] : ["select", columns]);
    return this;
  }

  eq(column: string, value: unknown) {
    this.calls.push(["eq", column, value]);
    return this;
  }

  gte(column: string, value: unknown) {
    this.calls.push(["gte", column, value]);
    return this;
  }

  then(resolve: (value: { count: number; data: null; error: null }) => void, reject?: (reason: unknown) => void) {
    return Promise.resolve({ count: this.count, data: null, error: null }).then(resolve, reject);
  }
}
