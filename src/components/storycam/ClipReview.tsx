type ClipReviewProps = {
  clipArtifactId: string;
  durationSeconds?: number;
  isSubmittingFinalWork: boolean;
  onCreateFinalWork: () => void;
  onRetake: () => void;
  preview?: {
    mimeType: string;
    signedUrl: string;
    signedUrlExpiresIn: number;
  };
  title?: string;
};

export function ClipReview({
  clipArtifactId,
  durationSeconds = 15,
  isSubmittingFinalWork,
  onCreateFinalWork,
  onRetake,
  preview,
  title = "15 秒片段"
}: ClipReviewProps) {
  return (
    <section className="storycam-review-stage">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="storycam-eyebrow">步骤 6</p>
          <h1 className="storycam-heading-lg mt-2">片段已生成</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#b9cacb]">确认这个 15 秒片段的画面感觉。生成最终作品前，仍然可以重拍。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="storycam-secondary-button" disabled type="button">调整字幕</button>
          <button className="storycam-secondary-button storycam-danger-button" disabled={isSubmittingFinalWork} onClick={onRetake} type="button">
            全部重拍
          </button>
        </div>
      </header>

      <div className="storycam-review-grid" data-clip-count="1">
        <article className="storycam-review-card">
          <div className="storycam-cinematic-frame storycam-review-frame flex items-center justify-center overflow-hidden">
            <div className="absolute left-4 top-4 flex gap-2">
              <span className="rounded-full bg-[#00f0ff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black shadow-[0_0_10px_rgba(0,240,255,0.4)]">片段 01</span>
            </div>
            <span className="absolute bottom-4 right-4 rounded-md border border-white/10 bg-black/60 px-3 py-1 text-sm font-bold text-white backdrop-blur">
              {formatDuration(durationSeconds)}
            </span>
            {preview ? (
              <video
                className="h-full w-full object-contain"
                controls
                playsInline
                preload="metadata"
                src={preview.signedUrl}
              />
            ) : (
              <span className="rounded-full border border-[#00f0ff]/40 bg-black/60 px-5 py-3 text-sm font-bold text-[#00f0ff]">
                正在准备预览
              </span>
            )}
          </div>
          <div className="p-6">
            <h3 className="text-xl font-black text-[#e2e2e2]">{title}</h3>
            <p className="mt-2 truncate text-sm text-[#b9cacb]">账号内 15 秒片段：{clipArtifactId}</p>
            <div className="my-4 h-px bg-white/10" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-[#b9cacb]">确认后生成最终作品</span>
              <button className="text-sm font-bold text-[#ffb1c3] transition hover:text-[#ff4b89]" disabled={isSubmittingFinalWork} onClick={onRetake} type="button">
                重拍这个片段
              </button>
            </div>
          </div>
        </article>
      </div>

      <div className="storycam-bottom-dock">
        <button className="storycam-primary-button disabled:opacity-60" disabled={isSubmittingFinalWork} onClick={onCreateFinalWork} type="button">
          {isSubmittingFinalWork ? "正在生成最终作品" : "生成最终作品"}
        </button>
      </div>
    </section>
  );
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
