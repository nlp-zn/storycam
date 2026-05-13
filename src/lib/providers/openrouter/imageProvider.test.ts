import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOpenRouterImageProvider } from "./imageProvider";
import { generateCoreStoryboardRepresentativeImage } from "@/server/storycam/storyboardImageService";
import type { Database } from "@/server/db/types";

vi.mock("server-only", () => ({}));

describe("openrouter-image-provider", () => {
  it("generates a schema-safe image payload through the Vercel AI SDK boundary", async () => {
    const referenceImages = [
      "https://storycam.example/user-photo.png",
      "https://storycam.example/handdrawn-style.png"
    ];
    const generateImage = vi.fn().mockResolvedValue({
      image: {
        mediaType: "image/png",
        uint8Array: new Uint8Array([137, 80, 78, 71])
      }
    });
    const provider = createOpenRouterImageProvider({
      apiKey: "openrouter-secret",
      buildPrompt: (input: { coreGroupTitle: string }) => ({
        aspectRatio: "16:9",
        images: referenceImages,
        prompt: `Create a cinematic StoryCam storyboard representative image for: ${input.coreGroupTitle}`
      }),
      generateImage,
      model: "openai/gpt-5.4-image-2"
    });

    const result = await provider.generateImage({ coreGroupTitle: "雨夜便利店窗边" });

    expect(result).toMatchObject({
      ok: true,
      providerKind: "image",
      providerName: "openrouter",
      value: {
        mimeType: "image/png",
        model: "openai/gpt-5.4-image-2"
      }
    });
    expect(result.ok && result.value.bytes).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        aspectRatio: "16:9",
        images: referenceImages,
        prompt: expect.stringContaining("雨夜便利店窗边")
      })
    );
  });

  it("retries invalid image output and returns only a redacted provider failure", async () => {
    const generateImage = vi
      .fn()
      .mockResolvedValueOnce({ image: { mediaType: "text/plain", uint8Array: new Uint8Array([1]) } })
      .mockRejectedValueOnce(new Error("provider response had api key openrouter-secret and signedUrl"));
    const provider = createOpenRouterImageProvider({
      apiKey: "openrouter-secret",
      buildPrompt: () => ({
        prompt: "Create a StoryCam storyboard representative image."
      }),
      generateImage,
      model: "openai/gpt-5.4-image-2"
    });

    const result = await provider.generateImage({ coreGroupTitle: "bad image please" });

    expect(generateImage).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      errorCode: "OPENROUTER_IMAGE_INVALID_OUTPUT",
      ok: false,
      providerKind: "image",
      providerName: "openrouter",
      redactionApplied: true,
      retryable: true
    });
    expect(JSON.stringify(result)).not.toContain("openrouter-secret");
    expect(JSON.stringify(result)).not.toContain("signedUrl");
  });

  it("classifies OpenRouter image provider policy or account blocks without retrying", async () => {
    const providerError = Object.assign(new Error("The request is prohibited due to a violation of provider Terms Of Service."), {
      statusCode: 403
    });
    const generateImage = vi.fn().mockRejectedValue(providerError);
    const provider = createOpenRouterImageProvider({
      apiKey: "openrouter-secret",
      buildPrompt: () => ({
        prompt: "Create a StoryCam character reference sheet."
      }),
      generateImage,
      model: "openai/gpt-5.4-image-2"
    });

    const result = await provider.generateImage({ coreGroupTitle: "blocked image" });

    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      errorCode: "OPENROUTER_IMAGE_PROVIDER_BLOCKED",
      ok: false,
      retryable: false
    });
  });

  it("classifies OpenRouter image region blocks without retrying", async () => {
    const generateImage = vi.fn().mockRejectedValue(new Error("This model is not available in your region."));
    const provider = createOpenRouterImageProvider({
      apiKey: "openrouter-secret",
      buildPrompt: () => ({
        prompt: "Create a StoryCam character reference sheet."
      }),
      generateImage,
      model: "openai/gpt-5.4-image-2"
    });

    const result = await provider.generateImage({ coreGroupTitle: "region blocked image" });

    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      errorCode: "OPENROUTER_IMAGE_REGION_UNAVAILABLE",
      ok: false,
      retryable: false
    });
  });

  it("stores representative storyboard images in the private generated bucket", async () => {
    const client = new FakeSupabaseClient();
    const provider = {
      providerKind: "image" as const,
      providerName: "openrouter",
      generateImage: vi.fn().mockResolvedValue({
        ok: true,
        providerKind: "image",
        providerName: "openrouter",
        value: {
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: "image/png"
        }
      })
    };

    const result = await generateCoreStoryboardRepresentativeImage(client.asSupabaseClient(), {
      coreGroup: coreGroup(),
      provider,
      sessionId: "session-1",
      userId: "user-1"
    });

    expect(result).toMatchObject({
      coreGroupId: "core-group-1",
      image: {
        mediaId: "media-1",
        mimeType: "image/png",
        placeholder: false,
        signedUrl: expect.stringMatching(
          /^https:\/\/storycam\.example\/signed\/storycam-generated\/users\/user-1\/sessions\/session-1\/generated\/storyboards\/.+\.png$/
        ),
        signedUrlExpiresIn: 300,
        status: "ready"
      },
      placeholder: false,
      status: "ready"
    });
    expect(!result.placeholder && result.media.bucket).toBe("storycam-generated");
    expect(!result.placeholder && result.media.path).toMatch(
      /^users\/user-1\/sessions\/session-1\/generated\/storyboards\/.+\.png$/
    );
    expect(client.uploads).toEqual([
      {
        bucket: "storycam-generated",
        byteSize: 3,
        contentType: "image/png",
        path: expect.stringMatching(/generated\/storyboards\/.+\.png$/),
        upsert: false
      }
    ]);
    expect(client.queries[0]?.calls).toContainEqual([
      "insert",
      expect.objectContaining({
        kind: "thumbnail",
        linked_artifact_id: "core-group-1",
        mime_type: "image/png",
        source: "provider",
        storage_bucket: "storycam-generated"
      })
    ]);
  });

  it("falls back to a placeholder when representative image generation fails", async () => {
    const providerFailure = {
      errorCode: "OPENROUTER_IMAGE_INVALID_OUTPUT",
      ok: false,
      providerKind: "image" as const,
      providerName: "openrouter",
      redactedError: "Provider request failed.",
      redactionApplied: true as const,
      retryable: true
    };
    const client = new FakeSupabaseClient();
    const provider = {
      providerKind: "image" as const,
      providerName: "openrouter",
      generateImage: vi.fn().mockResolvedValue(providerFailure)
    };

    const result = await generateCoreStoryboardRepresentativeImage(client.asSupabaseClient(), {
      coreGroup: coreGroup(),
      provider,
      sessionId: "session-1",
      userId: "user-1"
    });

    expect(result).toEqual({
      coreGroupId: "core-group-1",
      image: {
        placeholder: true,
        reason: "provider_failed",
        status: "placeholder"
      },
      media: null,
      placeholder: true,
      reason: "provider_failed",
      redactedFailure: providerFailure,
      status: "placeholder"
    });
    expect(client.uploads).toEqual([]);
    expect(client.queries).toEqual([]);
  });
});

