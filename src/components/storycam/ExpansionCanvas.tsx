import { ExpandedStoryboardCard } from "@/components/storycam/ExpandedStoryboardCard";
import type { ReactNode } from "react";
import type { CreateStoryboardResponse, ExpandStoryboardGroupResponse } from "@/features/storycam/client/storycamApi";

type ExpansionCanvasProps = {
  expansion: ExpandStoryboardGroupResponse | null;
  generationPanel?: ReactNode;
  isLoading: boolean;
  onGenerateMore: () => void;
  onSkipExpansion: () => void;
  selectedGroup: CreateStoryboardResponse["storyboard"]["coreStoryboardGroups"][number];
  selectedIndex: number;
};

const canvasSlotCount = 8;

export function ExpansionCanvas({
  expansion,
  generationPanel,
  isLoading,
  onGenerateMore,
  onSkipExpansion,
  selectedGroup,
  selectedIndex
}: ExpansionCanvasProps) {
  const cards = expansion?.expansionCards ?? [];
  const slots = Array.from({ length: canvasSlotCount }, (_, index) => cards[index]);

  return (
    <section className="storycam-panel storycam-neon-panel relative overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#00f0ff] opacity-[0.035] blur-[100px]" />
      <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#00f0ff] to-transparent opacity-70" />
      <div className="relative mb-10 text-center">
        <p className="storycam-eyebrow">步骤 4</p>
        <h2 className="storycam-heading-lg mt-2">分镜扩展画布</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#b9cacb]">中心保持选中的核心分镜组，周边扩展卡只作为这一组的拍摄补充。</p>
      </div>

      <div className="relative grid gap-6 lg:grid-cols-12 lg:items-center">
        <div className="grid gap-5 lg:col-span-3">{slots.slice(0, 2).map((card, index) => <ExpandedStoryboardCard card={card} index={index} key={`slot-left-${index}`} />)}</div>

        <article className="storycam-neon-panel order-first overflow-hidden rounded-[2rem] border border-[#00f0ff]/50 bg-[#0e0e0e] shadow-[0_0_40px_rgba(0,240,255,0.16)] lg:order-none lg:col-span-6">
          <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="size-2 rounded-full bg-[#00f0ff] shadow-[0_0_8px_rgba(0,240,255,0.8)]" />
              <span className="storycam-eyebrow">核心分镜 {String(selectedIndex + 1).padStart(2, "0")}</span>
            </div>
            <span className="rounded-full border border-[#00f0ff]/40 px-3 py-1 text-xs font-bold text-[#dbfcff]">
              {selectedGroup.estimatedClipDurationSeconds.toFixed(1).replace(".0", "")} 秒
            </span>
          </div>

          <div className="p-6">
            <div className="storycam-cinematic-frame flex aspect-video items-end rounded-[1.75rem] p-6">
              <div className="relative z-10">
                <p className="storycam-eyebrow">当前核心分镜</p>
                <h3 className="mt-2 text-3xl font-black text-[#e2e2e2]">{selectedGroup.title}</h3>
              </div>
            </div>

            <p className="mt-5 text-sm leading-6 text-[#b9cacb]">{selectedGroup.storyPurpose}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="storycam-eyebrow">情绪转折</p>
                <p className="mt-2 text-sm leading-6 text-[#dbfcff]">{selectedGroup.emotionalTurn}</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
                <p className="storycam-eyebrow">扩展状态</p>
                <p className="mt-2 text-sm leading-6 text-[#dbfcff]">{cards.length || 0} / {canvasSlotCount} 张补充分镜</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                className="storycam-secondary-button w-full"
                disabled={isLoading || cards.length >= canvasSlotCount}
                onClick={onGenerateMore}
                type="button"
              >
                {isLoading ? "扩展中" : cards.length >= canvasSlotCount ? "已满 8 张" : "继续补充"}
              </button>
              <button className="storycam-primary-button w-full" onClick={onSkipExpansion} type="button">
                跳过扩展直接生成片段
              </button>
            </div>
          </div>
        </article>

        <div className="grid gap-5 lg:col-span-3">{slots.slice(2, 4).map((card, index) => <ExpandedStoryboardCard card={card} index={index + 2} key={`slot-right-${index}`} />)}</div>
      </div>

      <div className="relative mt-6 grid gap-5 md:grid-cols-4">
        {slots.slice(4).map((card, index) => (
          <ExpandedStoryboardCard card={card} index={index + 4} key={`slot-bottom-${index}`} />
        ))}
      </div>

      {generationPanel ? (
        <div className="relative mt-6">
          {generationPanel}
        </div>
      ) : null}
    </section>
  );
}
