import { describe, expect, it } from "vitest";
import { hashLogIdentifier, redactForLog, redactProviderError, redactedValue } from "./redact";

describe("redaction utilities", () => {
  it("redacts raw private input, scripts, and prompt packets", () => {
    const redacted = redactForLog({
      input: "我想把暗恋拍成韩剧雨夜",
      nested: {
        clipPromptPacket: {
          fullPrompt: "complete provider prompt"
        },
        script: "full private script"
      },
      safe: "mock"
    });

    expect(redacted).toEqual({
      input: redactedValue,
      nested: {
        clipPromptPacket: redactedValue,
        script: redactedValue
      },
      safe: "mock"
    });
    expect(JSON.stringify(redacted)).not.toContain("暗恋");
    expect(JSON.stringify(redacted)).not.toContain("complete provider prompt");
  });

  it("hashes session, user, and idempotency identifiers", () => {
    const redacted = redactForLog({
      idempotencyKey: "raw-idempotency-key",
      sessionId: "session-1",
      userId: "user-1"
    });

    expect(redacted).toEqual({
      idempotencyKeyHash: hashLogIdentifier("raw-idempotency-key"),
      sessionIdHash: hashLogIdentifier("session-1"),
      userIdHash: hashLogIdentifier("user-1")
    });
    expect(JSON.stringify(redacted)).not.toContain("session-1");
    expect(JSON.stringify(redacted)).not.toContain("raw-idempotency-key");
  });

  it("redacts secrets and signed URLs recursively", () => {
    const redacted = redactForLog({
      provider: {
        apiKey: "sk-openrouter",
        signedUrl: "https://signed.example/token"
      },
      serviceRoleKey: "supabase-service-role-key"
    });

    expect(redacted).toEqual({
      provider: {
        apiKey: redactedValue,
        signedUrl: redactedValue
      },
      serviceRoleKey: redactedValue
    });
  });

  it("normalizes provider errors without raw error bodies", () => {
    const redacted = redactProviderError(
      {
        body: "raw provider body with prompt",
        code: "PROVIDER_TIMEOUT",
        message: "provider says secret prompt failed"
      },
      { retryable: true }
    );

    expect(redacted).toEqual({
      errorCode: "PROVIDER_TIMEOUT",
      redactedError: "Provider request failed.",
      redactionApplied: true,
      retryable: true
    });
    expect(JSON.stringify(redacted)).not.toContain("secret prompt");
    expect(JSON.stringify(redacted)).not.toContain("raw provider body");
  });
});
