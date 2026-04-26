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
    <div className="storycam-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="storycam-eyebrow">Account</p>
          <h2 className="mt-2 text-lg font-extrabold text-[#e2e2e2]">保存到你的账号</h2>
          <p className="mt-2 text-sm leading-6 text-[#b9cacb]">
            登录后可上传照片、生成真实片段，并保留最终作品预览。
          </p>
        </div>
      </div>

      <button
        className="storycam-secondary-button mt-4 w-full border-[#00f0ff] text-[#dbfcff] disabled:opacity-60"
        disabled={isSubmitting}
        onClick={signInWithGoogle}
        type="button"
      >
        {isSubmitting ? "正在打开 Google 登录" : "使用 Google 登录"}
      </button>

      {errorMessage ? <p className="mt-3 text-sm text-[#ffd9e0]">{errorMessage}</p> : null}
    </div>
  );
}
