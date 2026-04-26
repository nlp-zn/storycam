import { describe, expect, it } from "vitest";
import { createStoryCamLogger, type StoryCamLogEntry } from "./storycamLogger";

describe("StoryCam privacy logger", () => {
  it("logs only redacted fields", () => {
    const entries: StoryCamLogEntry[] = [];
    const logger = createStoryCamLogger((entry) => entries.push(entry));

    logger.info("story_world_requested", {
      idempotencyKey: "raw-idempotency-key",
      input: "我想把暗恋拍成韩剧雨夜",
      providerRequestBody: { prompt: "full prompt" },
      sessionId: "session-1"
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      event: "story_world_requested",
      level: "info",
      redactionApplied: true
    });
    expect(JSON.stringify(entries[0])).toContain("sessionIdHash");
    expect(JSON.stringify(entries[0])).toContain("idempotencyKeyHash");
    expect(JSON.stringify(entries[0])).not.toContain("session-1");
    expect(JSON.stringify(entries[0])).not.toContain("暗恋");
    expect(JSON.stringify(entries[0])).not.toContain("full prompt");
  });

  it("fails closed if a forbidden value survives redaction", () => {
    const entries: StoryCamLogEntry[] = [];
    const logger = createStoryCamLogger((entry) => entries.push(entry));

    logger.error("unsafe", {
      nested: "SUPABASE_SERVICE_ROLE_KEY"
    });

    expect(entries).toEqual([
      {
        event: "unsafe",
        fields: { redactionFailure: true },
        level: "error",
        redactionApplied: true
      }
    ]);
  });
});
