import { describe, expect, it, vi } from "vitest";
import { createInferenceShImageProvider } from "./imageProvider";

describe("createInferenceShImageProvider", () => {
  it("runs the configured app and returns the first downloaded image", async () => {
    const runTask = vi.fn().mockResolvedValue({
      output: { images: ["https://example.com/generated.png"] },
      status: 10
    });
    const fetchImage = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png"
    });
    const provider = createInferenceShImageProvider({
      apiKey: "inference-key",
      app: "openai/gpt-image-2",
      buildPrompt: () => ({
        height: 864,
        prompt: "draw a character sheet",
        quality: "high",
        width: 1536
      }),
      fetchImage,
      runTask
    });

    const result = await provider.generateImage({});

    expect(runTask).toHaveBeenCalledWith(
      {
        app: "openai/gpt-image-2",
        input: {
          height: 864,
          n: 1,
          output_format: "png",
          prompt: "draw a character sheet",
          quality: "high",
          width: 1536
        }
      },
      { stream: false, wait: true }
    );
    expect(fetchImage).toHaveBeenCalledWith("https://example.com/generated.png");
    expect(result).toMatchObject({
      ok: true,
      providerKind: "image",
      providerName: "inference_sh",
      value: {
        mimeType: "image/png",
        model: "openai/gpt-image-2"
      }
    });
  });

  it("rejects missing images as retryable invalid output", async () => {
    const provider = createInferenceShImageProvider({
      apiKey: "inference-key",
      app: "openai/gpt-image-2",
      buildPrompt: () => ({ prompt: "draw" }),
      fetchImage: vi.fn(),
      maxAttempts: 1,
      runTask: vi.fn().mockResolvedValue({
        output: { images: [] },
        status: 10
      })
    });

    await expect(provider.generateImage({})).resolves.toMatchObject({
      errorCode: "INFERENCE_SH_IMAGE_INVALID_OUTPUT",
      ok: false,
      retryable: true
    });
  });

  it("maps missing app requirements to a nonretryable failure", async () => {
    const error = Object.assign(new Error("requirements not met"), { statusCode: 412 });
    const provider = createInferenceShImageProvider({
      apiKey: "inference-key",
      app: "openai/gpt-image-2",
      buildPrompt: () => ({ prompt: "draw" }),
      fetchImage: vi.fn(),
      runTask: vi.fn().mockRejectedValue(error)
    });

    await expect(provider.generateImage({})).resolves.toMatchObject({
      errorCode: "INFERENCE_SH_IMAGE_REQUIREMENTS_NOT_MET",
      ok: false,
      retryable: false
    });
  });

  it("submits an async image task with wait false", async () => {
    const runTask = vi.fn().mockResolvedValue({
      id: "task-123",
      status: "queued"
    });
    const provider = createInferenceShImageProvider({
      apiKey: "inference-key",
      app: "openai/gpt-image-2",
      buildPrompt: () => ({ prompt: "draw async" }),
      getTask: vi.fn(),
      runTask
    });

    await expect(provider.submitImageTask({})).resolves.toMatchObject({
      ok: true,
      value: {
        providerRequestId: "task-123"
      }
    });
    expect(runTask).toHaveBeenCalledWith(
      expect.objectContaining({
        app: "openai/gpt-image-2",
        input: expect.objectContaining({
          prompt: "draw async"
        })
      }),
      { stream: false, wait: false }
    );
  });

  it("resolves a running async image task without downloading", async () => {
    const fetchImage = vi.fn();
    const provider = createInferenceShImageProvider({
      apiKey: "inference-key",
      app: "openai/gpt-image-2",
      buildPrompt: () => ({ prompt: "draw" }),
      fetchImage,
      getTask: vi.fn().mockResolvedValue({
        id: "task-123",
        status: "running"
      }),
      runTask: vi.fn()
    });

    await expect(provider.resolveImageTask("task-123")).resolves.toMatchObject({
      ok: true,
      value: {
        status: "running"
      }
    });
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it("resolves a completed async image task by downloading output images", async () => {
    const fetchImage = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([4, 5, 6]),
      mimeType: "image/webp"
    });
    const provider = createInferenceShImageProvider({
      apiKey: "inference-key",
      app: "openai/gpt-image-2",
      buildPrompt: () => ({ prompt: "draw" }),
      fetchImage,
      getTask: vi.fn().mockResolvedValue({
        output: { images: ["https://example.com/task.webp"] },
        status: "completed"
      }),
      runTask: vi.fn()
    });

    await expect(provider.resolveImageTask("task-123")).resolves.toMatchObject({
      ok: true,
      value: {
        image: {
          mimeType: "image/webp",
          model: "openai/gpt-image-2"
        },
        status: "succeeded"
      }
    });
    expect(fetchImage).toHaveBeenCalledWith("https://example.com/task.webp");
  });

  it("maps official InferenceError failures to redacted provider failure", async () => {
    const error = new Error("upstream failed");
    error.name = "InferenceError";
    const provider = createInferenceShImageProvider({
      apiKey: "inference-key",
      app: "openai/gpt-image-2",
      buildPrompt: () => ({ prompt: "draw" }),
      getTask: vi.fn().mockRejectedValue(error),
      runTask: vi.fn()
    });

    await expect(provider.resolveImageTask("task-123")).resolves.toMatchObject({
      errorCode: "INFERENCE_SH_IMAGE_PROVIDER_FAILED",
      ok: false,
      retryable: true
    });
  });
});
