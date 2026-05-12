import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    return NextResponse.json(
      {
        authenticated: true,
        user
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ authenticated: false, user: null }, { headers: { "Cache-Control": "no-store" } });
    }

    throw error;
  }
}
