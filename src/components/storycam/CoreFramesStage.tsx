import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCcw, X } from "lucide-react";
import { StoryCamBottomDock } from "@/components/storycam/StoryCamPrimitives";
import { Button } from "@/components/ui/button";
import type {
  CreateStoryboardResponse,
  ExpandStoryboardGroupResponse,
  StoryboardImageState
} from "@/features/storycam/client/storycamApi";
import {
  storyCamVideoModelLabel,
  storyCamVideoModels,
  type StoryCamVideoAspectRatio,
  type StoryCamVideoModel
} from "@/features/storycam/domain/videoSettings";

type StoryboardScriptView =
  | CreateStoryboardResponse["storyboard"]["storyboardScript"]
  | NonNullable<CreateStoryboardResponse["storyboard"]["storyboardScripts"]>[number];

type CoreFramesStageProps = {
  expansion: ExpandStoryboardGroupResponse | null;
  generationPanel?: ReactNode;
  isBusy?: boolean;
  isExpansionLoading: boolean;
  isRegeneratingFrame: (frameNumber: number) => boolean;
  onBackToStoryWorld: () => void;
  onConfirmExpansion: (index: number) => void;
  onGenerateClip: (index: number) => void;
  onMediaLoadError?: () => void;
  onRegenerateFrame: (index: number, frameNumber: number) => void;
  onSelectGroup: (index: number) => void;
  onVideoModelChange: (model: StoryCamVideoModel) => void;
  selectedIndex: number;
  storyboard: CreateStoryboardResponse;
  videoAspectRatio: StoryCamVideoAspectRatio;
  videoModel: StoryCamVideoModel;
};

type FrameView = {
  description: string;
  frameNumber: number;
  image?: StoryboardImageState;
  label: string;
  position: string;
  title: string;
};

const requiredExpandedFrameCount = 8;

const canvasSlots = [
  { frameNumber: 2, label: "左上", position: "top-left" },
  { frameNumber: 3, label: "上方", position: "top" },
  { frameNumber: 4, label: "右上", position: "top-right" },
  { frameNumber: 5, label: "右侧", position: "right" },
  { frameNumber: 6, label: "右下", position: "bottom-right" },
  { frameNumber: 7, label: "下方", position: "bottom" },
  { frameNumber: 8, label: "左下", position: "bottom-left" },
  { frameNumber: 9, label: "左侧", position: "left" }
] as const;

const placeholderImage: StoryboardImageState = {
  placeholder: true,
  status: "placeholder"
};
const emptyExpandedImages: StoryboardImageState[] = [];
const emptyExpansionCards: ExpandStoryboardGroupResponse["expansionCards"] = [];
const maxAudioCueCount = 6;
const audioCueSeparatorPattern = /[、/，,；;]+/;

