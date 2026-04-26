import { randomUUID } from "node:crypto";
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

const localBypassUserEmail = "storycam-local-dev@example.test";
let localBypassUserPromise: Promise<AuthenticatedUser> | undefined;

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(client?: ClaimsClient): Promise<AuthenticatedUser> {
  if (!client && isLocalAuthBypassEnabled()) {
    return getOrCreateLocalBypassUser();
  }

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

export function isLocalAuthBypassEnabled(env: Record<string, string | undefined> = process.env) {
  const flag = env.STORYCAM_LOCAL_AUTH_BYPASS?.trim().toLowerCase();

  if (flag !== "1" && flag !== "true") {
    return false;
  }

  if (env.NODE_ENV === "production") {
    return false;
  }

  return isLocalSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
}

function getOrCreateLocalBypassUser() {
  localBypassUserPromise ??= ensureLocalBypassUser().catch((error) => {
    localBypassUserPromise = undefined;
    throw error;
  });

  return localBypassUserPromise;
}

async function ensureLocalBypassUser(): Promise<AuthenticatedUser> {
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createSupabaseAdminClient();
  const existing = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (existing.error) {
    throw new UnauthorizedError();
  }

  const user = existing.data.users.find((item) => item.email === localBypassUserEmail);

  if (user) {
    return { id: user.id, email: user.email ?? localBypassUserEmail };
  }

  const password = `StoryCam-local-${randomUUID()}-aA1!`;
  const created = await supabase.auth.admin.createUser({
    email: localBypassUserEmail,
    email_confirm: true,
    password,
    user_metadata: {
      source: "storycam:local-auth-bypass"
    }
  });

  if (created.error || !created.data.user) {
    throw new UnauthorizedError();
  }

  return { id: created.data.user.id, email: created.data.user.email ?? localBypassUserEmail };
}

function isLocalSupabaseUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}
