import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/auth/requireUser";

export async function GET() {
  try {
    const user = await requireUser();

    return NextResponse.json({
      authenticated: true,
      user
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    throw error;
  }
}
