import type { ExpandStoryboardGroupResponse } from "@/features/storycam/client/storycamApi";

type ExpandedStoryboardCardProps = {
  card?: ExpandStoryboardGroupResponse["expansionCards"][number];
  index: number;
  slotLabel?: string;
  slotStatus?: string;
};

export function ExpandedStoryboardCard({ card, index, slotLabel = `向量 ${index + 1}`, slotStatus = "合成中..." }: ExpandedStoryboardCardProps) {
  if (!card) {
    return (
      <article className="storycam-expansion-vector storycam-glass flex min-h-44 flex-col justify-between border-dashed border-[#3b494b] p-5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00f0ff] to-transparent opacity-60" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold uppercase text-[#b9cacb]">{slotLabel}</span>
          <span className="text-xl text-[#00f0ff]/70">⌛</span>
        </div>
        <div className="space-y-3">
          <div className="h-2 rounded-full bg-white/10" />
          <div className="h-2 w-2/3 rounded-full bg-white/10" />
          <div className="storycam-cinematic-frame h-16 rounded-[1.25rem] opacity-60" />
        </div>
        <p className="text-xs text-[#849495]">{slotStatus}</p>
      </article>
    );
  }

  return (
    <article className="storycam-expansion-vector storycam-glass flex min-h-44 flex-col justify-between p-5 shadow-[0_0_18px_rgba(0,240,255,0.08)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00f0ff] to-transparent opacity-60" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase text-[#00f0ff]">{slotLabel}</span>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-[#b9cacb]">#{card.sortOrder + 1}</span>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-[#e2e2e2]">{card.title}</h4>
        <p className="mt-2 text-xs leading-5 text-[#b9cacb]">{card.description}</p>
      </div>
      <div className="storycam-cinematic-frame my-3 h-16 rounded-[1.25rem]" />
      <p className="border-t border-white/10 pt-2 text-xs leading-5 text-[#ffb1c3]">{card.guidance}</p>
    </article>
  );
}