export function CoreFramesStage({
  expansion,
  generationPanel,
  isBusy = false,
  isExpansionLoading,
  isRegeneratingFrame,
  onBackToStoryWorld,
  onConfirmExpansion,
  onGenerateClip,
  onMediaLoadError,
  onRegenerateFrame,
  onSelectGroup,
  onVideoModelChange,
  selectedIndex,
  storyboard,
  videoAspectRatio,
  videoModel
}: CoreFramesStageProps) {
  const [previewFrameNumber, setPreviewFrameNumber] = useState<number | null>(null);
  const [isVideoModelMenuOpen, setIsVideoModelMenuOpen] = useState(false);
  const videoModelMenuRef = useRef<HTMLDivElement>(null);
  const coreGroups = storyboard.storyboard.coreStoryboardGroups.slice(0, 1);
  const activeIndex = Math.min(selectedIndex, coreGroups.length - 1);
  const selectedGroup = coreGroups[activeIndex] ?? coreGroups[0];
  const selectedScript = storyboard.storyboard.storyboardScripts?.[activeIndex] ?? storyboard.storyboard.storyboardScript;
  const expandedImages = expansion?.expandedStoryboardImages.length
    ? expansion.expandedStoryboardImages
    : selectedGroup?.expandedStoryboardImages ?? emptyExpandedImages;
  const expansionCards = expansion?.expansionCards ?? emptyExpansionCards;
  const hasStartedExpansion = isExpansionLoading || expansionCards.length > 0 || expandedImages.length > 0;
  const readyExpandedCount = readyExpandedFrameCount(expandedImages);
  const canGenerateClip = readyExpandedCount >= requiredExpandedFrameCount;
  const frames = useMemo(
    () =>
      selectedGroup
        ? buildFrameViews({
            cards: expansionCards,
            expandedImages,
            selectedGroup,
            selectedScript
          })
        : [],
    [expandedImages, expansionCards, selectedGroup, selectedScript]
  );
  const readyFrames = frames.filter((frame) => frame.image?.status === "ready");
  const previewFrame = frames.find((frame) => frame.frameNumber === previewFrameNumber && frame.image?.status === "ready");
  const audioSummary = audioSummaryForScript(selectedScript);
  const canStartExpansion = canAttemptExpansionFromImage(selectedGroup?.representativeImage);

  useEffect(() => {
    if (!isVideoModelMenuOpen) {
      return;
    }

    function closeWhenOutside(event: PointerEvent) {
      if (!videoModelMenuRef.current?.contains(event.target as Node)) {
        setIsVideoModelMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsVideoModelMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isVideoModelMenuOpen]);

  if (!selectedGroup) {
    return null;
  }

  function movePreview(delta: number) {
    setPreviewFrameNumber((currentFrameNumber) => {
      if (readyFrames.length <= 1) {
        return currentFrameNumber;
      }

      const currentIndex = readyFrames.findIndex((frame) => frame.frameNumber === currentFrameNumber);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + delta + readyFrames.length) % readyFrames.length;

      return readyFrames[nextIndex]?.frameNumber ?? currentFrameNumber;
    });
  }

  function expandSelectedGroup() {
    if (!canStartExpansion) {
      return;
    }

    onSelectGroup(activeIndex);
    onConfirmExpansion(activeIndex);
  }

  function renderExpansionSlots() {
    if (!hasStartedExpansion) {
      return null;
    }

    return canvasSlots.map((slot) => {
      const frame = frames.find((item) => item.frameNumber === slot.frameNumber);

      return (
        <ExpansionSlot
          frame={frame}
          hasStartedExpansion={hasStartedExpansion}
          isGenerating={isExpansionLoading || frame?.image?.status === "generating"}
          isRegenerating={isRegeneratingFrame(slot.frameNumber)}
          key={slot.position}
          onMediaLoadError={onMediaLoadError}
          onPreview={() => setPreviewFrameNumber(slot.frameNumber)}
          onRegenerate={() => onRegenerateFrame(activeIndex, slot.frameNumber)}
          position={slot.position}
          selectedGroupTitle={selectedGroup.title}
        />
      );
    });
  }

  return (
    <section className="storycam-core-stage relative" data-testid="core-storyboard-card">
      <header className="storycam-core-hero">
        <div className="storycam-section-kicker">
          <span />
          <p>第三部：核心分镜</p>
          <span />
        </div>
        <h1 className="storycam-heading-xl">核心分镜</h1>
        <p>点击中心主帧后，系统自动延展周围 8 张分镜图，确认后生成 Seedance 片段。</p>
      </header>

      <div className="storycam-core-workbench">
        <div className="storycam-core-board-panel">
          <div className="storycam-core-board-header">
            <h2>01 · 自动延展画布</h2>
            <div className="storycam-core-board-status">
              <span>中心主图</span>
              <strong>{storyboardImageStateLabel(selectedGroup.representativeImage ?? placeholderImage)}</strong>
              <span>扩展中</span>
              <strong>{readyExpandedCount} / 8</strong>
            </div>
          </div>

          <div
            className="storycam-expansion-board storycam-core-inline-board"
            data-aspect-ratio={videoAspectRatio}
            data-expanded={hasStartedExpansion ? "true" : "false"}
          >
            {renderExpansionSlots()}
            <CoreSlot
              canStartExpansion={canStartExpansion}
              frame={frames[0]}
              hasStartedExpansion={hasStartedExpansion}
              isLoading={isExpansionLoading}
              isRegenerating={isRegeneratingFrame(1)}
              onConfirmExpansion={expandSelectedGroup}
              onMediaLoadError={onMediaLoadError}
              onPreview={() => setPreviewFrameNumber(1)}
              onRegenerate={() => onRegenerateFrame(activeIndex, 1)}
              selectedGroupTitle={selectedGroup.title}
            />
          </div>
        </div>

        <aside className="storycam-core-script-panel">
          <div className="storycam-core-script-header">
            <div>
              <p className="storycam-eyebrow">分镜脚本</p>
              <h2>{selectedGroup.title}</h2>
            </div>
            <span>{frames.length} 帧</span>
          </div>
          <ol className="storycam-script-frame-list storycam-core-script-list">
            {frames.map((frame) => (
              <li key={frame.frameNumber}>
                <span>{String(frame.frameNumber).padStart(2, "0")}</span>
                <div>
                  <strong>{frame.title}</strong>
                  <p>{frame.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="storycam-core-script-more">共 9 个分镜，滚动查看更多</p>
          <div className="storycam-core-audio-note">
            <p className="storycam-eyebrow">音频提示</p>
            <span>{audioSummary}</span>
          </div>
        </aside>
      </div>

      {generationPanel ? <div className="mt-8">{generationPanel}</div> : null}

      {!generationPanel ? (
        <StoryCamBottomDock className="storycam-core-dock">
          <div className="rounded-full border border-white/10 bg-black/40 px-5 py-3 text-sm font-black text-[#dbfcff]">
            1 组 · 约 {formatDuration(selectedGroup.estimatedClipDurationSeconds)}内
          </div>
          <Button onClick={onBackToStoryWorld} type="button" variant="secondaryGlass">
            返回故事世界
          </Button>
          <VideoModelMenu
            isBusy={isBusy}
            isOpen={isVideoModelMenuOpen}
            menuRef={videoModelMenuRef}
            onChange={onVideoModelChange}
            onOpenChange={setIsVideoModelMenuOpen}
            value={videoModel}
          />
          <Button
            disabled={isBusy || !canGenerateClip}
            onClick={() => onGenerateClip(activeIndex)}
            type="button"
            variant="primaryNeon"
          >
            {canGenerateClip ? "用这一组生成片段" : "等待分镜完成"}
          </Button>
          <div className="storycam-core-dock-progress">
            <span />
            {readyExpandedCount} / 8 已完成
          </div>
        </StoryCamBottomDock>
      ) : null}

      {previewFrame ? (
        <FramePreviewModal
          canStep={readyFrames.length > 1}
          frame={previewFrame}
          key={previewFrame.frameNumber}
          onClose={() => setPreviewFrameNumber(null)}
          onMediaLoadError={onMediaLoadError}
          onNext={() => movePreview(1)}
          onPrevious={() => movePreview(-1)}
          videoAspectRatio={videoAspectRatio}
        />
      ) : null}
    </section>
  );
}

function VideoModelMenu({
  isBusy,
  isOpen,
  menuRef,
  onChange,
  onOpenChange,
  value
}: {
  isBusy: boolean;
  isOpen: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onChange: (model: StoryCamVideoModel) => void;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  value: StoryCamVideoModel;
}) {
  function selectModel(model: StoryCamVideoModel) {
    onChange(model);
    onOpenChange(false);
  }

  return (
    <div className="storycam-video-model-menu" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`选择视频模型，当前为 ${storyCamVideoModelLabel(value)}`}
        className="storycam-video-model-trigger"
        disabled={isBusy}
        onClick={() => onOpenChange((current) => !current)}
        type="button"
      >
        <span className="storycam-video-model-trigger-label">{storyCamVideoModelLabel(value)}</span>
        <ChevronDown aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
      </button>
      {isOpen ? (
        <div className="storycam-video-model-menu-panel" role="menu">
          {storyCamVideoModels.map((model) => (
            <button
              aria-checked={value === model}
              className="storycam-video-model-menu-item"
              key={model}
              onClick={() => selectModel(model)}
              role="menuitemradio"
              type="button"
            >
              {storyCamVideoModelLabel(model)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CoreSlot({
  canStartExpansion,
  frame,
  hasStartedExpansion,
  isLoading,
  isRegenerating,
  onConfirmExpansion,
  onMediaLoadError,
  onPreview,
  onRegenerate,
  selectedGroupTitle
}: {
  canStartExpansion: boolean;
  frame?: FrameView;
  hasStartedExpansion: boolean;
  isLoading: boolean;
  isRegenerating: boolean;
  onConfirmExpansion: () => void;
  onMediaLoadError?: () => void;
  onPreview: () => void;
  onRegenerate: () => void;
  selectedGroupTitle: string;
}) {
  const canPreview = hasStartedExpansion && frame?.image?.status === "ready";
  const isDisabled = isLoading || (!hasStartedExpansion && !canStartExpansion) || (hasStartedExpansion && !canPreview);
  const canRegenerate =
    hasStartedExpansion ||
    (frame?.image?.status === "placeholder" && Boolean(frame.image.reason) && frame.image.reason !== "waiting_for_asset_images");

  return (
    <article className="storycam-expansion-slot storycam-expansion-slot--center" data-testid="storyboard-frame-01">
      <button
        aria-label={hasStartedExpansion ? "查看第 01 帧大图" : "点击中心主图生成扩展分镜"}
        className="storycam-expansion-image-button"
        disabled={isDisabled}
        onClick={hasStartedExpansion ? onPreview : onConfirmExpansion}
        type="button"
      >
        <StoryboardImage
          alt={`${selectedGroupTitle} 主分镜图`}
          image={frame?.image}
          onMediaLoadError={onMediaLoadError}
          variant="core"
        />
      </button>
      <div className="storycam-expansion-slot-overlay" />
      <FrameLabel frameNumber={1} label="中心主图" />
      <div className="storycam-expansion-slot-copy">
        <h3>{frame?.title ?? selectedGroupTitle}</h3>
        <p>
          {hasStartedExpansion
            ? frame?.description
            : canStartExpansion
              ? "点击中心主图，沿这一帧展开 8 张扩展分镜。"
              : "等待第 01 帧主分镜图生成后再展开 8 张扩展分镜。"}
        </p>
      </div>
      {isLoading ? <FrameSpinner label="拓展中" /> : null}
      {canRegenerate ? (
        <button
          aria-label="重生成第 01 帧"
          className="storycam-frame-retry"
          disabled={isRegenerating}
          onClick={onRegenerate}
          type="button"
        >
          <RefreshCcw aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
          {isRegenerating ? "生成中" : "重生成"}
        </button>
      ) : null}
    </article>
  );
}

function ExpansionSlot({
  frame,
  hasStartedExpansion,
  isGenerating,
  isRegenerating,
  onMediaLoadError,
  onPreview,
  onRegenerate,
  position,
  selectedGroupTitle
}: {
  frame?: FrameView;
  hasStartedExpansion: boolean;
  isGenerating: boolean;
  isRegenerating: boolean;
  onMediaLoadError?: () => void;
  onPreview: () => void;
  onRegenerate: () => void;
  position: string;
  selectedGroupTitle: string;
}) {
  const frameNumber = frame?.frameNumber ?? frameNumberForPosition(position);
  const canPreview = frame?.image?.status === "ready";
  const canRegenerate = hasStartedExpansion && Boolean(frame);

  return (
    <article
      className="storycam-expansion-slot"
      data-position={position}
      data-testid={`storyboard-frame-${String(frameNumber).padStart(2, "0")}`}
    >
      <button
        aria-label={`查看第 ${String(frameNumber).padStart(2, "0")} 帧大图`}
        className="storycam-expansion-image-button"
        disabled={!canPreview}
        onClick={onPreview}
        type="button"
      >
        <StoryboardImage
          alt={`${selectedGroupTitle} 扩展分镜 ${frameNumber - 1}`}
          hideStatusLabel={isGenerating}
          image={frame?.image}
          onMediaLoadError={onMediaLoadError}
          variant="expanded"
        />
      </button>
      <div className="storycam-expansion-slot-overlay" />
      <FrameLabel frameNumber={frameNumber} label={frame?.label ?? "扩展帧"} />
      <div className="storycam-expansion-slot-copy">
        <h3>{frame?.title ?? "等待生成"}</h3>
        <p>{frame?.description ?? "点击中心主图后，这一帧会承接对应的动作或反应。"}</p>
      </div>
      {isGenerating ? <FrameSpinner label="生成中" /> : null}
      {canRegenerate ? (
        <button
          aria-label={`重生成第 ${String(frameNumber).padStart(2, "0")} 帧`}
          className="storycam-frame-retry"
          disabled={isRegenerating}
          onClick={onRegenerate}
          type="button"
        >
          <RefreshCcw aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
          {isRegenerating ? "生成中" : "重生成"}
        </button>
      ) : null}
    </article>
  );
}

function FramePreviewModal({
  canStep,
  frame,
  onClose,
  onMediaLoadError,
  onNext,
  onPrevious,
  videoAspectRatio
}: {
  canStep: boolean;
  frame: FrameView;
  onClose: () => void;
  onMediaLoadError?: () => void;
  onNext: () => void;
  onPrevious: () => void;
  videoAspectRatio: StoryCamVideoAspectRatio;
}) {
  return (
    <div aria-label={`第 ${String(frame.frameNumber).padStart(2, "0")} 帧大图`} className="storycam-frame-preview" role="dialog">
      <div className="storycam-frame-preview-card" data-aspect-ratio={videoAspectRatio}>
        <div className="storycam-frame-preview-header">
          <div>
            <p className="storycam-eyebrow">
              {String(frame.frameNumber).padStart(2, "0")} · {frame.label}
            </p>
            <h3>{frame.title}</h3>
          </div>
          <Button aria-label="关闭大图" className="px-4 py-2 text-xs" onClick={onClose} size="sm" type="button" variant="secondaryGlass">
            <X aria-hidden="true" data-icon="inline-start" strokeWidth={2.4} />
            关闭
          </Button>
        </div>
        <div className="storycam-frame-preview-image">
          <StoryboardImage
            alt={`第 ${String(frame.frameNumber).padStart(2, "0")} 帧大图`}
            image={frame.image}
            onMediaLoadError={onMediaLoadError}
            variant="expanded"
          />
        </div>
        <div className="storycam-frame-preview-footer">
          <p>{frame.description}</p>
          <div className="flex gap-2">
            <Button className="px-4 py-2 text-xs" disabled={!canStep} onClick={onPrevious} size="sm" type="button" variant="secondaryGlass">
              <ChevronLeft aria-hidden="true" data-icon="inline-start" strokeWidth={2.4} />
              上一张
            </Button>
            <Button className="px-4 py-2 text-xs" disabled={!canStep} onClick={onNext} size="sm" type="button" variant="secondaryGlass">
              下一张
              <ChevronRight aria-hidden="true" data-icon="inline-end" strokeWidth={2.4} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoryboardImage({
  alt,
  hideStatusLabel = false,
  image,
  onMediaLoadError,
  variant
}: {
  alt: string;
  hideStatusLabel?: boolean;
  image?: StoryboardImageState;
  onMediaLoadError?: () => void;
  variant: "core" | "expanded";
}) {
  if (image?.status === "ready") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={alt}
        className="size-full object-cover"
        onError={(event) => {
          event.currentTarget.hidden = true;
          onMediaLoadError?.();
        }}
        src={image.signedUrl}
      />
    );
  }

  return (
    <div className={`storycam-cinematic-frame storycam-frame-placeholder storycam-frame-placeholder--${variant}`}>
      {hideStatusLabel ? null : <span>{storyboardImageStatusLabel(image)}</span>}
    </div>
  );
}

function FrameLabel({ frameNumber, label }: { frameNumber: number; label: string }) {
  return (
    <div className="storycam-frame-label">
      <span>{String(frameNumber).padStart(2, "0")}</span>
      <strong>{label}</strong>
    </div>
  );
}

function FrameSpinner({ label }: { label: string }) {
  return (
    <div className="storycam-frame-spinner" role="status">
      <span />
      <strong>{label}</strong>
    </div>
  );
}

function formatDuration(seconds: number) {
  return `${seconds.toFixed(1).replace(".0", "")} 秒`;
}

function storyboardImageStateLabel(image: StoryboardImageState) {
  if (image.status === "ready") {
    return "READY";
  }

  if (image.status === "generating") {
    return "生成中";
  }

  return "等待中";
}

function storyboardImageStatusLabel(image?: StoryboardImageState) {
  if (image?.status === "generating") {
    return "生成中";
  }

  if (image?.status === "placeholder" && image.reason === "waiting_for_asset_images") {
    return "等待角色/场景资产图";
  }

  if (image?.status === "placeholder" && image.reason === "reference_images_unsupported") {
    return "未启用资产图参考";
  }

  return "等待生成";
}

function canAttemptExpansionFromImage(image?: StoryboardImageState) {
  if (image?.status === "ready") {
    return true;
  }

  return image?.status === "placeholder" && Boolean(image.reason) && image.reason !== "waiting_for_asset_images";
}

function audioSummaryForScript(script?: StoryboardScriptView) {
  const cues = uniqueAudioCues((script?.frames ?? []).map((frame) => frame.sound));

  if (cues.length === 0) {
    return "音频：跟随当前画面生成环境声与动作声";
  }

  return `音频：${cues.slice(0, maxAudioCueCount).join(" / ")}`;
}

function uniqueAudioCues(sounds: string[]) {
  const seen = new Set<string>();
  const cues: string[] = [];

  for (const sound of sounds) {
    for (const part of audioCueParts(sound)) {
      const normalized = part.replace(/\s+/g, "");

      if (!seen.has(normalized)) {
        seen.add(normalized);
        cues.push(part);
      }
    }
  }

  return cues;
}

function audioCueParts(sound: string) {
  return sound
    .split(audioCueSeparatorPattern)
    .map((part) => part.trim())
    .filter(Boolean);
}

function readyExpandedFrameCount(images: StoryboardImageState[]) {
  return images.filter((image) => image.status === "ready").length;
}

function frameNumberForPosition(position: string) {
  return canvasSlots.find((slot) => slot.position === position)?.frameNumber ?? 2;
}

function buildFrameViews(input: {
  cards: ExpandStoryboardGroupResponse["expansionCards"];
  expandedImages: StoryboardImageState[];
  selectedGroup: CreateStoryboardResponse["storyboard"]["coreStoryboardGroups"][number];
  selectedScript?: StoryboardScriptView;
}): FrameView[] {
  const scriptFrames = input.selectedScript?.frames ?? [];
  const centerFrame = scriptFrames.find((frame) => frame.frameNumber === 1);

  return [
    {
      description: centerFrame?.visualContent ?? input.selectedGroup.storyPurpose,
      frameNumber: 1,
      image: input.selectedGroup.representativeImage ?? placeholderImage,
      label: "中心主图",
      position: "center",
      title: centerFrame?.title ?? input.selectedGroup.title
    },
    ...canvasSlots.map((slot) => {
      const card = cardForFrame(input.cards, slot.frameNumber);
      const scriptFrame = scriptFrames.find((frame) => frame.frameNumber === slot.frameNumber);

      return {
        description: card?.description ?? scriptFrame?.visualContent ?? scriptFrame?.narrativePurpose ?? "沿中心主图补全这一拍。",
        frameNumber: slot.frameNumber,
        image: card?.image ?? input.expandedImages[slot.frameNumber - 2],
        label: slot.label,
        position: slot.position,
        title: card?.title ?? scriptFrame?.title ?? `分镜 ${String(slot.frameNumber).padStart(2, "0")}`
      };
    })
  ];
}

function cardForFrame(cards: ExpandStoryboardGroupResponse["expansionCards"], frameNumber: number) {
  return cards.find((card) => (card.frameNumber ?? card.sortOrder + 2) === frameNumber);
}
