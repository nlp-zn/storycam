import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { assertUnsafeRequestOrigin, OriginGuardError, originGuardResponse } from "@/server/security/originGuard";

export async function proxy(request: NextRequest) {
  if (new URL(request.url).pathname.startsWith("/api/")) {
    try {
      assertUnsafeRequestOrigin(request);
    } catch (error) {
      if (error instanceof OriginGuardError) {
        return originGuardResponse(error);
      }
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"
  ]
};
