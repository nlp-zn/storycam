import type { ReactNode } from "react";
import type { CreateStoryboardResponse, StoryboardImageState } from "@/features/storycam/client/storycamApi";

type CoreFramesStageProps = {
  generationPanel?: ReactNode;
  isBusy?: boolean;
  onExpandGroup: (index: number) => void;
  onGenerateClip: (index: number) => void;
  onMediaLoadError?: () => void;
  onSelectGroup: (index: number) => void;
  selectedIndex: number;
  storyboard: CreateStoryboardResponse;
};

const requiredExpandedFrameCount = 8;

export function CoreFramesStage({
  generationPanel,
  isBusy = false,
  onExpandGroup,
  onGenerateClip,
  onMediaLoadError,
  onSelectGroup,
  selectedIndex,
  storyboard
}: CoreFramesStageProps) {
  const coreGroups = storyboard.storyboard.coreStoryboardGroups.slice(0, 1);
  const selectedGroup = coreGroups[0];

  return (
    <section className="storycam-core-stage relative">
      <header className="mb-16 max-w-3xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#00f0ff]/20 bg-[#00f0ff]/10 px-4 py-2">
          <span className="size-2 rounded-full bg-[#00f0ff]" />
          <span className="storycam-eyebrow">步骤 3</span>
        </div>
        <h1 className="storycam-heading-xl">核心分镜</h1>
        <p className="mt-6 text-lg leading-8 text-[#b9cacb]">
          这一张主分镜是一段 15 秒内短片的中心图。点开主图后，可以在当前页生成周围 8 张扩展分镜图。
        </p>
        <p className="mt-5 text-sm font-bold text-[#dbfcff]">
          1 个核心分镜组，控制在 15 秒内。
        </p>
      </header>

      <div className="storycam-core-grid" data-core-count={1}>
        {coreGroups.map((group, index) => {
          const isSelected = selectedIndex === index;
          const representativeImage = group.representativeImage ?? placeholderImage;
          const expandedStoryboardImages = group.expandedStoryboardImages ?? [];
          const readyExpandedCount = readyExpandedFrameCount(expandedStoryboardImages);
          const canGenerateClip = readyExpandedCount >= requiredExpandedFrameCount;

          return (
            <article
              className={`storycam-core-card group relative flex flex-col justify-end overflow-hidden border transition duration-500 ${
                isSelected
                  ? "border-[#00f0ff] shadow-[0_0_34px_rgba(0,240,255,0.24)]"
                  : "border-white/10 shadow-[0_0_24px_rgba(0,0,0,0.35)]"
              }`}
              data-testid="core-storyboard-card"
              key={`${group.title}-${index}`}
            >
              <button
                aria-label={`打开${group.title}扩展画布`}
                className="absolute inset-0 z-0 text-left"
                onClick={() => {
                  onSelectGroup(index);
                  onExpandGroup(index);
                }}
                type="button"
              >
                {representativeImage.status === "ready" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`${group.title} 主分镜图`}
                    className="size-full object-cover transition duration-700 group-hover:scale-105"
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                      onMediaLoadError?.();
                    }}
                    src={representativeImage.signedUrl}
                  />
                ) : (
                  <div className="storycam-cinematic-frame relative size-full rounded-none transition duration-700 group-hover:scale-105">
                    <span className="storycam-core-image-status">
                      {storyboardImageStatusLabel(representativeImage, "主分镜图")}
                    </span>
                  </div>
                )}
              </button>
              <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black via-black/55 to-transparent" />
              <div className="pointer-events-none relative z-10 p-6 md:p-8">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <span className="storycam-eyebrow">镜头 {String(index + 1).padStart(2, "0")}</span>
                  <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs font-black text-[#e2e2e2]">
                    {formatDuration(group.estimatedClipDurationSeconds)}
                  </span>
                </div>
                <h2 className="text-3xl font-black leading-tight text-[#e2e2e2]">{group.title}</h2>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#b9cacb]">{group.storyPurpose}</p>
                <p className="mt-3 text-sm font-bold leading-6 text-[#dbfcff]">{group.emotionalTurn}</p>
                {expandedStoryboardImages.length ? (
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {expandedStoryboardImages.slice(0, 8).map((image, imageIndex) => (
                      <div
                        className="aspect-video overflow-hidden rounded border border-white/10 bg-black/40"
                        key={`${group.title}-expanded-${imageIndex}`}
                      >
                        {image.status === "ready" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={`${group.title} 扩展分镜 ${imageIndex + 1}`}
                            className="size-full object-cover"
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                              onMediaLoadError?.();
                            }}
                            src={image.signedUrl}
                          />
                        ) : (
                          <div className="storycam-cinematic-frame size-full rounded-none opacity-70" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    className="storycam-secondary-button pointer-events-auto px-4 py-3 text-xs"
                    disabled={isBusy}
                    onClick={(event) => {
                      event.stopPropagation();
                      onExpandGroup(index);
                    }}
                    type="button"
                  >
                    打开 9 帧画布
                  </button>
                  <button
                    className="storycam-primary-button pointer-events-auto px-4 py-3 text-xs"
                    disabled={isBusy}
                    onClick={(event) => {
                      event.stopPropagation();
                      onGenerateClip(index);
                    }}
                    type="button"
                  >
                    {canGenerateClip ? "用这一组生成片段" : `先补齐扩展图 ${readyExpandedCount}/8`}
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
            打开扩展画布
          </button>
        </div>
      ) : null}
    </section>
  );
}

function formatDuration(seconds: number) {
  return `${seconds.toFixed(1).replace(".0", "")} 秒`;
}

const placeholderImage: StoryboardImageState = {
  placeholder: true,
  status: "placeholder"
};

function storyboardImageStatusLabel(image: StoryboardImageState, label: string) {
  if (image.status === "generating") {
    return `${label}生成中`;
  }

  if (image.status === "placeholder" && image.reason === "waiting_for_asset_images") {
    return "等待角色/场景资产图";
  }

  if (image.status === "placeholder" && image.reason === "reference_images_unsupported") {
    return "当前生图服务未启用资产图参考";
  }

  return `等待${label}`;
}

function readyExpandedFrameCount(images: StoryboardImageState[]) {
  return images.filter((image) => image.status === "ready").length;
}
