import type { FinalWorkResponse } from "@/features/storycam/client/storycamApi";

type FinalWorkPanelProps = {
  finalWork: FinalWorkResponse;
};

export function FinalWorkPanel({ finalWork }: FinalWorkPanelProps) {
  const durationSeconds = finalWork.preview?.durationSeconds ?? 15;

  return (
    <section className="storycam-final-stage">
      <div className="storycam-final-grid">
        <div className="storycam-final-main">
          <article className="storycam-final-preview">
            <div className="storycam-cinematic-frame relative flex aspect-video items-center justify-center overflow-hidden">
              <div className="absolute left-6 top-6 z-10 flex gap-3">
                <span className="rounded-full border border-[#00f0ff]/30 bg-black/60 px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#00f0ff] backdrop-blur">
                  最终作品
                </span>
                <span className="rounded-full border border-white/10 bg-black/60 px-4 py-1.5 text-xs font-bold text-white backdrop-blur">
                  账号内私密预览
                </span>
              </div>
              {finalWork.preview ? (
                <video
                  className="h-full w-full object-contain"
                  controls
                  playsInline
                  preload="metadata"
                  src={finalWork.preview.signedUrl}
                />
              ) : (
                <span className="rounded-full border border-[#00f0ff]/40 bg-black/60 px-5 py-3 text-sm font-bold text-[#00f0ff]">
                  预览链接生成中
                </span>
              )}
            </div>
          </article>

          <div className="storycam-final-timeline">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="storycam-eyebrow">序列时间线</p>
                <h1 className="mt-2 text-3xl font-black text-[#e2e2e2]">账号内预览已保存</h1>
                <p className="mt-1 text-sm text-[#b9cacb]">1 个 15 秒片段 • 无公开链接</p>
              </div>
            </div>

            <div className="storycam-timeline-track mt-6">
              <span className="storycam-timeline-clip is-active storycam-timeline-clip--single">
                Clip 01 · {formatDuration(durationSeconds)}
              </span>
            </div>
          </div>
        </div>

        <aside className="storycam-final-settings">
          <div>
            <p className="storycam-eyebrow">作品状态</p>
            <h2 className="mt-3 text-2xl font-black text-[#e2e2e2]">最终作品已生成</h2>
            <p className="mt-3 text-sm leading-6 text-[#b9cacb]">视频已写入账号内私有存储，可直接在左侧预览。</p>
          </div>

          <div>
            <p className="storycam-eyebrow">文件信息</p>
            <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-black/30 p-4">
              <p className="truncate font-bold text-[#e2e2e2]">{finalWork.finalWork.id}</p>
              <p className="mt-1 text-xs text-[#849495]">{finalWork.media.mimeType} • {formatBytes(finalWork.media.byteSize)}</p>
            </div>
          </div>

          {finalWork.preview ? (
            <a className="storycam-primary-button w-full text-center" href={finalWork.preview.signedUrl} rel="noreferrer" target="_blank">
              打开最终作品
            </a>
          ) : (
            <button className="storycam-primary-button w-full" disabled type="button">
              打开最终作品
            </button>
          )}
        </aside>
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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
