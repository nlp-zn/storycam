import type { AuthenticatedUser } from "./requireUser";

export class ForbiddenAdminError extends Error {
  constructor() {
    super("Admin access required.");
    this.name = "ForbiddenAdminError";
  }
}

export function assertStoryCamAdmin(user: AuthenticatedUser, env: Record<string, string | undefined> = process.env): void {
  if (!isStoryCamAdmin(user, env)) {
    throw new ForbiddenAdminError();
  }
}

export function isStoryCamAdmin(user: AuthenticatedUser, env: Record<string, string | undefined> = process.env): boolean {
  if (!user.email) {
    return false;
  }

  return adminEmailSet(env).has(normalizeEmail(user.email));
}

function adminEmailSet(env: Record<string, string | undefined>): Set<string> {
  return new Set((env.ADMIN_EMAILS ?? "").split(",").map(normalizeEmail).filter(Boolean));
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
