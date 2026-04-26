type ClipReviewProps = {
  clipArtifactId: string;
  durationSeconds?: number;
  isSubmittingFinalWork: boolean;
  onCreateFinalWork: () => void;
  onRetake: () => void;
};

export function ClipReview({ clipArtifactId, durationSeconds = 4, isSubmittingFinalWork, onCreateFinalWork, onRetake }: ClipReviewProps) {
  return (
    <section className="storycam-panel storycam-neon-panel">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="storycam-eyebrow">步骤 6</p>
          <h3 className="storycam-heading-lg mt-2">片段已生成</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#b9cacb]">验证捕获片段的时长与视觉保真度。在最终拼接前可以重拍这一段。</p>
        </div>
        <span className="rounded-full border border-[#00f0ff]/40 px-4 py-2 text-sm font-bold text-[#dbfcff]">{durationSeconds} 秒</span>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="overflow-hidden rounded-[2rem] border border-[#00f0ff]/30 bg-black shadow-[0_0_24px_rgba(0,240,255,0.12)]">
          <div className="storycam-cinematic-frame flex aspect-video items-center justify-center">
            <button className="relative z-10 flex size-24 items-center justify-center rounded-full border border-[#00f0ff]/40 bg-black/60 text-3xl text-[#00f0ff]" type="button">
              ▶
            </button>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3 border-t border-white/10 px-5 py-4 text-xs text-[#b9cacb]">
            <span className="shrink-0">账号内片段</span>
            <span className="min-w-0 truncate text-right">{clipArtifactId}</span>
          </div>
        </article>

        <aside className="grid gap-4">
          <div className="storycam-glass rounded-[2rem] p-5">
            <p className="storycam-eyebrow">片段 01</p>
            <h4 className="mt-2 text-xl font-black text-[#e2e2e2]">未发送短信</h4>
            <p className="mt-3 text-sm leading-6 text-[#b9cacb]">当前片段已可进入最终拼接。第一版只保存账号内预览。</p>
          </div>
          <button className="storycam-secondary-button storycam-danger-button w-full" disabled={isSubmittingFinalWork} onClick={onRetake} type="button">
            重拍这个片段
          </button>
          <button className="storycam-primary-button w-full disabled:opacity-60" disabled={isSubmittingFinalWork} onClick={onCreateFinalWork} type="button">
            {isSubmittingFinalWork ? "正在生成最终作品" : "生成最终作品"}
          </button>
        </aside>
      </div>
    </section>
  );
}
