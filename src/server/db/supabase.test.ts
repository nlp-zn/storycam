import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260426033600_storycam_phase1_schema.sql"),
  "utf8"
);

const requiredTables = [
  "storycam_sessions",
  "storycam_artifacts",
  "generation_jobs",
  "media_assets",
  "provider_requests"
] as const;

describe("supabase-db migration baseline", () => {
  it("creates the required StoryCam metadata tables with user ownership", () => {
    for (const table of requiredTables) {
      expect(migrationSql).toContain(`create table if not exists public.${table}`);
      expect(migrationSql).toMatch(new RegExp(`create table if not exists public\\.${table}[\\s\\S]*user_id uuid not null`));
    }
  });

  it("enables row-level security for every StoryCam table", () => {
    for (const table of requiredTables) {
      expect(migrationSql).toContain(`alter table public.${table} enable row level security;`);
      expect(migrationSql).toContain(`'${table}'`);
    }

    expect(migrationSql).toContain("policy_name := target_table || '_select_own';");
    expect(migrationSql).toContain("policy_name := target_table || '_insert_own';");
    expect(migrationSql).toContain("policy_name := target_table || '_update_own';");
    expect(migrationSql).toContain("policy_name := target_table || '_delete_own';");
    expect(migrationSql).toContain("for select using (auth.uid() = user_id)");
    expect(migrationSql).toContain("for insert with check (auth.uid() = user_id)");
    expect(migrationSql).toContain("for update using (auth.uid() = user_id) with check (auth.uid() = user_id)");
    expect(migrationSql).toContain("for delete using (auth.uid() = user_id)");
  });

  it("creates private StoryCam storage buckets", () => {
    expect(migrationSql).toContain("'storycam-uploads', 'storycam-uploads', false");
    expect(migrationSql).toContain("'storycam-generated', 'storycam-generated', false");
    expect(migrationSql).toContain("'storycam-mock', 'storycam-mock', false");
  });

  it("keeps the migration idempotent for repeated local runs", () => {
    expect(migrationSql).toContain("create table if not exists");
    expect(migrationSql).toContain("create index if not exists");
    expect(migrationSql).toContain("on conflict (id) do update");
    expect(migrationSql).toContain("if not exists (select 1 from pg_policies");
  });

  it("defines the session soft delete transaction helper", () => {
    expect(migrationSql).toContain("create or replace function public.soft_delete_storycam_session");
    expect(migrationSql).toContain("update public.generation_jobs");
    expect(migrationSql).toContain("when status in ('queued', 'running') then 'expired'");
    expect(migrationSql).toContain("update public.storycam_artifacts");
    expect(migrationSql).toContain("update public.media_assets");
    expect(migrationSql).toContain("update public.storycam_sessions");
    expect(migrationSql).toContain("where user_id = target_user_id");
  });
});
