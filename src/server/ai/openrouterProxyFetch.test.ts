import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterFetch, proxyUrlFromEnv } from "./openrouterProxyFetch";

const undiciFetchMock = vi.hoisted(() => vi.fn(() => Promise.resolve(new Response("ok"))));
const proxyAgentMock = vi.hoisted(() =>
  vi.fn(function ProxyAgent(this: { proxyUrl: string }, url: string) {
    this.proxyUrl = url;
  })
);

vi.mock("undici", () => ({
  fetch: undiciFetchMock,
  ProxyAgent: proxyAgentMock
}));

describe("openrouter proxy fetch", () => {
  beforeEach(() => {
    undiciFetchMock.mockClear();
    proxyAgentMock.mockClear();
  });

  it("does not create a custom fetch when no proxy is configured", () => {
    expect(createOpenRouterFetch({})).toBeUndefined();
  });

  it("prefers HTTPS proxy env values", async () => {
    const openrouterFetch = createOpenRouterFetch({
      ALL_PROXY: "socks5://127.0.0.1:6478",
      HTTPS_PROXY: "http://127.0.0.1:6478"
    });

    expect(proxyUrlFromEnv({ HTTPS_PROXY: "http://127.0.0.1:6478" })).toBe("http://127.0.0.1:6478");
    expect(openrouterFetch).toBeDefined();

    await openrouterFetch?.("https://openrouter.ai/api/v1/models");

    expect(proxyAgentMock).toHaveBeenCalledWith("http://127.0.0.1:6478");
    expect(undiciFetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({
        dispatcher: { proxyUrl: "http://127.0.0.1:6478" }
      })
    );
  });
});
