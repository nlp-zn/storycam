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
    <section className="rounded-lg border border-stone-700/70 bg-[#201d18]/85 p-4 shadow-2xl shadow-black/20">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-teal-200">先确认故事世界</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">{storyWorld.storyWorld.script.title}</h2>
        </div>
        <span
          className={`rounded-md border px-3 py-2 text-sm ${
            isConfirmed ? "border-teal-500 text-teal-100" : "border-amber-400/80 text-amber-100"
          }`}
        >
          {isConfirmed ? "已确认" : "待确认"}
        </span>
      </div>

      <div className="rounded-md border border-amber-300/70 bg-[#2c2419] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase text-amber-200">我的剧本</p>
          <button
            className="rounded-md border border-stone-600 px-3 py-1.5 text-xs font-semibold text-stone-200 transition hover:border-amber-300 hover:text-amber-100"
            onClick={() => setIsEditingScript((current) => !current)}
            type="button"
          >
            改剧本
          </button>
        </div>

        <p className="mt-3 text-lg font-medium leading-7 text-stone-50">{storyWorld.storyWorld.script.logline}</p>

        {isEditingScript ? (
          <div className="mt-4">
            <label className="text-sm font-medium text-stone-200" htmlFor="story-world-script-summary">
              我的剧本内容
            </label>
            <textarea
              className="mt-2 min-h-28 w-full resize-none rounded-md border border-stone-700 bg-stone-950/70 p-3 text-sm leading-6 text-stone-100 outline-none transition focus:border-rose-300"
              id="story-world-script-summary"
              onChange={(event) => setScriptSummary(event.target.value)}
              value={scriptSummary}
            />
            <button
              className="mt-3 rounded-md bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
              onClick={saveScriptEdit}
              type="button"
            >
              保存修改
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-stone-300">{scriptSummary}</p>
        )}

        <ol className="mt-4 grid gap-2 sm:grid-cols-3">
          {storyWorld.storyWorld.script.beats.map((beat, index) => (
            <li className="rounded-md bg-stone-950/60 p-3 text-sm leading-6 text-stone-300" key={beat}>
              <span className="mb-1 block text-xs text-amber-200">第 {index + 1} 拍</span>
              {beat}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
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

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-md bg-teal-400 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-teal-300"
          onClick={onConfirm}
          type="button"
        >
          对，继续拍这一段
        </button>
        <button
          className="rounded-md border border-stone-600 px-4 py-2 text-sm font-semibold text-stone-200 transition hover:border-amber-300 hover:text-amber-100"
          type="button"
        >
          重新生成
        </button>
        <button
          className="rounded-md border border-stone-700 px-4 py-2 text-sm font-semibold text-stone-400 transition hover:border-rose-300 hover:text-rose-100"
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
