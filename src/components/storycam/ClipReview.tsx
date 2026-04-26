type ClipReviewProps = {
  clipArtifactId: string;
  durationSeconds?: number;
  isSubmittingFinalWork: boolean;
  onCreateFinalWork: () => void;
  onRetake: () => void;
};

export function ClipReview({ clipArtifactId, durationSeconds = 4, isSubmittingFinalWork, onCreateFinalWork, onRetake }: ClipReviewProps) {
  return (
    <section className="rounded-3xl border border-[#00f0ff]/30 bg-[#131313]/95 p-4 shadow-[0_0_24px_rgba(0,240,255,0.12)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-[#00f0ff]">片段确认</p>
          <h3 className="mt-2 text-lg font-extrabold text-[#e2e2e2]">片段已生成</h3>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-[#dbfcff]">{durationSeconds} 秒</span>
      </div>

      <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-black">
        <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-[#00363a] via-[#1f1f1f] to-[#590026]">
          <div className="flex size-16 items-center justify-center rounded-full border border-[#00f0ff]/40 bg-black/50 text-2xl text-[#00f0ff]">
            ▶
          </div>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs text-[#b9cacb]">
          <span className="shrink-0">账号内片段</span>
          <span className="min-w-0 truncate text-right">{clipArtifactId}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          className="rounded-full border border-[#ffb1c3]/50 px-4 py-3 text-sm font-bold text-[#ffb1c3] transition hover:bg-[#ff4b89]/10"
          disabled={isSubmittingFinalWork}
          onClick={onRetake}
          type="button"
        >
          重拍这个片段
        </button>
        <button
          className="rounded-full bg-gradient-to-r from-[#00f0ff] to-[#ff4b89] px-4 py-3 text-sm font-extrabold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmittingFinalWork}
          onClick={onCreateFinalWork}
          type="button"
        >
          {isSubmittingFinalWork ? "正在生成最终作品" : "生成最终作品"}
        </button>
      </div>
    </section>
  );
}
