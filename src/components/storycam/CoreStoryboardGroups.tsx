import { CoreStoryboardCard } from "@/components/storycam/CoreStoryboardCard";
import type { CreateStoryboardResponse } from "@/features/storycam/client/storycamApi";

type CoreStoryboardGroupsProps = {
  isCompact?: boolean;
  onExpandGroup?: (index: number) => void;
  onGenerateClip?: (index: number) => void;
  onSelectGroup?: (index: number) => void;
  selectedIndex?: number | null;
  storyboard: CreateStoryboardResponse | null;
};

export function CoreStoryboardGroups({
  isCompact = false,
  onExpandGroup,
  onGenerateClip,
  onSelectGroup,
  selectedIndex,
  storyboard
}: CoreStoryboardGroupsProps) {
  if (!storyboard) {
    return (
      <div className="mt-4 rounded-[1.25rem] border border-dashed border-[#3b494b] p-4 text-sm leading-6 text-[#849495]">
        确认故事世界后，这里会出现 1-3 个核心分镜组。
      </div>
    );
  }

  if (isCompact) {
    return (
      <div className="mt-4 space-y-3">
        <div className="rounded-[1.25rem] border border-[#00f0ff]/35 bg-[#00f0ff]/10 p-4">
          <p className="text-sm font-bold text-[#dbfcff]">时间线已生成 {storyboard.durationPlan.coreGroupTargetCount} 个片段锚点。</p>
        </div>
        <div className="space-y-2">
          {storyboard.storyboard.coreStoryboardGroups.map((group, index) => (
            <button
              className={`w-full rounded-[1.25rem] border px-4 py-3 text-left transition ${
                selectedIndex === index ? "border-[#00f0ff] bg-[#00f0ff]/10" : "border-white/10 bg-white/[0.03]"
              }`}
              key={`${group.title}-${index}`}
              onClick={() => onSelectGroup?.(index)}
              type="button"
            >
              <span className="storycam-eyebrow">镜头 {String(index + 1).padStart(2, "0")}</span>
              <span className="mt-1 block text-sm font-extrabold text-[#e2e2e2]">{group.title}</span>
              <span className="mt-1 block text-xs text-[#b9cacb]">{formatDuration(group.estimatedClipDurationSeconds)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-[1.25rem] border border-[#00f0ff]/35 bg-[#00f0ff]/10 p-4">
        <p className="text-sm font-bold text-[#dbfcff]">
          {storyboard.durationPlan.coreGroupTargetCount} 个核心分镜组，每组生成一个片段。
        </p>
        <p className="mt-2 text-xs leading-5 text-[#b9cacb]">扩展卡只补充当前组的拍法，不会单独生成视频。</p>
      </div>
      <div className="space-y-3">
        {storyboard.storyboard.coreStoryboardGroups.map((group, index) => (
          <CoreStoryboardCard
            group={group}
            index={index}
            isSelected={selectedIndex === index}
            key={`${group.title}-${index}`}
            onExpand={() => onExpandGroup?.(index)}
            onGenerateClip={() => onGenerateClip?.(index)}
            onSelect={() => onSelectGroup?.(index)}
          />
        ))}
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  return `${seconds.toFixed(1).replace(".0", "")} 秒`;
}
