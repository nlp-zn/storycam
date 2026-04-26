import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isProviderFailure, providerFailure, providerSuccess } from "./providerErrors";
import type { FinalWorkComposer, ProviderResult, TextGenerationProvider, VideoGenerationProvider } from "./types";

describe("provider contracts", () => {
  it("returns normalized success shapes", () => {
    const result = providerSuccess(
      {
        providerKind: "text",
        providerName: "mock",
        providerRequestId: "request-1"
      },
      { title: "Rain" }
    );

    expect(result).toEqual({
      ok: true,
      providerKind: "text",
      providerName: "mock",
      providerRequestId: "request-1",
      value: { title: "Rain" }
    });
  });

  it("redacts provider failures through the privacy pipeline", () => {
    const result = providerFailure(
      {
        providerKind: "video",
        providerName: "seedance_2_0"
      },
      {
        body: "raw prompt packet",
        code: "PROVIDER_TIMEOUT",
        message: "private input leaked"
      },
      { retryable: true }
    );

    expect(result).toEqual({
      errorCode: "PROVIDER_TIMEOUT",
      ok: false,
      providerKind: "video",
      providerName: "seedance_2_0",
      redactedError: "Provider request failed.",
      redactionApplied: true,
      retryable: true
    });
    expect(JSON.stringify(result)).not.toContain("private input");
    expect(JSON.stringify(result)).not.toContain("raw prompt packet");
    expect(isProviderFailure(result)).toBe(true);
  });

  it("supports narrow provider interfaces without implementation coupling", async () => {
    const textProvider = {
      providerKind: "text",
      providerName: "mock",
      async generate(input: { idea: string }): Promise<ProviderResult<{ title: string }>> {
        return providerSuccess(this, { title: input.idea });
      }
    } satisfies TextGenerationProvider<{ idea: string }, { title: string }>;
    const videoProvider = {
      providerKind: "video",
      providerName: "mock",
      async generateClip(_input: { packetId: string }): Promise<ProviderResult<{ mediaAssetId: string }>> {
        return providerSuccess(this, { mediaAssetId: "media-1" });
      }
    } satisfies VideoGenerationProvider<{ packetId: string }, { mediaAssetId: string }>;
    const finalWorkComposer = {
      providerKind: "stitch",
      providerName: "ffmpeg",
      async compose(_input: { clipIds: string[] }): Promise<ProviderResult<{ mediaAssetId: string }>> {
        return providerSuccess(this, { mediaAssetId: "media-final-1" });
      }
    } satisfies FinalWorkComposer<{ clipIds: string[] }, { mediaAssetId: string }>;

    await expect(textProvider.generate({ idea: "Rain" })).resolves.toMatchObject({ ok: true });
    await expect(videoProvider.generateClip({ packetId: "packet-1" })).resolves.toMatchObject({ ok: true });
    await expect(finalWorkComposer.compose({ clipIds: ["clip-1"] })).resolves.toMatchObject({ ok: true });
  });

  it("keeps provider implementations out of the app router", () => {
    const appFiles = listSourceFiles(join(process.cwd(), "src/app"));
    const forbiddenImports = appFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");
      return content.match(/@\/lib\/providers\/(mock|openrouter|seedance|finalWork)\//g) ?? [];
    });

    expect(forbiddenImports).toEqual([]);
  });
});

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return listSourceFiles(path);
    }

    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}
