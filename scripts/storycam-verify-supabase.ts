import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/server/db/types";
import { seedStoryCamSample } from "./storycam-seed";

type StoryCamTable = keyof Database["public"]["Tables"];
type StoryCamPrivateBucket = "storycam-generated" | "storycam-mock" | "storycam-uploads";

const storyCamBuckets: StoryCamPrivateBucket[] = ["storycam-uploads", "storycam-generated", "storycam-mock"];

loadDotEnvFile(".env.local");
loadDotEnvFile(".env");

async function main() {
  if (process.env.STORYCAM_RUN_SUPABASE_VERIFY !== "1") {
    console.log("Skipped Supabase verification. Set STORYCAM_RUN_SUPABASE_VERIFY=1 for a local/test project.");
    return;
  }

  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createAdminClient(url, serviceRoleKey);
  const tempUsers: TempUser[] = [];
  const storageCleanup: Array<{ bucket: StoryCamPrivateBucket; path: string }> = [];

  try {
    await assertBucketsArePrivate(admin);
    const owner = await createTempUser(url, anonKey, admin, "owner");

    tempUsers.push(owner);

    const other = await createTempUser(url, anonKey, admin, "other");

    tempUsers.push(other);

    const seeded = await seedStoryCamSample(admin, owner.id);

    await assertSeededRowsVisibleOnlyToOwner(owner.client, other.client, seeded);
    await assertCrossUserInsertBlocked(other.client, owner.id);
    await assertStoragePolicies(owner, other, storageCleanup);

    console.log("Supabase verification succeeded.");
    console.log("Verified seed metadata, cross-user RLS isolation, and private Storage bucket policies.");
  } finally {
    await cleanupStorage(admin, storageCleanup);
    await cleanupUsers(admin, tempUsers);
  }
}

function createAdminClient(url: string, serviceRoleKey: string) {
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function createTempUser(
  url: string,
  anonKey: string,
  admin: SupabaseClient<Database>,
  label: "other" | "owner"
): Promise<TempUser> {
  const password = `StoryCam-${randomUUID()}-aA1!`;
  const email = `storycam-verify-${Date.now()}-${label}-${randomUUID().slice(0, 8)}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: {
      source: "storycam:supabase-verify"
    }
  });

  if (created.error || !created.data.user) {
    throw new Error(`Failed to create temporary ${label} user.`);
  }

  const client = createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (signedIn.error || !signedIn.data.session) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    throw new Error(`Failed to sign in temporary ${label} user.`);
  }

  return {
    client,
    id: created.data.user.id
  };
}

async function assertBucketsArePrivate(admin: SupabaseClient<Database>) {
  for (const bucket of storyCamBuckets) {
    const { data, error } = await admin.storage.getBucket(bucket);

    if (error || !data) {
      throw new Error(`Missing StoryCam Storage bucket: ${bucket}`);
    }

    if (data.public) {
      throw new Error(`StoryCam Storage bucket must be private: ${bucket}`);
    }
  }
}

async function assertSeededRowsVisibleOnlyToOwner(
  owner: SupabaseClient<Database>,
  other: SupabaseClient<Database>,
  seeded: Awaited<ReturnType<typeof seedStoryCamSample>>
) {
  const rows: Array<{ id: string; table: StoryCamTable }> = [
    { id: seeded.sessionId, table: "storycam_sessions" },
    { id: seeded.scriptArtifactId, table: "storycam_artifacts" },
    { id: seeded.generatedClipArtifactId, table: "storycam_artifacts" },
    { id: seeded.jobId, table: "generation_jobs" },
    { id: seeded.mediaAssetId, table: "media_assets" },
    { id: seeded.providerRequestId, table: "provider_requests" }
  ];

  for (const row of rows) {
    await assertRowCount(owner, row.table, row.id, 1, "owner");
    await assertRowCount(other, row.table, row.id, 0, "other user");
  }
}

async function assertRowCount(
  client: SupabaseClient<Database>,
  table: StoryCamTable,
  id: string,
  expectedCount: number,
  label: string
) {
  const { data, error } = await client.from(table).select("id").eq("id", id);

  if (error) {
    throw new Error(`Failed to read ${table} as ${label}.`);
  }

  if ((data?.length ?? 0) !== expectedCount) {
    throw new Error(`Unexpected ${table} visibility for ${label}.`);
  }
}

async function assertCrossUserInsertBlocked(client: SupabaseClient<Database>, ownerUserId: string) {
  const { data, error } = await client
    .from("storycam_sessions")
    .insert({
      core_group_target_count: 1,
      generation_mode: "mock",
      planned_duration_seconds: 12,
      status: "draft",
      user_id: ownerUserId
    })
    .select("id")
    .single();

  if (!error || data) {
    throw new Error("RLS allowed a user to insert a StoryCam session for another user.");
  }
}

async function assertStoragePolicies(
  owner: TempUser,
  other: TempUser,
  cleanup: Array<{ bucket: StoryCamPrivateBucket; path: string }>
) {
  const bucket: StoryCamPrivateBucket = "storycam-mock";
  const path = `users/${owner.id}/sessions/storycam-verify/mock/storage-policy.png`;
  const body = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
  const upload = await owner.client.storage.from(bucket).upload(path, body, {
    contentType: "image/png",
    upsert: false
  });

  if (upload.error) {
    throw new Error("Owner could not upload to their StoryCam private Storage path.");
  }

  cleanup.push({ bucket, path });

  const ownerDownload = await owner.client.storage.from(bucket).download(path);

  if (ownerDownload.error || !ownerDownload.data) {
    throw new Error("Owner could not download their StoryCam private Storage object.");
  }

  const otherDownload = await other.client.storage.from(bucket).download(path);

  if (!otherDownload.error || otherDownload.data) {
    throw new Error("Storage policy allowed another user to download the owner's object.");
  }

  const otherUpload = await other.client.storage.from(bucket).upload(path, body, {
    contentType: "image/png",
    upsert: true
  });

  if (!otherUpload.error) {
    throw new Error("Storage policy allowed another user to write into the owner's path.");
  }
}

async function cleanupStorage(
  admin: SupabaseClient<Database>,
  objects: Array<{ bucket: StoryCamPrivateBucket; path: string }>
) {
  for (const object of objects) {
    await admin.storage.from(object.bucket).remove([object.path]);
  }
}

async function cleanupUsers(admin: SupabaseClient<Database>, users: TempUser[]) {
  await Promise.all(users.map((user) => admin.auth.admin.deleteUser(user.id)));
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

type TempUser = {
  client: SupabaseClient<Database>;
  id: string;
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Supabase verification failed.");
  process.exit(1);
});
