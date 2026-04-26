"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createStoryWorld, uploadStoryCamPhoto } from "@/features/storycam/client/storycamApi";
import type { CreateStoryWorldResponse } from "@/features/storycam/client/storycamApi";
import { directorChoices, storyModeEntries } from "@/features/storycam/domain/shellContent";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting"; message: string }
  | { kind: "success"; message: string; sessionId: string }
  | { kind: "error"; message: string };

type IdeaInputPanelProps = {
  onStoryWorldCreated?: (storyWorld: CreateStoryWorldResponse) => void;
};

export function IdeaInputPanel({ onStoryWorldCreated }: IdeaInputPanelProps) {
  const [idea, setIdea] = useState("我想把暗恋拍成韩剧雨夜");
  const [selectedChoices, setSelectedChoices] = useState<string[]>(["像私人回忆"]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const canSubmit = idea.trim().length > 0 && submitState.kind !== "submitting";
  const selectedChoiceSet = useMemo(() => new Set(selectedChoices), [selectedChoices]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  async function submitStoryWorld() {
    if (!canSubmit) {
      return;
    }

    try {
      setSubmitState({ kind: "submitting", message: photo ? "正在保存照片并生成故事雏形" : "正在生成故事雏形" });

      const upload = photo ? await uploadStoryCamPhoto({ file: photo, sessionId }) : null;
      const nextSessionId = upload?.sessionId ?? sessionId;
      const storyWorld = await createStoryWorld({
        input: idea.trim(),
        lightweightChoices: selectedChoices,
        sessionId: nextSessionId,
        uploadedPhotoIds: upload?.uploadedPhotoIds
      });

      setSessionId(storyWorld.sessionId);
      onStoryWorldCreated?.(storyWorld);
      setSubmitState({
        kind: "success",
        message: `故事雏形已生成，剧本版本 ${storyWorld.artifacts.script.version}。`,
        sessionId: storyWorld.sessionId
      });
    } catch (error) {
      setSubmitState({
        kind: "error",
        message: messageForError(error)
      });
    }
  }

  function toggleChoice(choice: string) {
    setSelectedChoices((current) => (current.includes(choice) ? current.filter((item) => item !== choice) : [...current, choice]));
  }

  function selectPhoto(file: File | null) {
    clearPhotoPreview();
    setPhoto(file);

    if (!file) {
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    previewUrlRef.current = previewUrl;
    setPhotoPreviewUrl(previewUrl);
  }

  function clearPhotoPreview() {
    revokePhotoPreview();
    setPhotoPreviewUrl(null);
  }

  function revokePhotoPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  return (
    <section className="rounded-lg border border-stone-700/70 bg-stone-950/75 p-4 shadow-2xl shadow-black/20">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase text-amber-300">StoryCam</p>
        <h1 className="mt-2 text-2xl font-semibold text-stone-50">私人小剧场相机</h1>
        <p className="mt-2 text-sm leading-6 text-stone-400">从一句私人念头开始，先确认故事世界，再生成分镜和片段。</p>
      </div>

      <label className="text-sm font-medium text-stone-200" htmlFor="story-idea">
        你的这一幕
      </label>
      <textarea
        className="mt-2 min-h-36 w-full resize-none rounded-md border border-stone-700 bg-stone-900/80 p-3 text-sm leading-6 text-stone-100 outline-none transition focus:border-rose-300"
        id="story-idea"
        onChange={(event) => setIdea(event.target.value)}
        value={idea}
      />

      <div className="mt-4 grid grid-cols-2 gap-2">
        {directorChoices.map((choice) => {
          const isSelected = selectedChoiceSet.has(choice);

          return (
            <button
              aria-pressed={isSelected}
              className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                isSelected
                  ? "border-amber-300 bg-amber-300 text-stone-950"
                  : "border-stone-700 bg-stone-900 text-stone-200 hover:border-amber-300 hover:text-amber-100"
              }`}
              key={choice}
              onClick={() => toggleChoice(choice)}
              type="button"
            >
              {choice}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block rounded-md border border-dashed border-stone-700 bg-stone-900/70 p-3 transition hover:border-teal-300">
        <span className="text-sm font-semibold text-stone-100">上传一张参考照片</span>
        <span className="mt-1 block text-xs leading-5 text-stone-500">人物、宠物、地点或一段记忆都可以，默认只保存在你的账号内。</span>
        <input
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          data-testid="story-photo-input"
          onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)}
          type="file"
        />
      </label>

      {photoPreviewUrl ? (
        <div className="mt-3 overflow-hidden rounded-md border border-stone-700 bg-stone-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="上传照片预览" className="h-36 w-full object-cover" src={photoPreviewUrl} />
          <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-stone-400">
            <span className="truncate">{photo?.name}</span>
            <button className="text-rose-200 hover:text-rose-100" onClick={() => selectPhoto(null)} type="button">
              移除
            </button>
          </div>
        </div>
      ) : null}

      <button
        className="mt-5 w-full rounded-md bg-rose-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
        disabled={!canSubmit}
        onClick={submitStoryWorld}
        type="button"
      >
        {submitState.kind === "submitting" ? submitState.message : "生成故事雏形"}
      </button>

      {submitState.kind === "success" || submitState.kind === "error" ? (
        <p
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${
            submitState.kind === "success" ? "border-teal-700 text-teal-100" : "border-rose-800 text-rose-100"
          }`}
          role="status"
        >
          {submitState.message}
        </p>
      ) : null}

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-stone-100">创作入口</h2>
          <span className="text-xs text-stone-500">Web first</span>
        </div>
        <div className="grid gap-2">
          {storyModeEntries.map((entry) => (
            <button
              className="rounded-md border border-stone-800 bg-stone-900/70 p-3 text-left transition hover:border-amber-300"
              key={entry.label}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-stone-100">{entry.label}</span>
                <span className="shrink-0 rounded border border-stone-700 px-2 py-1 text-xs text-stone-400">{entry.status}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-stone-500">{entry.text}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function messageForError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "authentication_required") {
      return "请先登录，再保存照片和生成故事。";
    }

    if (error.message === "invalid_size") {
      return "照片太大了，请换一张 10MB 以内的图片。";
    }

    if (error.message === "invalid_mime_type") {
      return "只支持 JPEG、PNG 或 WebP 图片。";
    }
  }

  return "故事雏形生成失败，请稍后再试。";
}
