"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { Info, X } from "lucide-react";
import { AssetCard } from "@/components/storycam/AssetCard";
import { StoryCamBottomDock } from "@/components/storycam/StoryCamPrimitives";
import { Button } from "@/components/ui/button";
import {
  generateStoryWorldAssetImage,
  generateStoryWorldAssetImages,
  getGenerationJob,
  type CreateStoryWorldResponse,
  type GenerateStoryWorldAssetImageResponse,
  type ScenePanel,
  type StoryboardImageState
} from "@/features/storycam/client/storycamApi";
import {
  imageGenerationPollingPolicy,
  mapWithConcurrencyLimit,
  nextImageGenerationPollDelayMs
} from "@/features/storycam/client/jobPolling";

type StoryWorldReviewProps = {
  initialAssetImages?: AssetImageState;
  initiallyEditing?: boolean;
  isGeneratingStoryboard?: boolean;
  isConfirmed: boolean;
  onAssetImageReady?: (artifactId: string, media: NonNullable<GenerateStoryWorldAssetImageResponse["media"]>) => void;
  onConfirm: (coreGroupTargetCount: 1 | 2 | 3) => void;
  onEditSaved: (summary: string) => void;
  onMediaLoadError?: () => void;
  storyWorld: CreateStoryWorldResponse;
};

type SelectedAsset =
  | {
      artifactId: string;
      kind: "character";
      lines: string[];
      title: string;
    }
  | {
      artifactId: string;
      kind: "scene";
      lines: string[];
      panels: ScenePanel[];
      title: string;
    };

type AssetImageState = Record<string, NonNullable<GenerateStoryWorldAssetImageResponse["media"]>>;
type AssetImageJobState = Record<string, string>;

