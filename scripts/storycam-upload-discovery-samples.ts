import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const bucket = "storycam-generated";
const storagePrefix = "samples/discovery";
const defaultSourceDir = resolve(process.cwd(), ".temp/storycam-discovery-samples");
const posterOutputDir = resolve(process.cwd(), ".temp/storycam-discovery-posters");

type DiscoverySampleUploadClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Buffer,
        options: { contentType: "image/jpeg" | "video/mp4"; upsert: true }
      ): Promise<{ error: { message?: string } | null }>;
    };
  };
};

const samples = [
  { fileName: "storycam-样片-1.mp4", id: "sample-01" },
  { fileName: "storycam-样片-2.mp4", id: "sample-02" },
  { fileName: "storycam-样片-3.mp4", id: "sample-03" },
  { fileName: "storycam-样片-4.mp4", id: "sample-04" },
  { fileName: "storycam-样片-5.mp4", id: "sample-05" },
  { fileName: "storycam-样片-6.mp4", id: "sample-06" },
  { fileName: "storycam-样片-7.mp4", id: "sample-07" },
  { fileName: "storycam-样片-8.mp4", id: "sample-08" }
] as const;

loadDotEnvFile(".env.local");
loadDotEnvFile(".env");

async function main() {
  const sourceDir = resolve(process.env.DISCOVERY_SAMPLE_SOURCE_DIR ?? defaultSourceDir);
  const supabase = createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  await mkdir(posterOutputDir, { recursive: true });

  for (const sample of samples) {
    const videoPath = join(sourceDir, sample.fileName);

    if (!existsSync(videoPath)) {
      throw new Error(`Missing discovery sample file: ${join(sourceDir, sample.fileName)}`);
    }

    const posterPath = join(posterOutputDir, `${sample.id}.jpg`);
    await createPoster(videoPath, posterPath);

    await uploadObject(supabase, `${storagePrefix}/storycam-${sample.id}.mp4`, await readFile(videoPath), "video/mp4");
    await uploadObject(supabase, `${storagePrefix}/storycam-${sample.id}.jpg`, await readFile(posterPath), "image/jpeg");
    console.log(`Uploaded ${sample.id} from ${basename(videoPath)}.`);
  }

  await rm(posterOutputDir, { force: true, recursive: true });
  console.log(`Discovery samples uploaded to ${bucket}/${storagePrefix}.`);
}

async function createPoster(videoPath: string, posterPath: string) {
  const result = spawnSync("ffmpeg", ["-y", "-ss", "3", "-i", videoPath, "-frames:v", "1", "-vf", "scale=960:-1", posterPath], {
    stdio: "pipe"
  });

  if (result.status !== 0) {
    throw new Error(`Failed to create poster for ${basename(videoPath)}.`);
  }
}

async function uploadObject(
  supabase: DiscoverySampleUploadClient,
  path: string,
  body: Buffer,
  contentType: "image/jpeg" | "video/mp4"
) {
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: true
  });

  if (error) {
    throw new Error(`Failed to upload ${basename(path)}.`);
  }
}

function loadDotEnvFile(fileName: string) {
  const filePath = resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());

    process.env[key] ??= value;
  }
}

function unquoteEnvValue(value: string) {
  const first = value.at(0);
  const last = value.at(-1);

  if ((first === `"` && last === `"`) || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }

  return value;
}

function requiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Discovery sample upload failed.");
  process.exit(1);
});
