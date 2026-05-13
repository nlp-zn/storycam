import { NextResponse, type NextRequest } from "next/server";
import { assertUnsafeRequestOrigin, OriginGuardError } from "./src/server/security/originGuard";

export function middleware(request: NextRequest) {
  try {
    assertUnsafeRequestOrigin(request);
    return NextResponse.next();
  } catch (error) {
    if (error instanceof OriginGuardError) {
      return NextResponse.json(
        {
          error: error.code,
          redactedError: "Request origin is not allowed.",
          redactionApplied: true
        },
        { status: 403 }
      );
    }

    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/api/:path*"]
};
