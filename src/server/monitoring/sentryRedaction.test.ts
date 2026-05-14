import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "./sentryRedaction";

describe("Sentry redaction", () => {
  it("removes user identity and query strings from request urls", () => {
    const scrubbed = scrubSentryEvent({
      request: {
        method: "POST",
        url: "https://storycam.example.com/api/final-work?sessionId=private"
      },
      user: { email: "user@example.com", id: "user-1" }
    });

    expect(scrubbed).not.toHaveProperty("user");
    expect(scrubbed.request).toEqual({
      method: "POST",
      url: "https://storycam.example.com/api/final-work"
    });
  });

  it("redacts private prompts, provider bodies, signed urls, storage paths, and bearer tokens", () => {
    const scrubbed = scrubSentryEvent({
      extra: {
        note: "Authorization: Bearer provider-token",
        prompt: "private family story",
        providerResponse: { body: "raw provider payload" },
        signedUrl: "https://example.supabase.co/storage/v1/object/sign/storycam/private",
        storagePath: "storycam-generated/user/file.mp4",
        safeStatus: "failed"
      }
    });
    const serialized = JSON.stringify(scrubbed);

    expect(serialized).toContain("safeStatus");
    expect(serialized).toContain("[redacted]");
    expect(serialized).not.toContain("private family story");
    expect(serialized).not.toContain("raw provider payload");
    expect(serialized).not.toContain("provider-token");
    expect(serialized).not.toContain("storycam-generated/user/file.mp4");
  });

  it("redacts storage request urls instead of preserving object paths", () => {
    const scrubbed = scrubSentryEvent({
      request: {
        method: "GET",
        url: "https://example.supabase.co/storage/v1/object/sign/storycam-generated/user/private.mp4?token=secret"
      }
    });

    expect(scrubbed.request).toEqual({
      method: "GET",
      url: "[redacted]"
    });
  });
});
