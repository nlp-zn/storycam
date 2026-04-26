import type { CreateStoryboardResponse } from "@/features/storycam/client/storycamApi";

type CoreStoryboardCardProps = {
  group: CreateStoryboardResponse["storyboard"]["coreStoryboardGroups"][number];
  index: number;
};

export function CoreStoryboardCard({ group, index }: CoreStoryboardCardProps) {
  return (
    <article className="rounded-md border border-stone-700 bg-stone-900 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-rose-200">片段 {String.fromCharCode(65 + index)}</p>
          <h3 className="mt-1 text-sm font-semibold text-stone-100">{group.title}</h3>
        </div>
        <span className="shrink-0 rounded border border-stone-700 px-2 py-1 text-xs text-stone-300">
          {formatDuration(group.estimatedClipDurationSeconds)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-400">{group.storyPurpose}</p>
      <p className="mt-2 text-sm leading-6 text-teal-100">{group.emotionalTurn}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="rounded-md border border-stone-600 px-3 py-2 text-xs font-semibold text-stone-200 transition hover:border-amber-300 hover:text-amber-100"
          type="button"
        >
          扩展这一组
        </button>
        <button
          className="rounded-md bg-amber-300 px-3 py-2 text-xs font-semibold text-stone-950 transition hover:bg-amber-200"
          type="button"
        >
          用这一组生成片段
        </button>
      </div>
    </article>
  );
}

function formatDuration(seconds: number) {
  return `${seconds.toFixed(1).replace(".0", "")} 秒`;
}
