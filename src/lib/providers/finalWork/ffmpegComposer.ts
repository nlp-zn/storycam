import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { providerFailure, providerSuccess } from "@/lib/providers/providerErrors";
import type { FinalWorkComposer, ProviderResult } from "@/lib/providers/types";

export type FinalWorkClipInput = {
  bytes: Uint8Array;
  durationSeconds: number;
  generatedClipId: string;
};

export type FfmpegComposerInput = {
  clips: FinalWorkClipInput[];
};

export type FfmpegComposerOutput = {
  bytes: Uint8Array;
  durationSeconds: number;
};

export type FfmpegRunner = (input: {
  concatListPath: string;
  inputPaths: string[];
  outputPath: string;
}) => Promise<void>;

export function createFfmpegFinalWorkComposer(
  runner: FfmpegRunner = runFfmpegConcat
): FinalWorkComposer<FfmpegComposerInput, FfmpegComposerOutput> {
  return {
    providerKind: "stitch",
    providerName: "ffmpeg",
    async compose(input) {
      return composeFinalWork(input, runner);
    }
  };
}

async function composeFinalWork(
  input: FfmpegComposerInput,
  runner: FfmpegRunner
): Promise<ProviderResult<FfmpegComposerOutput>> {
  if (input.clips.length < 1 || input.clips.length > 3) {
    return providerFailure(identity, new Error("Final work requires 1-3 clips."), {
      errorCode: "FINAL_WORK_INVALID_CLIP_COUNT",
      retryable: false
    });
  }

  const workDir = await mkdtemp(join(tmpdir(), "storycam-final-work-"));

  try {
    const inputPaths = await writeInputClips(workDir, input.clips);
    const concatListPath = join(workDir, "concat.txt");
    const outputPath = join(workDir, "final-work.mp4");

    await writeFile(concatListPath, inputPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n"));
    await runner({ concatListPath, inputPaths, outputPath });

    return providerSuccess(identity, {
      bytes: new Uint8Array(await readFile(outputPath)),
      durationSeconds: roundDuration(input.clips.reduce((sum, clip) => sum + clip.durationSeconds, 0))
    });
  } catch (error) {
    return providerFailure(identity, error, {
      errorCode: isMissingFfmpegError(error) ? "FFMPEG_NOT_CONFIGURED" : "FINAL_WORK_COMPOSE_FAILED",
      retryable: false
    });
  } finally {
    await rm(workDir, { force: true, recursive: true });
  }
}

async function writeInputClips(workDir: string, clips: FinalWorkClipInput[]) {
  return Promise.all(
    clips.map(async (clip, index) => {
      const path = join(workDir, `clip-${index + 1}.mp4`);

      await writeFile(path, clip.bytes);

      return path;
    })
  );
}

async function runFfmpegConcat({ concatListPath, outputPath }: Parameters<FfmpegRunner>[0]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-c",
      "copy",
      outputPath
    ]);

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg exited with code ${code ?? "unknown"}`));
    });
  });
}

const identity = {
  providerKind: "stitch",
  providerName: "ffmpeg"
} as const;

function roundDuration(value: number) {
  return Math.round(value * 10) / 10;
}

function isMissingFfmpegError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
