import type { FinalWorkResponse } from "@/features/storycam/client/storycamApi";

type FinalWorkPanelProps = {
  finalWork: FinalWorkResponse;
};

export function FinalWorkPanel({ finalWork }: FinalWorkPanelProps) {
  void finalWork;

  return (
    <section className="storycam-final-stage">
      <div className="storycam-final-grid">
        <div className="storycam-final-main">
          <article className="storycam-final-preview">
          <div className="storycam-cinematic-frame relative flex aspect-video items-center justify-center">
            <div className="absolute left-6 top-6 z-10 flex gap-3">
              <span className="rounded-full border border-[#00f0ff]/30 bg-black/60 px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#00f0ff] backdrop-blur">
                拼接预览
              </span>
              <span className="rounded-full border border-white/10 bg-black/60 px-4 py-1.5 text-xs font-bold text-white backdrop-blur">
                1080p • 24FPS
              </span>
            </div>
            <button
              className="relative z-10 flex size-24 items-center justify-center rounded-full border border-[#00f0ff]/40 bg-black/60 text-3xl text-[#00f0ff] shadow-[0_0_30px_rgba(0,240,255,0.2)]"
              type="button"
            >
              ▶
            </button>
            <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between gap-4 bg-gradient-to-t from-black/90 to-transparent px-6 pb-4 pt-16">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-[54%] rounded-full bg-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
              </div>
              <span className="text-xs font-bold text-[#b9cacb]">00:18 / 00:34</span>
            </div>
          </div>
        </article>

          <div className="storycam-final-timeline">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="storycam-eyebrow">序列时间线</p>
                <h1 className="mt-2 text-3xl font-black text-[#e2e2e2]">账号内预览已保存</h1>
                <p className="mt-1 text-sm text-[#b9cacb]">3 个片段 • 1 个音轨</p>
              </div>
              <div className="flex gap-2">
                <button className="storycam-icon-button" type="button">↶</button>
                <button className="storycam-icon-button" type="button">✂</button>
              </div>
            </div>

            <div className="storycam-timeline-track mt-6">
              <div className="storycam-timeline-playhead" />
              {["Clip 01", "Clip 02", "Clip 03"].map((clip, index) => (
                <span className={`storycam-timeline-clip ${index === 1 ? "is-active" : ""}`} key={clip}>
                  {clip}
                </span>
              ))}
            </div>
            <div className="storycam-audio-track mt-4" aria-label="音频波形">
              {Array.from({ length: 18 }, (_, index) => (
                <span key={index} style={{ height: `${28 + ((index * 17) % 54)}%` }} />
              ))}
            </div>
          </div>
        </div>

        <aside className="storycam-final-settings">
          <div>
            <p className="storycam-eyebrow">色彩调校</p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <button className="storycam-look-card is-active" type="button">赛博朋克</button>
              <button className="storycam-look-card" type="button">电影质感</button>
            </div>
          </div>

          <div>
            <p className="storycam-eyebrow">转场效果</p>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
              {["交叉淡化", "故障干扰", "擦除"].map((effect, index) => (
                <button className={`storycam-transition-card ${index === 1 ? "is-active" : ""}`} key={effect} type="button">
                  {effect}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="storycam-eyebrow">音频轨道</p>
            <div className="mt-4 flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-black/30 p-4">
              <div>
                <p className="font-bold text-[#e2e2e2]">Neon Nights.wav</p>
                <p className="mt-1 text-xs text-[#849495]">自动同步</p>
              </div>
              <span className="text-[#00f0ff]">↔</span>
            </div>
          </div>

          <button className="storycam-primary-button w-full" type="button">
            播放最终作品
          </button>
        </aside>
      </div>
    </section>
  );
}
