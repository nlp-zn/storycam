import type { ReactNode } from "react";
import type { CreateStoryboardResponse } from "@/features/storycam/client/storycamApi";

type CoreFramesStageProps = {
  generationPanel?: ReactNode;
  isBusy?: boolean;
  onExpandGroup: (index: number) => void;
  onGenerateClip: (index: number) => void;
  onOpenStoryWorldEditor: () => void;
  onSelectGroup: (index: number) => void;
  selectedIndex: number;
  storyboard: CreateStoryboardResponse;
};

export function CoreFramesStage({
  generationPanel,
  isBusy = false,
  onExpandGroup,
  onGenerateClip,
  onOpenStoryWorldEditor,
  onSelectGroup,
  selectedIndex,
  storyboard
}: CoreFramesStageProps) {
  const selectedGroup = storyboard.storyboard.coreStoryboardGroups[selectedIndex];

  return (
    <section className="relative">
      <header className="mb-12 max-w-3xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#00f0ff]/20 bg-[#00f0ff]/10 px-4 py-2">
          <span className="size-2 rounded-full bg-[#00f0ff]" />
          <span className="storycam-eyebrow">步骤 3</span>
        </div>
        <h1 className="storycam-heading-xl">核心分镜</h1>
        <p className="mt-6 text-lg leading-8 text-[#b9cacb]">
          锁定序列的视觉锚点。这些电影般的构图会决定片段的照明模型、大气深度和情感节奏。
        </p>
        <div className="mt-6 rounded-[1.25rem] border border-[#00f0ff]/35 bg-[#00f0ff]/10 p-4">
          <p className="text-sm font-bold text-[#dbfcff]">
            {storyboard.durationPlan.coreGroupTargetCount} 个核心分镜组，每组生成一个片段。
          </p>
          <p className="mt-2 text-xs leading-5 text-[#b9cacb]">扩展卡只补充当前组的拍法，不会单独生成视频。</p>
        </div>
        <button
          className="storycam-secondary-button mt-4"
          onClick={onOpenStoryWorldEditor}
          type="button"
        >
          改剧本
        </button>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {storyboard.storyboard.coreStoryboardGroups.map((group, index) => {
          const isSelected = selectedIndex === index;

          return (
            <article
              className={`group relative flex aspect-[4/5] min-h-[420px] flex-col justify-end overflow-hidden rounded-[3rem] border transition duration-500 xl:[&:nth-child(2)]:-translate-y-8 ${
                isSelected
                  ? "border-[#00f0ff] shadow-[0_0_34px_rgba(0,240,255,0.24)]"
                  : "border-white/10 shadow-[0_0_24px_rgba(0,0,0,0.35)]"
              }`}
              key={`${group.title}-${index}`}
              onClick={() => onSelectGroup(index)}
            >
              <div className="storycam-cinematic-frame absolute inset-0 rounded-none transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />
              <div className="relative z-10 p-6 md:p-8">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <span className="storycam-eyebrow">镜头 {String(index + 1).padStart(2, "0")}</span>
                  <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs font-black text-[#e2e2e2]">
                    {formatDuration(group.estimatedClipDurationSeconds)}
                  </span>
                </div>
                <h2 className="text-3xl font-black leading-tight text-[#e2e2e2]">{group.title}</h2>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#b9cacb]">{group.storyPurpose}</p>
                <p className="mt-3 text-sm font-bold leading-6 text-[#dbfcff]">{group.emotionalTurn}</p>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    className="storycam-secondary-button px-4 py-3 text-xs"
                    disabled={isBusy}
                    onClick={(event) => {
                      event.stopPropagation();
                      onExpandGroup(index);
                    }}
                    type="button"
                  >
                    扩展这一组
                  </button>
                  <button
                    className="storycam-primary-button px-4 py-3 text-xs"
                    disabled={isBusy}
                    onClick={(event) => {
                      event.stopPropagation();
                      onGenerateClip(index);
                    }}
                    type="button"
                  >
                    用这一组生成片段
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {generationPanel ? <div className="mt-8">{generationPanel}</div> : null}

      {!generationPanel && selectedGroup ? (
        <div className="storycam-bottom-dock">
          <button
            className="storycam-primary-button"
            disabled={isBusy}
            onClick={() => onExpandGroup(selectedIndex)}
            type="button"
          >
            确认并继续
            <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function formatDuration(seconds: number) {
  return `${seconds.toFixed(1).replace(".0", "")} 秒`;
}
