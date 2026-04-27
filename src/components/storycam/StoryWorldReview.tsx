"use client";

import { useState } from "react";
import { AssetCard } from "@/components/storycam/AssetCard";
import {
  generateStoryWorldAssetImage,
  type CreateStoryWorldResponse,
  type GenerateStoryWorldAssetImageResponse
} from "@/features/storycam/client/storycamApi";

type StoryWorldReviewProps = {
  initiallyEditing?: boolean;
  isDeleting?: boolean;
  isConfirmed: boolean;
  onConfirm: () => void;
  onDeleteStory: () => void;
  onEditSaved: (summary: string) => void;
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
      title: string;
    };

type AssetImageState = Record<string, GenerateStoryWorldAssetImageResponse["media"]>;

export function StoryWorldReview({
  initiallyEditing = false,
  isConfirmed,
  isDeleting = false,
  onConfirm,
  onDeleteStory,
  onEditSaved,
  storyWorld
}: StoryWorldReviewProps) {
  const [isEditingScript, setIsEditingScript] = useState(initiallyEditing);
  const [scriptSummary, setScriptSummary] = useState(storyWorld.storyWorld.script.summary);
  const [assetImages, setAssetImages] = useState<AssetImageState>({});
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);
  const [generatingAssetId, setGeneratingAssetId] = useState<string | null>(null);
  const [assetImageError, setAssetImageError] = useState<string | null>(null);

  function saveScriptEdit() {
    setIsEditingScript(false);
    onEditSaved(scriptSummary.trim() || storyWorld.storyWorld.script.summary);
  }

  async function generateSelectedAssetImage() {
    if (!selectedAsset || generatingAssetId) {
      return;
    }

    try {
      setAssetImageError(null);
      setGeneratingAssetId(selectedAsset.artifactId);
      const result = await generateStoryWorldAssetImage({
        assetArtifactId: selectedAsset.artifactId,
        assetKind: selectedAsset.kind,
        sessionId: storyWorld.sessionId
      });

      setAssetImages((current) => ({
        ...current,
        [selectedAsset.artifactId]: result.media
      }));
    } catch (error) {
      setAssetImageError(messageForAssetImageError(error));
    } finally {
      setGeneratingAssetId(null);
    }
  }

  return (
    <section className="storycam-story-world relative" data-testid="story-world-review">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#00f0ff]/20 bg-[#00f0ff]/10 px-4 py-2">
            <span className="size-2 rounded-full bg-[#00f0ff]" />
            <span className="storycam-eyebrow">步骤 2</span>
          </div>
          <h1 className="storycam-heading-lg">确认故事世界</h1>
          <p className="mt-3 text-lg leading-8 text-[#b9cacb]">审查你的生成资产和剧本组件。</p>
        </div>
        <span
          className={`rounded-full border px-4 py-2 text-sm font-bold ${
            isConfirmed ? "border-[#00f0ff] text-[#00f0ff]" : "border-[#ffcfbe]/80 text-[#ffcfbe]"
          }`}
        >
          {isConfirmed ? "已确认" : "待确认"}
        </span>
      </div>

      <div className="storycam-story-world-grid" data-testid="story-world-layout-grid">
        <div className="storycam-script-column">
          <div className="storycam-glass storycam-script-card relative overflow-hidden p-6 md:p-8" data-testid="story-world-script-card">
            <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] [background-size:18px_18px]" />
            <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full border border-[#00f0ff]/30 bg-[#00f0ff]/10 text-sm font-black text-[#00f0ff]">
                  文
                </span>
                <div>
                  <p className="storycam-eyebrow">我的剧本</p>
                  <p className="mt-1 text-xs font-bold text-[#849495]">
                    {storyWorld.storyWorld.script.title} · V {storyWorld.storyWorld.script.version}
                  </p>
                </div>
              </div>
              <button
                className="storycam-secondary-button px-4 py-2 text-xs"
                onClick={() => setIsEditingScript((current) => !current)}
                type="button"
              >
                改剧本
              </button>
            </div>

            <p className="relative mt-6 border-l-2 border-[#00f0ff]/50 pl-4 text-xl font-bold leading-8 text-[#e2e2e2]">
              {storyWorld.storyWorld.script.logline}
            </p>

            {isEditingScript ? (
              <div className="relative mt-5">
                <label className="text-sm font-bold text-[#e2e2e2]" htmlFor="story-world-script-summary">
                  我的剧本内容
                </label>
                <textarea
                  className="mt-2 min-h-40 w-full resize-none rounded-[1.5rem] border border-[#3b494b] bg-black/40 p-4 text-sm leading-6 text-[#e2e2e2] outline-none transition focus:border-[#00f0ff]"
                  id="story-world-script-summary"
                  onChange={(event) => setScriptSummary(event.target.value)}
                  value={scriptSummary}
                />
                <button
                  className="storycam-primary-button mt-3"
                  onClick={saveScriptEdit}
                  type="button"
                >
                  保存修改
                </button>
              </div>
            ) : (
              <p className="relative mt-5 max-h-[420px] overflow-y-auto pr-2 text-base leading-8 text-[#b9cacb]">{scriptSummary}</p>
            )}

            <ol className="relative mt-6 grid gap-3">
              {storyWorld.storyWorld.script.beats.map((beat, index) => (
                <li className="rounded-[1.25rem] border border-white/10 bg-black/30 p-4 text-sm leading-6 text-[#b9cacb]" key={beat}>
                  <span className="mb-1 block text-xs font-bold text-[#00f0ff]">第 {index + 1} 拍</span>
                  {beat}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="storycam-assets-column">
          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black text-[#e2e2e2]">角色资产</h2>
              <span className="storycam-eyebrow">{storyWorld.storyWorld.characterAssets.length} ready</span>
            </div>
            <div className="storycam-asset-grid storycam-asset-grid--characters">
              {storyWorld.storyWorld.characterAssets.map((asset, index) => (
                <AssetCard
                  eyebrow="人物"
                  imageUrl={imageUrlFor(storyWorld.artifacts.characterAssets[index]?.id, assetImages)}
                  key={asset.name}
                  lines={[
                    `${asset.role}：${asset.relationshipToUserStory}`,
                    asset.stableVisualDescription,
                    `${asset.emotionalBaseline}${asset.wardrobe ? `；${asset.wardrobe}` : ""}`
                  ]}
                  meta={index === 0 ? "主要" : undefined}
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
                  status={statusForAsset(storyWorld.artifacts.characterAssets[index]?.id, assetImages, generatingAssetId, assetImageError)}
                  title={asset.name}
                  tone="character"
                />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black text-[#e2e2e2]">场景资产</h2>
              <span className="storycam-eyebrow">{storyWorld.storyWorld.sceneAssets.length} ready</span>
            </div>
            <div className="storycam-asset-grid storycam-asset-grid--scenes">
              {storyWorld.storyWorld.sceneAssets.map((asset, index) => (
                <AssetCard
                  eyebrow="地点"
                  imageUrl={imageUrlFor(storyWorld.artifacts.sceneAssets[index]?.id, assetImages)}
                  key={asset.name}
                  lines={[`${asset.location}，${asset.timeOfDay}`, `${asset.light}；${asset.atmosphere}`, asset.spatialLogic]}
                  meta={asset.timeOfDay}
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
                        title: asset.name
                      });
                      setAssetImageError(null);
                    }
                  }}
                  status={statusForAsset(
                    storyWorld.artifacts.sceneAssets[index]?.id,
                    assetImages,
                    generatingAssetId,
                    assetImageError
                  )}
                  title={asset.name}
                  tone="scene"
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      {selectedAsset ? (
        <AssetImageModal
          asset={selectedAsset}
          error={assetImageError}
          imageUrl={assetImages[selectedAsset.artifactId]?.signedUrl}
          isGenerating={generatingAssetId === selectedAsset.artifactId}
          onClose={() => setSelectedAsset(null)}
          onGenerate={generateSelectedAssetImage}
        />
      ) : null}

      <div className="storycam-bottom-dock">
        <button
          className="storycam-primary-button"
          onClick={onConfirm}
          type="button"
        >
          对，继续拍这一段
        </button>
        <button
          className="storycam-secondary-button"
          type="button"
        >
          重新生成
        </button>
        <button
          className="storycam-secondary-button storycam-danger-button hidden sm:inline-flex"
          disabled={isDeleting}
          onClick={onDeleteStory}
          type="button"
        >
          {isDeleting ? "正在删除" : "删除这个故事"}
        </button>
      </div>
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
        <button className="storycam-asset-modal-close" onClick={onClose} type="button" aria-label="关闭资产生成窗口">
          ×
        </button>
        <div className="storycam-asset-modal-copy">
          <p className="storycam-eyebrow">{isScene ? "场景资产" : "角色资产"}</p>
          <h3>{asset.title}</h3>
          <div className="mt-5 space-y-3">
            {asset.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          {error ? <p className="storycam-asset-modal-error">{error}</p> : null}
          <button className="storycam-primary-button mt-6" disabled={isGenerating} onClick={onGenerate} type="button">
            {isGenerating ? "正在生成资产图" : imageUrl ? "重新生成资产图" : "生成资产图"}
          </button>
        </div>
        <div className="storycam-asset-modal-visual">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`${asset.title} 生成资产`} src={imageUrl} />
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

function statusForAsset(
  assetArtifactId: string | undefined,
  assetImages: AssetImageState,
  generatingAssetId: string | null,
  error: string | null
): "empty" | "generating" | "ready" | "error" {
  if (!assetArtifactId) {
    return "empty";
  }

  if (generatingAssetId === assetArtifactId) {
    return "generating";
  }

  if (assetImages[assetArtifactId]) {
    return "ready";
  }

  return error ? "error" : "empty";
}

function messageForAssetImageError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "image_provider_not_configured") {
      return "请先把 STORYCAM_IMAGE_PROVIDER 设为 openrouter，并配置 OPENROUTER_IMAGE_MODEL。";
    }

    if (error.message === "OPENROUTER_IMAGE_INVALID_OUTPUT") {
      return "图像模型返回不稳定，请再试一次。";
    }

    if (error.message === "authentication_required") {
      return "请先登录，再生成资产图。";
    }
  }

  return "资产图生成失败，请稍后再试。";
}
