import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { loadStoryCamConfig } from "@/server/config";

export async function createServerSupabaseClient() {
  const config = loadStoryCamConfig();
  const cookieStore = await cookies();

  return createServerClient(config.supabase.url, config.supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. The proxy refresh path handles writes.
        }
      }
    }
  });
}
