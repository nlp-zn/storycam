import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isLocalAuthBypassEnabled, localAuthBypassDisabledCookieName } from "@/server/auth/requireUser";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return NextResponse.json({ ok: false, error: "sign_out_failed" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });

  if (isLocalAuthBypassEnabled()) {
    response.cookies.set(localAuthBypassDisabledCookieName, "1", {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
  }

  return response;
}
