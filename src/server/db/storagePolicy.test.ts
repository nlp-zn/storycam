import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260426033600_storycam_phase1_schema.sql"),
  "utf8"
);

const storyCamBuckets = ["storycam-uploads", "storycam-generated", "storycam-mock"] as const;
const storagePolicyActions = ["select", "insert", "update", "delete"] as const;

describe("storage-policy migration baseline", () => {
  it("keeps every StoryCam bucket private", () => {
    for (const bucket of storyCamBuckets) {
      expect(migrationSql).toContain(`'${bucket}', '${bucket}', false`);
    }

    expect(migrationSql).not.toMatch(/'storycam-[^']+',\s*'storycam-[^']+',\s*true/);
  });

  it("creates storage object policies for every object action", () => {
    for (const action of storagePolicyActions) {
      expect(migrationSql).toContain(`storycam_storage_${action}_own`);
      expect(migrationSql).toContain(`on storage.objects for ${action}`);
    }
  });

  it("scopes object access to users/{auth.uid()} paths in StoryCam buckets", () => {
    expect(migrationSql).toContain("bucket_id in ('storycam-uploads', 'storycam-generated', 'storycam-mock')");
    expect(migrationSql).toContain("(storage.foldername(name))[1] = 'users'");
    expect(migrationSql).toContain("(storage.foldername(name))[2] = auth.uid()::text");
  });
});
