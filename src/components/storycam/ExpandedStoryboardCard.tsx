import type { ExpandStoryboardGroupResponse } from "@/features/storycam/client/storycamApi";

type ExpandedStoryboardCardProps = {
  card?: ExpandStoryboardGroupResponse["expansionCards"][number];
  index: number;
};

export function ExpandedStoryboardCard({ card, index }: ExpandedStoryboardCardProps) {
  if (!card) {
    return (
      <article className="flex min-h-36 flex-col justify-between rounded-3xl border border-dashed border-[#3b494b] bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase text-[#b9cacb]">等待槽 {index + 1}</span>
          <span className="size-2 rounded-full bg-[#00f0ff]/60" />
        </div>
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-white/10" />
          <div className="h-2 w-2/3 rounded-full bg-white/10" />
        </div>
        <p className="text-xs text-[#849495]">可继续补充，最多 8 张。</p>
      </article>
    );
  }

  return (
    <article className="flex min-h-36 flex-col justify-between rounded-3xl border border-[#3b494b] bg-[#1f1f1f]/80 p-4 shadow-[0_0_18px_rgba(0,240,255,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase text-[#00f0ff]">{card.beatType}</span>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-[#b9cacb]">#{card.sortOrder + 1}</span>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-[#e2e2e2]">{card.title}</h4>
        <p className="mt-2 text-xs leading-5 text-[#b9cacb]">{card.description}</p>
      </div>
      <p className="border-t border-white/10 pt-2 text-xs leading-5 text-[#ffb1c3]">{card.guidance}</p>
    </article>
  );
}
