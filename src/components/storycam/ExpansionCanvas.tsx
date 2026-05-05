"use client";

import { useMemo, useState } from "react";
import type {
  CreateStoryboardResponse,
  ExpandStoryboardGroupResponse,
  StoryboardImageState
} from "@/features/storycam/client/storycamApi";

type StoryboardScriptView =
  | CreateStoryboardResponse["storyboard"]["storyboardScript"]
  | NonNullable<CreateStoryboardResponse["storyboard"]["storyboardScripts"]>[number];

type ExpansionCanvasProps = {
  expansion: ExpandStoryboardGroupResponse | null;
  isLoading: boolean;
  isRegeneratingFrame: (frameNumber: number) => boolean;
  onClose: () => void;
  onConfirmExpansion: () => void;
  onGenerateClip: () => void;
  onRegenerateFrame: (frameNumber: number) => void;
  selectedGroup: CreateStoryboardResponse["storyboard"]["coreStoryboardGroups"][number];
  selectedIndex: number;
  selectedScript?: StoryboardScriptView;
};

type FrameView = {
  description: string;
  frameNumber: number;
  image?: StoryboardImageState;
  label: string;
  position: string;
  title: string;
};

const canvasSlots = [
  { frameNumber: 2, label: "左上", position: "top-left" },
  { frameNumber: 3, label: "上方", position: "top" },
  { frameNumber: 4, label: "右上", position: "top-right" },
  { frameNumber: 5, label: "左侧", position: "left" },
  { frameNumber: 6, label: "右侧", position: "right" },
  { frameNumber: 7, label: "左下", position: "bottom-left" },
  { frameNumber: 8, label: "下方", position: "bottom" },
  { frameNumber: 9, label: "右下", position: "bottom-right" }
] as const;

