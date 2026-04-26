import { describe, expect, it, vi } from "vitest";
import { createSeedanceVideoProvider, normalizeSeedanceTaskResponse } from "./videoProvider";

const input = {
  durationSeconds: 4.6,
  prompt: "写实风格，雨夜便利店窗边，女孩停下未发送的短信，镜头缓慢推近。",
  referenceImageUrls: ["https://signed.example/reference.png"],
  ratio: "16:9" as const
};

describe("seedance video provider", () => {
  it("creates an async Seedance task and returns the provider request id", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ id: "cgt-2026-storycam" }));
    const provider = createSeedanceVideoProvider({
      apiKey: "seedance-secret",
      baseUrl: "https://ark.example/api/v3/",
      fetch,
      model: "doubao-seedance-2-0-260128"
    });

    const result = await provider.generateClip(input);

    expect(result).toMatchObject({
      ok: true,
      providerKind: "video",
      providerName: "seedance_2_0",
      providerRequestId: "cgt-2026-storycam",
      value: {
        model: "doubao-seedance-2-0-260128",
        providerRequestId: "cgt-2026-storycam",
        status: "queued"
      }
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://ark.example/api/v3/contents/generations/tasks",
      expect.objectContaining({
        body: JSON.stringify({
          content: [
            {
              text: input.prompt,
              type: "text"
            },
            {
              image_url: { url: "https://signed.example/reference.png" },
              type: "image_url"
            }
          ],
          duration: 5,
          generate_audio: false,
          model: "doubao-seedance-2-0-260128",
          ratio: "16:9",
          watermark: false
        }),
        headers: expect.objectContaining({
          Authorization: "Bearer seedance-secret",
          "Content-Type": "application/json"
        }),
        method: "POST"
      })
    );
  });

  it("polls until Seedance returns a succeeded task with content.video_url", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "cgt-2026-storycam" }))
      .mockResolvedValueOnce(jsonResponse({ id: "cgt-2026-storycam", model: "doubao-seedance-2-0-260128", status: "running" }))
      .mockResolvedValueOnce(
        jsonResponse({
          content: {
            video_url: "https://ark-content.example/video.mp4"
          },
          id: "cgt-2026-storycam",
          model: "doubao-seedance-2-0-260128",
          seed: 58944,
          status: "succeeded"
        })
      );
    const provider = createSeedanceVideoProvider({
      apiKey: "seedance-secret",
      baseUrl: "https://ark.example/api/v3",
      fetch,
      model: "doubao-seedance-2-0-260128",
      polling: {
        enabled: true,
        intervalMs: 0,
        maxAttempts: 3
      }
    });

    const result = await provider.generateClip(input);

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://ark.example/api/v3/contents/generations/tasks/cgt-2026-storycam",
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toMatchObject({
      ok: true,
      providerRequestId: "cgt-2026-storycam",
      value: {
        providerRequestId: "cgt-2026-storycam",
        seed: 58944,
        status: "succeeded",
        videoUrl: "https://ark-content.example/video.mp4"
      }
    });
  });

  it("normalizes webhook payloads with the same shape as queried tasks", () => {
    expect(
      normalizeSeedanceTaskResponse({
        content: { video_url: "https://ark-content.example/video.mp4" },
        id: "cgt-2026-storycam",
        model: "doubao-seedance-2-0-260128",
        status: "succeeded"
      })
    ).toEqual({
      id: "cgt-2026-storycam",
      model: "doubao-seedance-2-0-260128",
      status: "succeeded",
      videoUrl: "https://ark-content.example/video.mp4"
    });
  });

  it("maps failed tasks and provider errors to redacted failures", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "cgt-2026-storycam" }))
      .mockResolvedValueOnce(
        jsonResponse({
          error: {
            code: "ContentPolicyViolation",
            message: "policy failure with seedance-secret and signed url https://signed.example"
          },
          id: "cgt-2026-storycam",
          status: "failed"
        })
      );
    const provider = createSeedanceVideoProvider({
      apiKey: "seedance-secret",
      fetch,
      model: "doubao-seedance-2-0-260128",
      polling: {
        enabled: true,
        intervalMs: 0,
        maxAttempts: 1
      }
    });

    const result = await provider.generateClip(input);

    expect(result).toMatchObject({
      errorCode: "SEEDANCE_POLICY_REFUSAL",
      ok: false,
      providerKind: "video",
      providerName: "seedance_2_0",
      providerRequestId: "cgt-2026-storycam",
      redactionApplied: true,
      retryable: false
    });
    expect(JSON.stringify(result)).not.toContain("seedance-secret");
    expect(JSON.stringify(result)).not.toContain("signed.example");
  });

  it("times out when polling never reaches a terminal task status", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "cgt-2026-storycam" }))
      .mockResolvedValue(jsonResponse({ id: "cgt-2026-storycam", status: "running" }));
    const provider = createSeedanceVideoProvider({
      apiKey: "seedance-secret",
      fetch,
      model: "doubao-seedance-2-0-260128",
      polling: {
        enabled: true,
        intervalMs: 0,
        maxAttempts: 2
      }
    });

    await expect(provider.generateClip(input)).resolves.toMatchObject({
      errorCode: "SEEDANCE_TIMEOUT",
      ok: false,
      providerRequestId: "cgt-2026-storycam",
      retryable: true
    });
  });

  it("maps rate limits and quota style HTTP errors to retryable provider failures", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "rate_limit",
            message: "too many requests with seedance-secret"
          }
        },
        429
      )
    );
    const provider = createSeedanceVideoProvider({
      apiKey: "seedance-secret",
      fetch,
      model: "doubao-seedance-2-0-260128"
    });

    const result = await provider.generateClip(input);

    expect(result).toMatchObject({
      errorCode: "SEEDANCE_QUOTA_OR_RATE_LIMIT",
      ok: false,
      redactionApplied: true,
      retryable: true
    });
    expect(JSON.stringify(result)).not.toContain("seedance-secret");
  });
});

function jsonResponse(body: unknown, status = 200) {
  return {
    json: () => Promise.resolve(body),
    ok: status >= 200 && status < 300,
    status
  } as Response;
}
