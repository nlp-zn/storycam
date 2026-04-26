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
      <div className="mt-4 rounded-md border border-dashed border-stone-700 p-3 text-sm leading-6 text-stone-500">
        确认故事世界后，这里会出现 1-3 个核心分镜组。
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-md border border-teal-700/70 bg-teal-950/30 p-3">
        <p className="text-sm font-semibold text-teal-100">
          {storyboard.durationPlan.coreGroupTargetCount} 个核心分镜组，每组生成一个片段。
        </p>
        <p className="mt-2 text-xs leading-5 text-stone-400">扩展卡只补充当前组的拍法，不会单独生成视频。</p>
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
