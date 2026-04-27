"use client";

import { useState } from "react";
import { AssetCard } from "@/components/storycam/AssetCard";
import type { CreateStoryWorldResponse } from "@/features/storycam/client/storycamApi";

type StoryWorldReviewProps = {
  initiallyEditing?: boolean;
  isDeleting?: boolean;
  isConfirmed: boolean;
  onConfirm: () => void;
  onDeleteStory: () => void;
  onEditSaved: (summary: string) => void;
  storyWorld: CreateStoryWorldResponse;
};

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

  function saveScriptEdit() {
    setIsEditingScript(false);
    onEditSaved(scriptSummary.trim() || storyWorld.storyWorld.script.summary);
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
                  key={asset.name}
                  lines={[
                    `${asset.role}：${asset.relationshipToUserStory}`,
                    asset.stableVisualDescription,
                    `${asset.emotionalBaseline}${asset.wardrobe ? `；${asset.wardrobe}` : ""}`
                  ]}
                  meta={index === 0 ? "主要" : undefined}
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
              {storyWorld.storyWorld.sceneAssets.map((asset) => (
                <AssetCard
                  eyebrow="地点"
                  key={asset.name}
                  lines={[`${asset.location}，${asset.timeOfDay}`, `${asset.light}；${asset.atmosphere}`, asset.spatialLogic]}
                  meta={asset.timeOfDay}
                  title={asset.name}
                  tone="scene"
                />
              ))}
            </div>
          </section>
        </div>
      </div>

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
