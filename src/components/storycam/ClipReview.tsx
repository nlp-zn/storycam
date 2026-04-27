type ClipReviewProps = {
  clipArtifactId: string;
  durationSeconds?: number;
  isSubmittingFinalWork: boolean;
  onCreateFinalWork: () => void;
  onRetake: () => void;
};

export function ClipReview({ clipArtifactId, durationSeconds = 4, isSubmittingFinalWork, onCreateFinalWork, onRetake }: ClipReviewProps) {
  return (
    <section className="storycam-review-stage">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="storycam-eyebrow">步骤 6</p>
          <h1 className="storycam-heading-lg mt-2">片段已生成</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#b9cacb]">确认这一段的时长和画面感觉。生成最终作品前，仍然可以重拍。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="storycam-secondary-button" disabled type="button">调整字幕</button>
          <button className="storycam-secondary-button storycam-danger-button" disabled={isSubmittingFinalWork} onClick={onRetake} type="button">
            全部重拍
          </button>
        </div>
      </header>

      <div className="storycam-review-grid">
        <article className="storycam-review-card">
          <div className="storycam-cinematic-frame storycam-review-frame flex items-center justify-center">
            <div className="absolute left-4 top-4 flex gap-2">
              <span className="rounded-full bg-[#00f0ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black shadow-[0_0_10px_rgba(0,240,255,0.4)]">片段 01</span>
            </div>
            <span className="absolute bottom-4 right-4 rounded-md border border-white/10 bg-black/60 px-3 py-1 text-sm font-bold text-white backdrop-blur">
              00:{String(durationSeconds).padStart(2, "0")}
            </span>
            <button className="relative z-10 flex size-16 items-center justify-center rounded-full border border-[#00f0ff]/40 bg-black/60 text-2xl text-[#00f0ff]" type="button">
              ▶
            </button>
          </div>
          <div className="p-6">
            <h3 className="text-xl font-black text-[#e2e2e2]">未发送短信</h3>
            <p className="mt-2 truncate text-sm text-[#b9cacb]">账号内片段：{clipArtifactId}</p>
            <div className="my-4 h-px bg-white/10" />
            <div className="flex items-center justify-between gap-3">
              <button className="text-sm font-bold text-[#b9cacb] transition hover:text-[#00f0ff]" type="button">编辑设置</button>
              <button className="text-sm font-bold text-[#ffb1c3] transition hover:text-[#ff4b89]" disabled={isSubmittingFinalWork} onClick={onRetake} type="button">
                重拍这个片段
              </button>
            </div>
          </div>
        </article>

        {[2, 3].map((index) => (
          <article className="storycam-review-card opacity-60" key={index}>
            <div className="storycam-cinematic-frame storycam-review-frame flex items-center justify-center">
              <span className="rounded-full border border-white/15 bg-black/50 px-4 py-2 text-xs font-bold text-[#b9cacb]">等待片段 {String(index).padStart(2, "0")}</span>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-black text-[#e2e2e2]">等待下一段</h3>
              <p className="mt-2 text-sm leading-6 text-[#b9cacb]">继续确认其他核心分镜后，这里会出现新的片段。</p>
            </div>
          </article>
        ))}
      </div>

      <div className="storycam-bottom-dock">
        <button className="storycam-primary-button disabled:opacity-60" disabled={isSubmittingFinalWork} onClick={onCreateFinalWork} type="button">
          {isSubmittingFinalWork ? "正在生成最终作品" : "生成最终作品"}
        </button>
      </div>
    </section>
  );
}