export function ExpansionCanvas({
  expansion,
  isLoading,
  isRegeneratingFrame,
  onClose,
  onConfirmExpansion,
  onGenerateClip,
  onRegenerateFrame,
  selectedGroup,
  selectedIndex,
  selectedScript
}: ExpansionCanvasProps) {
  const [previewFrameNumber, setPreviewFrameNumber] = useState<number | null>(null);
  const cards = expansion?.expansionCards ?? [];
  const expandedImages = expansion?.expandedStoryboardImages.length ? expansion.expandedStoryboardImages : selectedGroup.expandedStoryboardImages;
  const hasStartedExpansion = isLoading || cards.length > 0 || expandedImages.length > 0;
  const frames = useMemo(
    () => buildFrameViews({ cards, expandedImages, selectedGroup, selectedScript }),
    [cards, expandedImages, selectedGroup, selectedScript]
  );
  const readyFrames = frames.filter((frame) => frame.image?.status === "ready");
  const previewFrame = frames.find((frame) => frame.frameNumber === previewFrameNumber && frame.image?.status === "ready");

  function movePreview(delta: number) {
    if (!previewFrame || readyFrames.length <= 1) {
      return;
    }

    const currentIndex = readyFrames.findIndex((frame) => frame.frameNumber === previewFrame.frameNumber);
    const nextIndex = (currentIndex + delta + readyFrames.length) % readyFrames.length;
    setPreviewFrameNumber(readyFrames[nextIndex]?.frameNumber ?? null);
  }

  return (
    <div
      aria-label={`${selectedGroup.title} 9 帧分镜画布`}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-xl"
      role="dialog"
    >
      <section className="storycam-expansion-modal">
        <div className="storycam-expansion-modal-header">
          <div>
            <p className="storycam-eyebrow">核心分镜 {String(selectedIndex + 1).padStart(2, "0")} · 9 帧画布</p>
            <h2 className="mt-1 text-2xl font-black text-[#e2e2e2]">{selectedGroup.title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="storycam-secondary-button px-4 py-2 text-xs" onClick={onClose} type="button">
              收起
            </button>
            <button className="storycam-primary-button px-4 py-2 text-xs" onClick={onGenerateClip} type="button">
              用这一组生成片段
            </button>
          </div>
        </div>

        <div className="storycam-expansion-modal-body">
          <div className="storycam-expansion-board" data-expanded={hasStartedExpansion ? "true" : "false"}>
            {hasStartedExpansion
              ? canvasSlots.map((slot) => {
                  const frame = frames.find((item) => item.frameNumber === slot.frameNumber);

                  return (
                    <ExpansionSlot
                      frame={frame}
                      isGenerating={isLoading || frame?.image?.status === "generating"}
                      isRegenerating={isRegeneratingFrame(slot.frameNumber)}
                      key={slot.position}
                      onPreview={() => setPreviewFrameNumber(slot.frameNumber)}
                      onRegenerate={() => onRegenerateFrame(slot.frameNumber)}
                      position={slot.position}
                    />
                  );
                })
              : null}
            <CoreSlot
              frame={frames[0]}
              hasStartedExpansion={hasStartedExpansion}
              isLoading={isLoading}
              isRegenerating={isRegeneratingFrame(1)}
              onConfirmExpansion={onConfirmExpansion}
              onPreview={() => setPreviewFrameNumber(1)}
              onRegenerate={() => onRegenerateFrame(1)}
            />
          </div>

          <aside className="storycam-expansion-script-panel">
            <p className="storycam-eyebrow">脚本摘要</p>
            <h3 className="mt-3 text-lg font-black text-[#e2e2e2]">{selectedScript?.planSummary ?? selectedGroup.storyPurpose}</h3>
            <p className="mt-3 text-sm leading-6 text-[#b9cacb]">{selectedScript?.rhythm ?? selectedGroup.emotionalTurn}</p>
            <div className="mt-5 rounded-[1rem] border border-[#00f0ff]/24 bg-[#00f0ff]/10 p-4 text-sm font-black text-[#dbfcff]">
              {expandedImages.filter((image) => image?.status === "ready").length} / 8 张扩展分镜图
            </div>
            <ol className="storycam-script-frame-list">
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
          </aside>
        </div>
      </section>

      {previewFrame ? (
        <FramePreviewModal
          canStep={readyFrames.length > 1}
          frame={previewFrame}
          onClose={() => setPreviewFrameNumber(null)}
          onNext={() => movePreview(1)}
          onPrevious={() => movePreview(-1)}
        />
      ) : null}
    </div>
  );
}

function CoreSlot({
  frame,
  hasStartedExpansion,
  isLoading,
  isRegenerating,
  onConfirmExpansion,
  onPreview,
  onRegenerate
}: {
  frame?: FrameView;
  hasStartedExpansion: boolean;
  isLoading: boolean;
  isRegenerating: boolean;
  onConfirmExpansion: () => void;
  onPreview: () => void;
  onRegenerate: () => void;
}) {
  const canPreview = hasStartedExpansion && frame?.image?.status === "ready";

  return (
    <article className="storycam-expansion-slot storycam-expansion-slot--center" data-testid="storyboard-frame-01">
      <button
        aria-label={hasStartedExpansion ? "查看第 01 帧大图" : "点击中心主图生成扩展分镜"}
        className="storycam-expansion-image-button"
        disabled={isLoading || (hasStartedExpansion && !canPreview)}
        onClick={hasStartedExpansion ? onPreview : onConfirmExpansion}
        type="button"
      >
        <StoryboardImage alt={`${frame?.title ?? "中心主图"} 主分镜图`} image={frame?.image} />
      </button>
      <div className="storycam-expansion-slot-overlay" />
      <FrameLabel frameNumber={1} label="中心主图" />
      <div className="storycam-expansion-slot-copy">
        <h3>{frame?.title ?? "中心主图"}</h3>
        <p>{hasStartedExpansion ? frame?.description : "点击中心主图，沿这一帧展开 8 张扩展分镜。"}</p>
      </div>
      {isLoading ? <FrameSpinner label="拓展中" /> : null}
      {hasStartedExpansion ? (
        <button
          aria-label="重生成第 01 帧"
          className="storycam-frame-retry"
          disabled={isRegenerating}
          onClick={onRegenerate}
          type="button"
        >
          {isRegenerating ? "生成中" : "重生成"}
        </button>
      ) : null}
    </article>
  );
}

function ExpansionSlot({
  frame,
  isGenerating,
  isRegenerating,
  onPreview,
  onRegenerate,
  position
}: {
  frame?: FrameView;
  isGenerating: boolean;
  isRegenerating: boolean;
  onPreview: () => void;
  onRegenerate: () => void;
  position: string;
}) {
  const frameNumber = frame?.frameNumber ?? 2;
  const canPreview = frame?.image?.status === "ready";
  const canRegenerate = Boolean(frame);

  return (
    <article className="storycam-expansion-slot" data-position={position} data-testid={`storyboard-frame-${String(frameNumber).padStart(2, "0")}`}>
      <button
        aria-label={`查看第 ${String(frameNumber).padStart(2, "0")} 帧大图`}
        className="storycam-expansion-image-button"
        disabled={!canPreview}
        onClick={onPreview}
        type="button"
      >
        <StoryboardImage alt={`扩展分镜 ${frameNumber}`} image={frame?.image} />
      </button>
      <div className="storycam-expansion-slot-overlay" />
      <FrameLabel frameNumber={frameNumber} label={frame?.label ?? "扩展帧"} />
      <div className="storycam-expansion-slot-copy">
        <h3>{frame?.title ?? "等待生成"}</h3>
        <p>{frame?.description ?? "中心主图扩展后，这一帧会承接对应的动作或反应。"}</p>
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
  onNext,
  onPrevious
}: {
  canStep: boolean;
  frame: FrameView;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <div aria-label={`第 ${String(frame.frameNumber).padStart(2, "0")} 帧大图`} className="storycam-frame-preview" role="dialog">
      <div className="storycam-frame-preview-card">
        <div className="storycam-frame-preview-header">
          <div>
            <p className="storycam-eyebrow">{String(frame.frameNumber).padStart(2, "0")} · {frame.label}</p>
            <h3>{frame.title}</h3>
          </div>
          <button aria-label="关闭大图" className="storycam-secondary-button px-4 py-2 text-xs" onClick={onClose} type="button">
            关闭
          </button>
        </div>
        <div className="storycam-frame-preview-image">
          <StoryboardImage alt={`第 ${String(frame.frameNumber).padStart(2, "0")} 帧大图`} image={frame.image} />
        </div>
        <div className="storycam-frame-preview-footer">
          <p>{frame.description}</p>
          <div className="flex gap-2">
            <button className="storycam-secondary-button px-4 py-2 text-xs" disabled={!canStep} onClick={onPrevious} type="button">
              上一张
            </button>
            <button className="storycam-secondary-button px-4 py-2 text-xs" disabled={!canStep} onClick={onNext} type="button">
              下一张
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoryboardImage({ alt, image }: { alt: string; image?: StoryboardImageState }) {
  if (image?.status === "ready") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={alt} className="size-full object-cover" src={image.signedUrl} />
    );
  }

  return (
    <div className="storycam-cinematic-frame flex size-full items-center justify-center rounded-none px-4 text-center text-xs font-black text-[#dbfcff]/75 opacity-70">
      {storyboardImageStatusLabel(image)}
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

function storyboardImageStatusLabel(image?: StoryboardImageState) {
  if (image?.status === "placeholder" && image.reason === "waiting_for_asset_images") {
    return "等待角色/场景资产图";
  }

  if (image?.status === "placeholder" && image.reason === "reference_images_unsupported") {
    return "未启用资产图参考";
  }

  return "";
}

function buildFrameViews(input: {
  cards: ExpandStoryboardGroupResponse["expansionCards"];
  expandedImages: StoryboardImageState[];
  selectedGroup: ExpansionCanvasProps["selectedGroup"];
  selectedScript?: StoryboardScriptView;
}): FrameView[] {
  const scriptFrames = input.selectedScript?.frames ?? [];
  const centerFrame = scriptFrames.find((frame) => frame.frameNumber === 1);

  return [
    {
      description: centerFrame?.visualContent ?? input.selectedGroup.storyPurpose,
      frameNumber: 1,
      image: input.selectedGroup.representativeImage,
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
