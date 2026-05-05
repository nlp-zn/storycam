import { fetch as undiciFetch, ProxyAgent } from "undici";

const proxyAgentCache = new Map<string, ProxyAgent>();
type ProxyEnv = Record<string, string | undefined>;

export function createOpenRouterFetch(env: ProxyEnv = process.env): typeof fetch | undefined {
  const proxyUrl = proxyUrlFromEnv(env);

  if (!proxyUrl) {
    return undefined;
  }

  const dispatcher = proxyAgentFor(proxyUrl);

  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...init,
      dispatcher
    } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>) as unknown as typeof fetch;
}

export function proxyUrlFromEnv(env: ProxyEnv = process.env) {
  return env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy ?? env.ALL_PROXY ?? env.all_proxy;
}

function proxyAgentFor(proxyUrl: string) {
  const existing = proxyAgentCache.get(proxyUrl);

  if (existing) {
    return existing;
  }

  const dispatcher = new ProxyAgent(proxyUrl);
  proxyAgentCache.set(proxyUrl, dispatcher);

  return dispatcher;
}
