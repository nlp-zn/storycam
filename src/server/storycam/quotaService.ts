import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoryCamConfig } from "@/server/config";
import type { Database, GenerationJobRow } from "@/server/db/types";
import { StoryCamGenerationJobRepository } from "./generationJobRepository";

export class StoryCamQuotaError extends Error {
  constructor(readonly code: "daily_final_work_limit_exceeded" | "daily_image_limit_exceeded" | "daily_video_limit_exceeded") {
    super(`StoryCam quota exceeded: ${code}`);
    this.name = "StoryCamQuotaError";
  }
}

export async function assertStoryCamDailyJobQuota(
  client: SupabaseClient<Database>,
  userId: string,
  config: StoryCamConfig,
  family: "final_work" | "image" | "video"
) {
  if (config.generation.mode !== "real") {
    return;
  }

  const repository = new StoryCamGenerationJobRepository(client);
  const since = startOfUtcDay(new Date());
  const { limit, type, errorCode } = quotaForFamily(config, family);
  const count = await countFamily(repository, userId, type, since);

  if (count >= limit) {
    throw new StoryCamQuotaError(errorCode);
  }
}

export function quotaErrorResponse(error: StoryCamQuotaError) {
  return Response.json(
    {
      error: error.code,
      redactedError: "Daily generation limit reached.",
      redactionApplied: true
    },
    { status: 429 }
  );
}

function quotaForFamily(config: StoryCamConfig, family: "final_work" | "image" | "video") {
  if (family === "image") {
    return {
      errorCode: "daily_image_limit_exceeded" as const,
      limit: config.quotas?.dailyImageJobLimit ?? 30,
      type: ["story_world_asset_image", "storyboard_image", "expanded_storyboard_image"] as const
    };
  }

  if (family === "video") {
    return {
      errorCode: "daily_video_limit_exceeded" as const,
      limit: config.quotas?.dailyVideoJobLimit ?? 5,
      type: ["video_clip"] as const
    };
  }

  return {
    errorCode: "daily_final_work_limit_exceeded" as const,
    limit: config.quotas?.dailyFinalWorkJobLimit ?? 5,
    type: ["final_work"] as const
  };
}

async function countFamily(
  repository: StoryCamGenerationJobRepository,
  userId: string,
  types: readonly GenerationJobRow["type"][],
  since: Date
) {
  const counts = await Promise.all(types.map((type) => repository.countCreatedSince(userId, type, since)));

  return counts.reduce((sum, count) => sum + count, 0);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
