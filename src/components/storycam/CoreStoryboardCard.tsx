import type { CreateStoryboardResponse } from "@/features/storycam/client/storycamApi";

type CoreStoryboardCardProps = {
  group: CreateStoryboardResponse["storyboard"]["coreStoryboardGroups"][number];
  index: number;
  isSelected?: boolean;
  onExpand?: () => void;
  onGenerateClip?: () => void;
  onSelect?: () => void;
};

export function CoreStoryboardCard({ group, index, isSelected = false, onExpand, onGenerateClip, onSelect }: CoreStoryboardCardProps) {
  return (
    <article
      className={`storycam-glass overflow-hidden rounded-[1.5rem] p-0 transition ${
        isSelected ? "border-[#00f0ff] shadow-[0_0_24px_rgba(0,240,255,0.16)]" : "border-white/10"
      }`}
    >
      <div className="storycam-cinematic-frame aspect-[4/3] rounded-none" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
        <div>
          <p className="storycam-eyebrow">镜头 {String(index + 1).padStart(2, "0")}</p>
          <h3 className="mt-2 text-lg font-extrabold text-[#e2e2e2]">{group.title}</h3>
        </div>
        <span className="shrink-0 rounded-full border border-[#3b494b] px-3 py-1 text-xs font-bold text-[#dbfcff]">
          {formatDuration(group.estimatedClipDurationSeconds)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#b9cacb]">{group.storyPurpose}</p>
      <p className="mt-2 text-sm leading-6 text-[#dbfcff]">{group.emotionalTurn}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="storycam-secondary-button px-3 py-2 text-xs"
          onClick={onExpand ?? onSelect}
          type="button"
        >
          扩展这一组
        </button>
        <button
          className="storycam-primary-button px-3 py-2 text-xs"
          onClick={onGenerateClip ?? onSelect}
          type="button"
        >
          用这一组生成片段
        </button>
      </div>
      </div>
    </article>
  );
}

function formatDuration(seconds: number) {
  return `${seconds.toFixed(1).replace(".0", "")} 秒`;
}
