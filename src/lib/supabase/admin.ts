import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/types";
import { loadStoryCamConfig } from "@/server/config";

export function createSupabaseAdminClient() {
  const config = loadStoryCamConfig();

  return createClient<Database>(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
