import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createOpenRouterMultimodalProvider } from "./multimodalProvider";
import { createOpenRouterTextProvider } from "./textProvider";

vi.mock("server-only", () => ({}));

const outputSchema = z.object({
  title: z.string().min(1)
});

describe("openrouter text provider", () => {
  it("generates schema-validated text output through the Vercel AI SDK boundary", async () => {
    const generateObject = vi.fn().mockResolvedValue({ object: { title: "雨夜未发送" } });
    const provider = createOpenRouterTextProvider({
      apiKey: "openrouter-secret",
      buildPrompt: (input: { idea: string }) => ({
        prompt: `Create a StoryCam script for: ${input.idea}`,
        system: "Return only the requested structured StoryCam output."
      }),
      generateObject,
      model: "deepseek/deepseek-v4-pro",
      outputSchema,
      schemaDescription: "A tiny test schema.",
      schemaName: "storycam_test_output"
    });

    const result = await provider.generate({ idea: "雨夜便利店" });

    expect(result).toMatchObject({
      ok: true,
      providerKind: "text",
      providerName: "openrouter",
      value: { title: "雨夜未发送" }
    });
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("雨夜便利店"),
        schema: outputSchema,
        schemaDescription: "A tiny test schema.",
        schemaName: "storycam_test_output",
        system: expect.stringContaining("structured")
      })
    );
  });

  it("retries malformed JSON or invalid schema output and returns a redacted failure", async () => {
    const generateObject = vi.fn().mockResolvedValueOnce({ object: { title: "" } }).mockResolvedValueOnce({ object: { nope: true } });
    const provider = createOpenRouterTextProvider({
      apiKey: "openrouter-secret",
      buildPrompt: () => ({
        prompt: "Create a StoryCam script.",
        system: "Return structured JSON."
      }),
      generateObject,
      model: "deepseek/deepseek-v4-pro",
      outputSchema
    });

    const result = await provider.generate({ idea: "bad output please" });

    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      errorCode: "OPENROUTER_TEXT_INVALID_OUTPUT",
      ok: false,
      providerKind: "text",
      providerName: "openrouter",
      redactionApplied: true,
      retryable: true
    });
    expect(JSON.stringify(result)).not.toContain("openrouter-secret");
  });

  it("moves to a fallback model when the primary structured-output call fails", async () => {
    const generateObject = vi.fn().mockRejectedValueOnce(new Error("primary model structured output failed")).mockResolvedValueOnce({
      object: { title: "备用模型片名" }
    });
    const provider = createOpenRouterTextProvider({
      apiKey: "openrouter-secret",
      buildPrompt: () => ({
        prompt: "Create a StoryCam script.",
        system: "Return structured JSON."
      }),
      fallbackModels: ["deepseek/deepseek-v4-flash"],
      generateObject,
      maxAttempts: 2,
      model: "deepseek/deepseek-v4-pro",
      outputSchema
    });

    const result = await provider.generate({ idea: "structured fallback please" });

    expect(result).toMatchObject({
      ok: true,
      value: { title: "备用模型片名" }
    });
    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(generateObject.mock.calls[0]?.[0]?.model).not.toBe(generateObject.mock.calls[1]?.[0]?.model);
  });
});

describe("openrouter multimodal provider", () => {
  it("uses a separate multimodal provider kind and validates photo understanding output", async () => {
    const generateObject = vi.fn().mockResolvedValue({ object: { title: "便利店玻璃参考" } });
    const provider = createOpenRouterMultimodalProvider({
      apiKey: "openrouter-secret",
      buildPrompt: (input: { mediaAssetIds: string[] }) => ({
        prompt: `Analyze uploaded StoryCam media ids: ${input.mediaAssetIds.join(", ")}`,
        system: "Return stable visual descriptions without storage paths."
      }),
      generateObject,
      model: "deepseek/deepseek-v4-pro",
      outputSchema
    });

    const result = await provider.analyze({ mediaAssetIds: ["media-photo-1"] });

    expect(result).toMatchObject({
      ok: true,
      providerKind: "multimodal",
      providerName: "openrouter",
      value: { title: "便利店玻璃参考" }
    });
    expect(JSON.stringify(generateObject.mock.calls)).not.toContain("users/user-1/private.jpg");
  });
});
