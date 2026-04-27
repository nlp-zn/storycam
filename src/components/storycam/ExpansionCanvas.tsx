import { ExpandedStoryboardCard } from "@/components/storycam/ExpandedStoryboardCard";
import type { CreateStoryboardResponse, ExpandStoryboardGroupResponse } from "@/features/storycam/client/storycamApi";

type ExpansionCanvasProps = {
  expansion: ExpandStoryboardGroupResponse | null;
  isLoading: boolean;
  onGenerateMore: () => void;
  onSkipExpansion: () => void;
  selectedGroup: CreateStoryboardResponse["storyboard"]["coreStoryboardGroups"][number];
  selectedIndex: number;
};

const canvasSlotCount = 8;
const vectorSlots = [
  { label: "反应", status: "合成中..." },
  { label: "氛围", status: "生成光影向量" },
  { label: "动作", status: "等待向量..." }
] as const;

export function ExpansionCanvas({
  expansion,
  isLoading,
  onGenerateMore,
  onSkipExpansion,
  selectedGroup,
  selectedIndex
}: ExpansionCanvasProps) {
  const cards = expansion?.expansionCards ?? [];
  const slots = vectorSlots.map((slot, index) => ({ ...slot, card: cards[index] }));

  return (
    <section className="storycam-expansion-stage relative overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#00f0ff] opacity-[0.035] blur-[100px]" />
      <div className="relative mb-14 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#00f0ff]/20 bg-[#00f0ff]/10 px-4 py-2">
          <span className="size-2 rounded-full bg-[#00f0ff]" />
          <span className="storycam-eyebrow">步骤 4</span>
        </div>
        <h2 className="storycam-heading-lg">分镜扩展画布</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#b9cacb]">围绕核心分镜生成周边叙事向量。</p>
      </div>

      <div className="storycam-expansion-grid relative">
        <div className="grid gap-6 lg:col-span-3">
          <ExpandedStoryboardCard card={slots[0]?.card} index={0} slotLabel={slots[0]?.label} slotStatus={slots[0]?.status} />
        </div>

        <article className="storycam-expansion-core storycam-neon-panel order-first overflow-hidden border border-[#00f0ff]/50 bg-[#0e0e0e] shadow-[0_0_40px_rgba(0,240,255,0.16)] lg:order-none lg:col-span-6">
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
            <div className="storycam-cinematic-frame storycam-expansion-message flex items-end p-6">
              <div className="absolute right-8 top-8 z-10 max-w-[80%] rounded-2xl rounded-tr-sm border border-white/10 bg-[#2a2a2a] p-4 text-sm leading-6 text-[#e2e2e2] shadow-lg">
                {selectedGroup.storyPurpose}
              </div>
              <div className="relative z-10">
                <p className="storycam-eyebrow">当前核心分镜</p>
                <h3 className="mt-2 text-3xl font-black text-[#e2e2e2]">{selectedGroup.title}</h3>
              </div>
            </div>

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

        <div className="grid gap-6 lg:col-span-3">
          {slots.slice(1).map((slot, index) => (
            <ExpandedStoryboardCard
              card={slot.card}
              index={index + 1}
              key={slot.label}
              slotLabel={slot.label}
              slotStatus={slot.status}
            />
          ))}
        </div>
      </div>

    </section>
  );
}
