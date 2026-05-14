import { describe, expect, it } from "vitest";
import { createDiscoverySampleSignedAssets } from "./discoverySampleAssets";
import type { SignedUrlStorageClient } from "./mediaStore";

function makeSigningClient(failPath?: string) {
  const calls: Array<{ bucket: string; expiresIn: number; path: string }> = [];

  const client: SignedUrlStorageClient = {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string, expiresIn: number) {
            calls.push({ bucket, expiresIn, path });

            if (path === failPath) {
              return {
                data: null,
                error: { message: "missing" }
              };
            }

            return {
              data: { signedUrl: `https://signed.example/${path}` },
              error: null
            };
          }
        };
      }
    }
  };

  return { calls, client };
}

describe("createDiscoverySampleSignedAssets", () => {
  it("signs only the fixed discovery sample assets from the generated bucket", async () => {
    const { calls, client } = makeSigningClient();

    const result = await createDiscoverySampleSignedAssets(client, 123);

    expect(result.unavailableIds).toEqual([]);
    expect(result.signedUrlExpiresIn).toBe(123);
    expect(result.assets).toHaveLength(8);
    expect(result.assets.map((asset) => asset.id)).toEqual([
      "sample-03",
      "sample-02",
      "sample-08",
      "sample-05",
      "sample-01",
      "sample-07",
      "sample-04",
      "sample-06"
    ]);
    expect(calls).toHaveLength(16);
    expect(calls.every((call) => call.bucket === "storycam-generated")).toBe(true);
    expect(calls.every((call) => call.expiresIn === 123)).toBe(true);
    expect(calls.map((call) => call.path)).toContain("samples/discovery/storycam-sample-01.mp4");
    expect(calls.map((call) => call.path)).toContain("samples/discovery/storycam-sample-01.jpg");
  });

  it("skips samples whose poster or video cannot be signed", async () => {
    const { client } = makeSigningClient("samples/discovery/storycam-sample-03.mp4");

    const result = await createDiscoverySampleSignedAssets(client, 123);

    expect(result.unavailableIds).toEqual(["sample-03"]);
    expect(result.assets.map((asset) => asset.id)).not.toContain("sample-03");
    expect(result.assets).toHaveLength(7);
  });
});
