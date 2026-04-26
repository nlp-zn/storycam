import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createFfmpegFinalWorkComposer, type FfmpegRunner } from "./ffmpegComposer";

const clip = (generatedClipId: string, bytes: string, durationSeconds = 4) => ({
  bytes: new TextEncoder().encode(bytes),
  durationSeconds,
  generatedClipId
});

describe("ffmpeg final work composer", () => {
  it("creates a new final work even for one clip", async () => {
    const runner: FfmpegRunner = async ({ inputPaths, outputPath }) => {
      await writeFile(outputPath, await readFile(inputPaths[0] ?? ""));
    };

    const result = await createFfmpegFinalWorkComposer(runner).compose({
      clips: [clip("clip-1", "one", 4.2)]
    });

    expect(result).toMatchObject({
      ok: true,
      providerKind: "stitch",
      providerName: "ffmpeg",
      value: {
        durationSeconds: 4.2
      }
    });
    expect(result.ok && new TextDecoder().decode(result.value.bytes)).toBe("one");
  });

  it("passes 2-3 clips to ffmpeg in order", async () => {
    const seenInputs: string[] = [];
    const runner: FfmpegRunner = async ({ inputPaths, outputPath }) => {
      seenInputs.push(...inputPaths);
      const bytes = await Promise.all(inputPaths.map((path) => readFile(path)));

      await writeFile(outputPath, Buffer.concat(bytes));
    };

    const result = await createFfmpegFinalWorkComposer(runner).compose({
      clips: [clip("clip-1", "one", 4), clip("clip-2", "two", 5), clip("clip-3", "three", 6)]
    });

    expect(seenInputs.map((path) => path.split("/").at(-1))).toEqual(["clip-1.mp4", "clip-2.mp4", "clip-3.mp4"]);
    expect(result.ok && new TextDecoder().decode(result.value.bytes)).toBe("onetwothree");
    expect(result.ok && result.value.durationSeconds).toBe(15);
  });

  it("returns a redacted configuration error when ffmpeg is missing", async () => {
    const runner: FfmpegRunner = async () => {
      throw Object.assign(new Error("spawn ffmpeg ENOENT with /private/path"), { code: "ENOENT" });
    };

    const result = await createFfmpegFinalWorkComposer(runner).compose({
      clips: [clip("clip-1", "one")]
    });

    expect(result).toEqual({
      errorCode: "FFMPEG_NOT_CONFIGURED",
      ok: false,
      providerKind: "stitch",
      providerName: "ffmpeg",
      redactedError: "Provider request failed.",
      redactionApplied: true,
      retryable: false
    });
  });

  it("rejects invalid clip counts", async () => {
    const result = await createFfmpegFinalWorkComposer(async () => undefined).compose({
      clips: []
    });

    expect(result).toMatchObject({
      errorCode: "FINAL_WORK_INVALID_CLIP_COUNT",
      ok: false,
      retryable: false
    });
  });
});
