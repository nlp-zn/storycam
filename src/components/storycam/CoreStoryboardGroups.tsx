import { CoreStoryboardCard } from "@/components/storycam/CoreStoryboardCard";
import type { CreateStoryboardResponse } from "@/features/storycam/client/storycamApi";

type CoreStoryboardGroupsProps = {
  onExpandGroup?: (index: number) => void;
  onSelectGroup?: (index: number) => void;
  selectedIndex?: number | null;
  storyboard: CreateStoryboardResponse | null;
};

export function CoreStoryboardGroups({ onExpandGroup, onSelectGroup, selectedIndex, storyboard }: CoreStoryboardGroupsProps) {
  if (!storyboard) {
    return (
      <div className="mt-4 rounded-[1.25rem] border border-dashed border-[#3b494b] p-4 text-sm leading-6 text-[#849495]">
        确认故事世界后，这里会出现 1-3 个核心分镜组。
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
            onSelect={() => onSelectGroup?.(index)}
          />
        ))}
      </div>
    </div>
  );
}
