import type { FinalWorkResponse } from "@/features/storycam/client/storycamApi";

type FinalWorkPanelProps = {
  finalWork: FinalWorkResponse;
};

export function FinalWorkPanel({ finalWork }: FinalWorkPanelProps) {
  return (
    <section className="rounded-3xl border border-[#00f0ff]/35 bg-[#0a0a0a]/95 p-4 shadow-[0_0_28px_rgba(0,240,255,0.16)]">
      <p className="text-xs font-bold uppercase text-[#00f0ff]">最终作品</p>
      <h3 className="mt-2 text-lg font-extrabold text-[#e2e2e2]">账号内预览已保存</h3>
      <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-black">
        <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-[#0e0e0e] via-[#00363a]/70 to-[#590026]/70">
          <div className="rounded-full border border-[#00f0ff]/40 bg-black/60 px-5 py-3 text-sm font-bold text-[#dbfcff]">
            播放账号内预览
          </div>
        </div>
        <div className="grid min-w-0 gap-2 border-t border-white/10 px-4 py-3 text-xs text-[#b9cacb] sm:grid-cols-2">
          <span className="min-w-0 break-words">作品 {finalWork.finalWork.id}</span>
          <span className="min-w-0 break-words">媒体 {finalWork.media.id}</span>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#b9cacb]">已保存到你的账号空间。第一版只提供私密预览和保存。</p>
    </section>
  );
}
