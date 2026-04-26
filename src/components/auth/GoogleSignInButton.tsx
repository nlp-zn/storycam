"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signInWithGoogle() {
    setIsSubmitting(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      setErrorMessage("登录暂时不可用，请稍后再试。");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-stone-700/70 bg-stone-950/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-teal-200">Account</p>
          <h2 className="mt-2 text-lg font-semibold text-stone-50">保存到你的账号</h2>
          <p className="mt-2 text-sm leading-6 text-stone-400">
            登录后可上传照片、生成真实片段，并保留最终作品预览。
          </p>
        </div>
      </div>

      <button
        className="mt-4 w-full rounded-md border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        onClick={signInWithGoogle}
        type="button"
      >
        {isSubmitting ? "正在打开 Google 登录" : "使用 Google 登录"}
      </button>

      {errorMessage ? <p className="mt-3 text-sm text-rose-200">{errorMessage}</p> : null}
    </div>
  );
}
