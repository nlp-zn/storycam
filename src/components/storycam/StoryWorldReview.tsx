"use client";

import { useState } from "react";
import { AssetCard } from "@/components/storycam/AssetCard";
import type { CreateStoryWorldResponse } from "@/features/storycam/client/storycamApi";

type StoryWorldReviewProps = {
  isDeleting?: boolean;
  isConfirmed: boolean;
  onConfirm: () => void;
  onDeleteStory: () => void;
  onEditSaved: (summary: string) => void;
  storyWorld: CreateStoryWorldResponse;
};

export function StoryWorldReview({
  isConfirmed,
  isDeleting = false,
  onConfirm,
  onDeleteStory,
  onEditSaved,
  storyWorld
}: StoryWorldReviewProps) {
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [scriptSummary, setScriptSummary] = useState(storyWorld.storyWorld.script.summary);

  function saveScriptEdit() {
    setIsEditingScript(false);
    onEditSaved(scriptSummary.trim() || storyWorld.storyWorld.script.summary);
  }

  return (
    <section className="storycam-panel">
      <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="storycam-eyebrow">确认故事世界</p>
          <h2 className="storycam-heading-lg mt-2">{storyWorld.storyWorld.script.title}</h2>
          <p className="mt-3 text-base leading-7 text-[#b9cacb]">审查你的剧本、人物和地点，确认像你的故事后再进入核心分镜。</p>
        </div>
        <span
          className={`rounded-full border px-4 py-2 text-sm font-bold ${
            isConfirmed ? "border-[#00f0ff] text-[#00f0ff]" : "border-[#ffcfbe]/80 text-[#ffcfbe]"
          }`}
        >
          {isConfirmed ? "已确认" : "待确认"}
        </span>
      </div>

      <div className="storycam-glass relative overflow-hidden rounded-[2rem] p-6">
        <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] [background-size:18px_18px]" />
        <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <p className="storycam-eyebrow">我的剧本</p>
          <button
            className="storycam-secondary-button px-4 py-2 text-xs"
            onClick={() => setIsEditingScript((current) => !current)}
            type="button"
          >
            改剧本
          </button>
        </div>

        <p className="relative mt-5 border-l-2 border-[#00f0ff]/50 pl-4 text-xl font-bold leading-8 text-[#e2e2e2]">
          {storyWorld.storyWorld.script.logline}
        </p>

        {isEditingScript ? (
          <div className="relative mt-4">
            <label className="text-sm font-bold text-[#e2e2e2]" htmlFor="story-world-script-summary">
              我的剧本内容
            </label>
            <textarea
              className="mt-2 min-h-28 w-full resize-none rounded-[1.5rem] border border-[#3b494b] bg-black/40 p-4 text-sm leading-6 text-[#e2e2e2] outline-none transition focus:border-[#00f0ff]"
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
          <p className="relative mt-4 text-sm leading-6 text-[#b9cacb]">{scriptSummary}</p>
        )}

        <ol className="relative mt-5 grid gap-3 sm:grid-cols-3">
          {storyWorld.storyWorld.script.beats.map((beat, index) => (
            <li className="rounded-[1.25rem] border border-white/10 bg-black/30 p-4 text-sm leading-6 text-[#b9cacb]" key={beat}>
              <span className="mb-1 block text-xs font-bold text-[#00f0ff]">第 {index + 1} 拍</span>
              {beat}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {storyWorld.storyWorld.characterAssets.map((asset) => (
          <AssetCard
            eyebrow="人物"
            key={asset.name}
            lines={[
              `${asset.role}：${asset.relationshipToUserStory}`,
              asset.stableVisualDescription,
              `${asset.emotionalBaseline}${asset.wardrobe ? `；${asset.wardrobe}` : ""}`
            ]}
            title={asset.name}
          />
        ))}
        {storyWorld.storyWorld.sceneAssets.map((asset) => (
          <AssetCard
            eyebrow="地点"
            key={asset.name}
            lines={[`${asset.location}，${asset.timeOfDay}`, `${asset.light}；${asset.atmosphere}`, asset.spatialLogic]}
            title={asset.name}
          />
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
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
          className="storycam-secondary-button storycam-danger-button"
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
