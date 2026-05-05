import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterChatModel } from "./vercelAiClient";

vi.mock("server-only", () => ({}));

const chatMock = vi.hoisted(() => vi.fn(() => ({ model: "openrouter-chat-model" })));
const imageModelMock = vi.hoisted(() => vi.fn(() => ({ model: "openrouter-image-model" })));
const createOpenRouterMock = vi.hoisted(() => vi.fn(() => ({ chat: chatMock })));
const createOpenRouterFetchMock = vi.hoisted(() => vi.fn<() => typeof fetch | undefined>(() => undefined));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: createOpenRouterMock
}));

vi.mock("./openrouterProxyFetch", () => ({
  createOpenRouterFetch: createOpenRouterFetchMock
}));

vi.mock("ai", () => ({
  extractJsonMiddleware: vi.fn(() => ({ middleware: "extract-json" })),
  generateImage: vi.fn(),
  generateText: vi.fn(),
  Output: {
    object: vi.fn((input) => input)
  },
  wrapLanguageModel: vi.fn((input) => input.model)
}));

describe("vercel AI OpenRouter client", () => {
  beforeEach(() => {
    createOpenRouterMock.mockClear();
    createOpenRouterFetchMock.mockReset();
    createOpenRouterFetchMock.mockReturnValue(undefined);
    chatMock.mockClear();
    imageModelMock.mockClear();
  });

  it("requires structured-output parameters when creating OpenRouter chat models", () => {
    const model = createOpenRouterChatModel({
      apiKey: "openrouter-secret",
      model: "deepseek/deepseek-v4-flash"
    });

    expect(model).toEqual({ model: "openrouter-chat-model" });
    expect(createOpenRouterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "openrouter-secret"
      })
    );
    expect(chatMock).toHaveBeenCalledWith(
      "deepseek/deepseek-v4-flash",
      expect.objectContaining({
        plugins: [{ id: "response-healing" }],
        provider: {
          require_parameters: true
        }
      })
    );
  });

  it("passes proxy-aware fetch to OpenRouter when proxy env is configured", () => {
    const proxiedFetch = vi.fn() as unknown as typeof fetch;
    createOpenRouterFetchMock.mockReturnValue(proxiedFetch);

    createOpenRouterChatModel({
      apiKey: "openrouter-secret",
      model: "deepseek/deepseek-v4-flash"
    });

    expect(createOpenRouterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fetch: proxiedFetch
      })
    );
  });
});
