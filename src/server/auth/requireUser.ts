import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthenticatedUser = {
  id: string;
  email?: string;
};

type ClaimsClient = {
  auth: {
    getClaims: () => Promise<{
      data: { claims?: Record<string, unknown> } | null;
      error: { message?: string } | null;
    }>;
  };
};

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(client?: ClaimsClient): Promise<AuthenticatedUser> {
  const supabase = client ?? (await createServerSupabaseClient());
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : undefined;

  if (error || !userId) {
    throw new UnauthorizedError();
  }

  return {
    id: userId,
    ...(typeof claims?.email === "string" ? { email: claims.email } : {})
  };
}
