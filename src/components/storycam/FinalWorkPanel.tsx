import type { FinalWorkResponse } from "@/features/storycam/client/storycamApi";

type FinalWorkPanelProps = {
  finalWork: FinalWorkResponse;
};

export function FinalWorkPanel({ finalWork }: FinalWorkPanelProps) {
  return (
    <section className="storycam-panel storycam-neon-panel">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="overflow-hidden rounded-[2rem] border border-[#00f0ff]/30 bg-black shadow-[0_0_30px_rgba(0,240,255,0.18)]">
          <div className="storycam-cinematic-frame flex aspect-video items-center justify-center">
            <button
              className="relative z-10 flex size-24 items-center justify-center rounded-full border border-[#00f0ff]/40 bg-black/60 text-3xl text-[#00f0ff] shadow-[0_0_30px_rgba(0,240,255,0.2)]"
              type="button"
            >
              ▶
            </button>
          </div>
          <div className="border-t border-white/10 p-5">
            <p className="storycam-eyebrow">导出</p>
            <h3 className="mt-2 text-3xl font-black text-[#e2e2e2]">账号内预览已保存</h3>
            <p className="mt-3 text-sm leading-6 text-[#b9cacb]">已保存到你的账号空间。第一版只提供私密预览和保存。</p>
          </div>
        </article>

        <aside className="flex flex-col gap-5">
          <div className="storycam-glass rounded-[2rem] p-5">
            <p className="storycam-eyebrow">序列时间线</p>
            <h4 className="mt-2 text-xl font-black text-[#e2e2e2]">1 个片段 • 1 个音轨</h4>
            <div className="mt-5 flex gap-3 overflow-x-auto">
              <span className="flex h-20 min-w-20 items-end rounded-[1rem] border-2 border-[#00f0ff] bg-[#00f0ff]/10 p-3 text-xs font-bold text-[#dbfcff]">
                Clip 01
              </span>
              <span className="flex h-20 min-w-20 items-center justify-center rounded-[1rem] border border-white/10 bg-white/[0.03] text-xl text-[#849495]">＋</span>
            </div>
          </div>

          <div className="storycam-glass grid min-w-0 gap-3 rounded-[2rem] p-5 text-xs text-[#b9cacb]">
            <span className="min-w-0 break-words">作品 {finalWork.finalWork.id}</span>
            <span className="min-w-0 break-words">媒体 {finalWork.media.id}</span>
          </div>

          <button className="storycam-primary-button w-full" type="button">播放账号内预览</button>
        </aside>
      </div>
    </section>
  );
}