function coreGroup() {
  return {
    characterAssetIds: ["character-1"],
    emotionalTurn: "她把要发出的短信停在指尖。",
    estimatedClipDurationSeconds: 8,
    expandedCardIds: [],
    id: "core-group-1",
    sceneAssetId: "scene-1",
    sessionId: "session-1",
    state: "ready" as const,
    storyPurpose: "建立雨夜中没有说出口的情绪。",
    title: "雨夜便利店窗边",
    version: 1
  };
}

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];
  readonly uploads: Array<{ bucket: string; byteSize: number; contentType: string; path: string; upsert: boolean }> = [];

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  readonly storage = {
    from: (bucket: string) => ({
      createSignedUrl: (path: string) => Promise.resolve({
        data: { signedUrl: `https://storycam.example/signed/${bucket}/${path}` },
        error: null
      }),
      upload: (path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }) => {
        this.uploads.push({ bucket, byteSize: body.byteLength, contentType: options.contentType, path, upsert: options.upsert });
        return Promise.resolve({
          data: { path },
          error: null
        });
      }
    })
  };

  from(table: string) {
    const query = new FakeQuery(table);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];
  private inserted: Record<string, unknown> | null = null;

  constructor(readonly table: string) {}

  insert(value: Record<string, unknown>) {
    this.inserted = value;
    this.calls.push(["insert", value]);
    return this;
  }

  select(columns: string) {
    this.calls.push(["select", columns]);
    return this;
  }

  single() {
    return Promise.resolve({
      data: {
        id: "media-1",
        created_at: "2026-04-26T00:00:00.000Z",
        deleted_at: null,
        ...this.inserted
      },
      error: null
    });
  }
}