export function StoryWorldReview({
  initialAssetImages,
  initiallyEditing = false,
  isGeneratingStoryboard = false,
  onAssetImageReady,
  onConfirm,
  onEditSaved,
  onMediaLoadError,
  storyWorld
}: StoryWorldReviewProps) {
  const [isEditingScript, setIsEditingScript] = useState(initiallyEditing);
  const [scriptSummaryState, setScriptSummaryState] = useState(() => ({
    sessionId: storyWorld.sessionId,
    sourceSummary: storyWorld.storyWorld.script.summary,
    value: storyWorld.storyWorld.script.summary
  }));
  const [assetImagesState, setAssetImagesState] = useState(() => ({
    images: initialAssetImages ?? {},
    initialAssetImages,
    sessionId: storyWorld.sessionId
  }));
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);
  const [assetImageJobs, setAssetImageJobs] = useState<AssetImageJobState>({});
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  const [assetImageError, setAssetImageError] = useState<string | null>(null);
  const assetImagePollAttemptsRef = useRef<Record<string, number>>({});
  const scriptSummary = scriptSummaryState.value;
  const assetImages = assetImagesState.images;
  const scriptParagraphs = scriptParagraphsFor(scriptSummary, storyWorld.storyWorld.script.beats);
  const assetIds = storyWorldAssetIds(storyWorld);
  const readyCharacterAssetCount = readyAssetCount(assetIds.character, assetImages);
  const readySceneAssetCount = readyAssetCount(assetIds.scene, assetImages);

  if (
    scriptSummaryState.sessionId !== storyWorld.sessionId ||
    scriptSummaryState.sourceSummary !== storyWorld.storyWorld.script.summary
  ) {
    setScriptSummaryState({
      sessionId: storyWorld.sessionId,
      sourceSummary: storyWorld.storyWorld.script.summary,
      value: storyWorld.storyWorld.script.summary
    });
  }

  if (assetImagesState.sessionId !== storyWorld.sessionId || assetImagesState.initialAssetImages !== initialAssetImages) {
    setAssetImagesState({
      images: initialAssetImages ?? {},
      initialAssetImages,
      sessionId: storyWorld.sessionId
    });
  }

  function setScriptSummary(value: SetStateAction<string>) {
    setScriptSummaryState((current) => ({
      ...current,
      value: typeof value === "function" ? value(current.value) : value
    }));
  }

  function setAssetImages(value: SetStateAction<AssetImageState>) {
    setAssetImagesState((current) => ({
      ...current,
      images: typeof value === "function" ? value(current.images) : value
    }));
  }

  const applyReadyAssetImage = useCallback(
    (artifactId: string, image: Extract<StoryboardImageState, { status: "ready" }>) => {
      const media = mediaFromReadyImage(image);
      setAssetImages((current) => ({
        ...current,
        [artifactId]: media
      }));
      onAssetImageReady?.(artifactId, media);
    },
    [onAssetImageReady]
  );

  useEffect(() => {
    const jobEntries = Object.entries(assetImageJobs);

    if (jobEntries.length === 0) {
      assetImagePollAttemptsRef.current = {};
      return;
    }

    const pendingJobIds = new Set(jobEntries.map(([, jobId]) => jobId));
    assetImagePollAttemptsRef.current = Object.fromEntries(
      Object.entries(assetImagePollAttemptsRef.current).filter(([jobId]) => pendingJobIds.has(jobId))
    );

    let canceled = false;
    let isPolling = false;
    let timer: number | undefined;

    const pollJobs = async () => {
      if (isPolling) {
        return;
      }

      isPolling = true;
      const results = await mapWithConcurrencyLimit(
        jobEntries,
        imageGenerationPollingPolicy.maxConcurrentRequests,
        async ([artifactId, jobId]) => ({
          artifactId,
          jobId,
          result: await getGenerationJob(jobId)
        })
      );
      isPolling = false;

      if (canceled) {
        return;
      }

      for (const [index, result] of results.entries()) {
        const fallbackJobId = jobEntries[index]?.[1];

        if (!fallbackJobId) {
          continue;
        }

        if (result.status !== "fulfilled") {
          assetImagePollAttemptsRef.current[fallbackJobId] =
            (assetImagePollAttemptsRef.current[fallbackJobId] ?? 0) + 1;
          continue;
        }

        assetImagePollAttemptsRef.current[result.value.jobId] =
          (assetImagePollAttemptsRef.current[result.value.jobId] ?? 0) + 1;
        const image = result.value.result.image;

        if (image?.status === "ready") {
          delete assetImagePollAttemptsRef.current[result.value.jobId];
          applyReadyAssetImage(result.value.artifactId, image);
          setAssetImageJobs((current) => removeJob(current, result.value.artifactId));
          continue;
        }

        if (image?.status === "placeholder" || result.value.result.job.status === "failed") {
          delete assetImagePollAttemptsRef.current[result.value.jobId];
          setAssetImageJobs((current) => removeJob(current, result.value.artifactId));
          setAssetImageError("部分资产图生成失败，可以单独重试。");
        }
      }

      const remainingJobIds = jobEntries
        .map(([, jobId]) => jobId)
        .filter((jobId) => assetImagePollAttemptsRef.current[jobId] !== undefined);

      if (remainingJobIds.length > 0) {
        const completedAttempts = Math.min(
          ...remainingJobIds.map((jobId) => assetImagePollAttemptsRef.current[jobId] ?? 0)
        );
        timer = window.setTimeout(pollJobs, nextImageGenerationPollDelayMs(completedAttempts));
      }
    };

    timer = window.setTimeout(pollJobs, nextImageGenerationPollDelayMs(0));

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [applyReadyAssetImage, assetImageJobs]);

  function saveScriptEdit() {
    setIsEditingScript(false);
    onEditSaved(scriptSummary.trim() || storyWorld.storyWorld.script.summary);
  }

  async function generateSelectedAssetImage() {
    if (!selectedAsset || assetImageJobs[selectedAsset.artifactId]) {
      return;
    }

    try {
      setAssetImageError(null);
      const result = await generateStoryWorldAssetImage({
        assetArtifactId: selectedAsset.artifactId,
        assetKind: selectedAsset.kind,
        sessionId: storyWorld.sessionId
      });

      applyAssetImageResult(selectedAsset.artifactId, result.image);
    } catch (error) {
      setAssetImageError(messageForAssetImageError(error));
    }
  }

  async function generateAllAssetImages() {
    if (isBatchSubmitting || Object.keys(assetImageJobs).length > 0) {
      return;
    }

    try {
      setIsBatchSubmitting(true);
      setAssetImageError(null);
      const result = await generateStoryWorldAssetImages({
        assetArtifactIds: assetIds.all,
        sessionId: storyWorld.sessionId
      });

      for (const [artifactId, item] of Object.entries(result.imagesByArtifactId)) {
        applyAssetImageResult(artifactId, item.image);
      }
    } catch (error) {
      setAssetImageError(messageForAssetImageError(error));
    } finally {
      setIsBatchSubmitting(false);
    }
  }

  function applyAssetImageResult(artifactId: string, image: StoryboardImageState) {
    if (image.status === "ready") {
      applyReadyAssetImage(artifactId, image);
      setAssetImageJobs((current) => removeJob(current, artifactId));
      return;
    }

    if (image.status === "generating") {
      setAssetImageJobs((current) => ({
        ...current,
        [artifactId]: image.jobId
      }));
      return;
    }

    setAssetImageJobs((current) => removeJob(current, artifactId));
    setAssetImageError("资产图生成失败，可以稍后重试。");
  }

  return (
    <section className="storycam-story-world relative" data-testid="story-world-review">
      <div className="storycam-story-world-hero">
        <div className="storycam-section-kicker">
          <span />
          <p>第二部：故事世界</p>
          <span />
        </div>
        <h1 className="storycam-heading-lg">确认故事世界</h1>
        <p>审查剧本、人物与场景资产，确认后进入核心分镜。</p>
      </div>

      <div className="storycam-story-world-grid" data-testid="story-world-layout-grid">
        <div className="storycam-script-column">
          <div className="storycam-glass storycam-script-card relative overflow-hidden p-6 md:p-8" data-testid="story-world-script-card">
            <div className="storycam-script-card-texture" />
            <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <span className="storycam-script-icon">
                  文
                </span>
                <div>
                  <p className="storycam-eyebrow">我的剧本</p>
                  <p className="mt-1 text-xs font-bold text-[#849495]">
                    {storyWorld.storyWorld.script.title} · V {storyWorld.storyWorld.script.version}
                  </p>
                </div>
              </div>
              <Button
                className="px-4 py-2 text-xs"
                onClick={() => setIsEditingScript((current) => !current)}
                size="sm"
                type="button"
                variant="secondaryGlass"
              >
                改剧本
              </Button>
            </div>

            <div className="storycam-logline-box">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#00f0ff]">故事一句话</p>
              <p className="mt-2 text-lg font-black leading-8 text-[#eefbfc]">{storyWorld.storyWorld.script.logline}</p>
            </div>

            {isEditingScript ? (
              <div className="relative mt-5">
                <label className="text-sm font-bold text-[#e2e2e2]" htmlFor="story-world-script-summary">
                  整体剧本内容
                </label>
                <textarea
                  className="mt-2 min-h-40 w-full resize-none rounded-[1.5rem] border border-[#3b494b] bg-black/40 p-4 text-sm leading-6 text-[#e2e2e2] outline-none transition focus:border-[#00f0ff]"
                  id="story-world-script-summary"
                  onChange={(event) => setScriptSummary(event.target.value)}
                  value={scriptSummary}
                />
                <Button
                  className="mt-3"
                  onClick={saveScriptEdit}
                  type="button"
                  variant="primaryNeon"
                >
                  保存修改
                </Button>
              </div>
            ) : (
              <article className="storycam-script-body">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-[#849495]">完整剧本</p>
                <div className="space-y-5">
                  {scriptParagraphs.map((paragraph, index) => (
                    <p className="text-[15px] font-semibold leading-8 text-[#d5e2e3]" key={`${paragraph}-${index}`}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </article>
            )}

            <div className="relative mt-6 border-t border-white/10 pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="storycam-eyebrow">关键片段</p>
                <span className="text-xs font-bold text-[#849495]">{storyWorld.storyWorld.script.beats.length} 段</span>
              </div>
              <ol className="storycam-story-beats">
                {storyWorld.storyWorld.script.beats.map((beat, index) => (
                  <li key={beat}>
                    <span>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p>{beat}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <div className="storycam-assets-column">
          <div className="storycam-asset-generate-banner">
            <p>
              <span aria-hidden="true">
                <Info className="size-3.5" strokeWidth={2.4} />
              </span>
              资产图会并发提交，完成后逐张出现。
            </p>
            <Button
              className="px-4 py-2 text-xs"
              disabled={isBatchSubmitting || Object.keys(assetImageJobs).length > 0}
              onClick={generateAllAssetImages}
              size="sm"
              type="button"
              variant="secondaryGlass"
            >
              {isBatchSubmitting || Object.keys(assetImageJobs).length > 0 ? "资产图生成中" : "生成全部资产图"}
            </Button>
          </div>
          <section>
            <div className="storycam-asset-section-header">
              <h2 className="text-2xl font-black text-[#e2e2e2]">角色资产</h2>
              <span className="storycam-eyebrow">{readyCharacterAssetCount} READY</span>
            </div>
            <div
              className="storycam-asset-grid storycam-asset-grid--characters"
              data-character-count={storyWorld.storyWorld.characterAssets.length}
            >
              {storyWorld.storyWorld.characterAssets.map((asset, index) => (
                <AssetCard
                  eyebrow="人物"
                  imageUrl={imageUrlFor(storyWorld.artifacts.characterAssets[index]?.id, assetImages)}
                  key={asset.name}
                  layout={storyWorld.storyWorld.characterAssets.length === 1 ? "wide" : "standard"}
                  lines={[
                    `${asset.role}：${asset.relationshipToUserStory}`,
                    asset.stableVisualDescription,
                    `${asset.emotionalBaseline}${asset.wardrobe ? `；${asset.wardrobe}` : ""}`
                  ]}
                  meta={index === 0 ? "主要" : undefined}
                  onImageError={onMediaLoadError}
                  onOpen={() => {
                    const artifactId = storyWorld.artifacts.characterAssets[index]?.id;

                    if (artifactId) {
                      setSelectedAsset({
                        artifactId,
                        kind: "character",
                        lines: [
                          `${asset.role}：${asset.relationshipToUserStory}`,
                          asset.stableVisualDescription,
                          `${asset.emotionalBaseline}${asset.wardrobe ? `；${asset.wardrobe}` : ""}`,
                          asset.props.length ? `道具：${asset.props.join("、")}` : "道具：无"
                        ],
                        title: asset.name
                      });
                      setAssetImageError(null);
                    }
                  }}
                  status={statusForAsset(storyWorld.artifacts.characterAssets[index]?.id, assetImages, assetImageJobs, assetImageError)}
                  title={asset.name}
                  tone="character"
                />
              ))}
            </div>
          </section>

          <section>
            <div className="storycam-asset-section-header">
              <h2 className="text-2xl font-black text-[#e2e2e2]">场景资产</h2>
              <span className="storycam-eyebrow">{readySceneAssetCount} READY</span>
            </div>
            <div className="storycam-asset-grid storycam-asset-grid--scenes">
              {storyWorld.storyWorld.sceneAssets.slice(0, 1).map((asset, index) => {
                const panels = scenePanelsForAsset(asset, storyWorld.storyWorld.script.beats);

                return (
                  <AssetCard
                    eyebrow="地点"
                    imageUrl={imageUrlFor(storyWorld.artifacts.sceneAssets[index]?.id, assetImages)}
                    key={asset.name}
                    lines={[
                      `${asset.location}，${asset.timeOfDay}`,
                      `${asset.light}；${asset.atmosphere}`,
                      `${panels.length} 个场景小切图：${panels.map((panel) => panel.title).join("、")}`
                    ]}
                    meta={`${panels.length} 切图`}
                    onImageError={onMediaLoadError}
                    onOpen={() => {
                      const artifactId = storyWorld.artifacts.sceneAssets[index]?.id;

                      if (artifactId) {
                        setSelectedAsset({
                          artifactId,
                          kind: "scene",
                          lines: [
                            `${asset.location}，${asset.timeOfDay}`,
                            `${asset.light}；${asset.atmosphere}`,
                            `关键物件：${asset.keyObjects.join("、")}`,
                            asset.spatialLogic
                          ],
                          panels,
                          title: asset.name
                        });
                        setAssetImageError(null);
                      }
                    }}
                    status={statusForAsset(
                      storyWorld.artifacts.sceneAssets[index]?.id,
                      assetImages,
                      assetImageJobs,
                      assetImageError
                    )}
                    title={asset.name}
                    tone="scene"
                  />
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {selectedAsset ? (
        <AssetImageModal
          asset={selectedAsset}
          error={assetImageError}
          imageUrl={assetImages[selectedAsset.artifactId]?.signedUrl}
          isGenerating={Boolean(assetImageJobs[selectedAsset.artifactId])}
          onClose={() => setSelectedAsset(null)}
          onGenerate={generateSelectedAssetImage}
        />
      ) : null}

      <StoryCamBottomDock>
        <div className="rounded-full border border-white/10 bg-black/40 px-5 py-3 text-sm font-black text-[#dbfcff]">
          1 组 · 约 15 秒内
        </div>
        <Button
          disabled={isGeneratingStoryboard}
          onClick={() => onConfirm(1)}
          type="button"
          variant="primaryNeon"
        >
          {isGeneratingStoryboard ? "正在生成核心分镜" : "对，生成核心分镜"}
        </Button>
      </StoryCamBottomDock>
    </section>
  );
}

function AssetImageModal({
  asset,
  error,
  imageUrl,
  isGenerating,
  onClose,
  onGenerate
}: {
  asset: SelectedAsset;
  error: string | null;
  imageUrl?: string;
  isGenerating: boolean;
  onClose: () => void;
  onGenerate: () => void;
}) {
  const isScene = asset.kind === "scene";

  return (
    <div className="storycam-asset-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${asset.title} 资产生成`}>
      <div className={`storycam-asset-modal ${isScene ? "storycam-asset-modal--scene" : "storycam-asset-modal--character"}`}>
        <Button aria-label="关闭资产生成窗口" className="storycam-asset-modal-close" onClick={onClose} size="icon-lg" type="button" variant="iconGlass">
          <X aria-hidden="true" data-icon="icon" strokeWidth={2.4} />
        </Button>
        <div className="storycam-asset-modal-copy">
          <div className="storycam-asset-modal-copy-body">
            <p className="storycam-eyebrow">{isScene ? "场景资产" : "角色资产"}</p>
            <h3>{asset.title}</h3>
            <div className="mt-5 space-y-3">
              {asset.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            {isScene ? (
              <ol className="mt-5 grid gap-2">
                {asset.panels.map((panel, index) => (
                  <li className="rounded-2xl border border-white/10 bg-black/25 p-3" key={`${panel.title}-${index}`}>
                    <span className="storycam-eyebrow">切图 {index + 1} · {shotTypeLabel(panel.shotType)}</span>
                    <p className="mt-1 text-sm font-black text-[#e2e2e2]">{panel.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#b9cacb]">{panel.description}</p>
                  </li>
                ))}
              </ol>
            ) : null}
            {error ? <p className="storycam-asset-modal-error">{error}</p> : null}
          </div>
          <div className="storycam-asset-modal-actions">
            <Button disabled={isGenerating} onClick={onGenerate} type="button" variant="primaryNeon">
              {isGenerating ? "正在生成资产图" : imageUrl ? "重新生成资产图" : "生成资产图"}
            </Button>
          </div>
        </div>
        <div className="storycam-asset-modal-visual">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`${asset.title} 生成资产`}
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
              src={imageUrl}
            />
          ) : (
            <div className="storycam-asset-modal-placeholder">
              <span>{isGenerating ? "生成中" : "等待生成"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function imageUrlFor(assetArtifactId: string | undefined, assetImages: AssetImageState) {
  return assetArtifactId ? assetImages[assetArtifactId]?.signedUrl : undefined;
}

function scriptParagraphsFor(summary: string, beats: string[]) {
  const paragraphs = splitReadableParagraphs(summary);

  if (paragraphs.length >= 2) {
    return paragraphs;
  }

  return [
    ...paragraphs,
    ...beats
      .map((beat) => beat.trim())
      .filter(Boolean)
      .filter((beat) => !paragraphs.some((paragraph) => paragraph.includes(beat) || beat.includes(paragraph)))
  ].slice(0, 6);
}

function splitReadableParagraphs(value: string) {
  return value
    .split(/\n{2,}|(?<=[。！？!?])\s+(?=\S)/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function scenePanelsForAsset(
  asset: {
    keyObjects: string[];
    light: string;
    location: string;
    name: string;
    scenePanels?: ScenePanel[];
    spatialLogic: string;
  },
  beats: string[]
) {
  if (asset.scenePanels?.length) {
    return asset.scenePanels;
  }

  const keyObjects = asset.keyObjects.length ? asset.keyObjects : ["主空间", "关键物件", "光线"];

  return [
    {
      description: `${asset.location} 的完整空间关系。`,
      keyObjects: keyObjects.slice(0, 3),
      purpose: "建立故事发生的主场景。",
      shotType: "establishing" as const,
      title: asset.name
    },
    {
      description: asset.light,
      keyObjects: keyObjects.slice(0, 3),
      purpose: "固定整组场景的光线基调。",
      shotType: "lighting" as const,
      title: "光线关系"
    },
    {
      description: keyObjects.join("、"),
      keyObjects,
      purpose: "明确后续分镜需要保持一致的关键物件。",
      shotType: "detail" as const,
      title: "关键物件"
    },
    {
      description: beats[0] ?? asset.spatialLogic,
      keyObjects: keyObjects.slice(0, 3),
      purpose: "为后续角色入画预留空的动作空间。",
      shotType: "medium" as const,
      title: "动作空间"
    }
  ] satisfies ScenePanel[];
}

function shotTypeLabel(shotType: ScenePanel["shotType"]) {
  const labels: Record<ScenePanel["shotType"], string> = {
    detail: "细节",
    establishing: "主场景",
    lighting: "光线",
    medium: "中景",
    overhead: "俯视",
    transition: "转场",
    wide: "广角"
  };

  return labels[shotType];
}

function statusForAsset(
  assetArtifactId: string | undefined,
  assetImages: AssetImageState,
  assetImageJobs: AssetImageJobState,
  error: string | null
): "empty" | "generating" | "ready" | "error" {
  if (!assetArtifactId) {
    return "empty";
  }

  if (assetImageJobs[assetArtifactId]) {
    return "generating";
  }

  if (assetImages[assetArtifactId]) {
    return "ready";
  }

  return error ? "error" : "empty";
}

function storyWorldAssetIds(storyWorld: CreateStoryWorldResponse) {
  const character = storyWorld.artifacts.characterAssets.map((artifact) => artifact.id);
  const scene = storyWorld.artifacts.sceneAssets.slice(0, 1).map((artifact) => artifact.id);

  return {
    all: [...character, ...scene],
    character,
    scene
  };
}

function readyAssetCount(assetArtifactIds: string[], assetImages: AssetImageState) {
  return assetArtifactIds.filter((artifactId) => Boolean(assetImages[artifactId])).length;
}

function mediaFromReadyImage(image: Extract<StoryboardImageState, { status: "ready" }>): NonNullable<AssetImageState[string]> {
  return {
    id: image.mediaId,
    mimeType: image.mimeType,
    signedUrl: image.signedUrl,
    signedUrlExpiresIn: image.signedUrlExpiresIn
  };
}

function removeJob(current: AssetImageJobState, artifactId: string) {
  const next = { ...current };
  delete next[artifactId];

  return next;
}

function messageForAssetImageError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "image_provider_not_configured") {
      return "请先把 STORYCAM_IMAGE_PROVIDER 设为 inference_sh，并配置 INFERENCE_API_KEY 和 INFERENCE_IMAGE_APP。";
    }

    if (error.message === "OPENROUTER_IMAGE_INVALID_OUTPUT" || error.message === "INFERENCE_SH_IMAGE_INVALID_OUTPUT") {
      return "图像模型返回不稳定，请再试一次。";
    }

    if (error.message === "OPENROUTER_IMAGE_REGION_UNAVAILABLE") {
      return "当前代理出口暂不支持这个图像模型，请切换代理后再试。";
    }

    if (error.message === "OPENROUTER_IMAGE_PROVIDER_BLOCKED") {
      return "图像模型被上游服务拒绝，请检查 OpenRouter 账号或模型使用条款。";
    }

    if (error.message === "INFERENCE_SH_IMAGE_AUTH_FAILED") {
      return "Inference.sh 鉴权失败，请检查 INFERENCE_API_KEY。";
    }

    if (error.message === "INFERENCE_SH_IMAGE_REQUIREMENTS_NOT_MET") {
      return "Inference.sh 应用缺少必需的模型密钥，请在 Inference.sh 配置 OPENAI_KEY。";
    }

    if (error.message === "authentication_required") {
      return "请先登录，再生成资产图。";
    }
  }

  return "资产图生成失败，请稍后再试。";
}
