import "server-only";

import { createClient } from "@supabase/supabase-js";
import { loadStoryCamConfig } from "@/server/config";

export function createSupabaseAdminClient() {
  const config = loadStoryCamConfig();

  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
