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

export function ExpansionCanvas({ expansion, isLoading, onGenerateMore, onSkipExpansion, selectedGroup, selectedIndex }: ExpansionCanvasProps) {
  const cards = expansion?.expansionCards ?? [];
  const slots = Array.from({ length: canvasSlotCount }, (_, index) => cards[index]);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-[#3b494b] bg-[#131313]/95 p-4 shadow-[0_0_38px_rgba(0,240,255,0.08)]">
      <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#00f0ff] to-transparent opacity-70" />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-[#00f0ff]">分镜扩展画布</p>
          <h2 className="mt-2 text-2xl font-extrabold text-[#e2e2e2]">围绕核心组补拍法</h2>
          <p className="mt-2 text-sm leading-6 text-[#b9cacb]">中心保持选中的核心分镜组，周边扩展卡只作为这一组的拍摄补充。</p>
        </div>
        <span className="rounded-full border border-[#00f0ff]/40 px-4 py-2 text-sm font-semibold text-[#dbfcff]">
          核心组 {selectedIndex + 1}
        </span>
      </div>

      <div className="grid min-h-[560px] gap-3 lg:grid-cols-3 lg:grid-rows-3">
        {slots.slice(0, 4).map((card, index) => (
          <ExpandedStoryboardCard card={card} index={index} key={`slot-a-${index}`} />
        ))}

        <article className="order-first flex min-h-72 flex-col justify-between rounded-[2rem] border border-[#00f0ff]/50 bg-[#0e0e0e] p-5 shadow-[0_0_30px_rgba(0,240,255,0.16)] lg:order-none lg:col-start-2 lg:row-start-2">
          <div>
            <p className="text-xs font-bold uppercase text-[#00f0ff]">当前核心分镜</p>
            <h3 className="mt-3 text-2xl font-extrabold text-[#e2e2e2]">{selectedGroup.title}</h3>
            <p className="mt-3 text-sm leading-6 text-[#b9cacb]">{selectedGroup.storyPurpose}</p>
          </div>
          <div className="my-5 rounded-3xl border border-white/10 bg-gradient-to-br from-[#1f1f1f] via-[#00363a]/40 to-[#590026]/50 p-4">
            <p className="text-sm leading-6 text-[#dbfcff]">{selectedGroup.emotionalTurn}</p>
            <p className="mt-3 text-xs text-[#849495]">{selectedGroup.estimatedClipDurationSeconds.toFixed(1).replace(".0", "")} 秒片段</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="rounded-full border border-[#00f0ff]/40 px-4 py-3 text-sm font-bold text-[#dbfcff] transition hover:bg-[#00f0ff]/10"
              disabled={isLoading || cards.length >= canvasSlotCount}
              onClick={onGenerateMore}
              type="button"
            >
              {isLoading ? "扩展中" : cards.length >= canvasSlotCount ? "已满 8 张" : "继续补充"}
            </button>
            <button
              className="rounded-full bg-gradient-to-r from-[#00f0ff] to-[#ff4b89] px-4 py-3 text-sm font-extrabold text-black transition hover:brightness-110"
              onClick={onSkipExpansion}
              type="button"
            >
              跳过扩展直接生成片段
            </button>
          </div>
        </article>

        {slots.slice(4).map((card, index) => (
          <ExpandedStoryboardCard card={card} index={index + 4} key={`slot-b-${index}`} />
        ))}
      </div>
    </section>
  );
}
