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
    <section className="storycam-panel storycam-neon-panel">
      <div className="mb-8">
        <p className="storycam-eyebrow">StoryCam</p>
        <h1 className="mt-3 text-3xl font-black leading-tight text-[#e2e2e2]">私人小剧场相机</h1>
        <p className="mt-3 text-sm leading-6 text-[#b9cacb]">从一句私人念头开始，先确认故事世界，再生成分镜和片段。</p>
      </div>

      <label className="text-sm font-bold text-[#e2e2e2]" htmlFor="story-idea">
        你的这一幕
      </label>
      <div className="relative mt-3">
        <div className="absolute -inset-0.5 rounded-[2rem] bg-gradient-to-r from-[#00f0ff]/35 to-[#ff4b89]/20 opacity-40 blur transition group-focus-within:opacity-100" />
        <textarea
          className="relative min-h-44 w-full resize-none rounded-[2rem] border border-[#3b494b] bg-[#1b1b1b]/80 p-5 text-lg font-extrabold leading-8 text-[#e2e2e2] outline-none transition placeholder:text-[#849495] focus:border-[#00f0ff]"
          id="story-idea"
          onChange={(event) => setIdea(event.target.value)}
          placeholder="描述电影般的瞬间..."
          value={idea}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {directorChoices.map((choice) => {
          const isSelected = selectedChoiceSet.has(choice);

          return (
            <button
              aria-pressed={isSelected}
              className={`rounded-full border px-5 py-3 text-left text-sm font-bold transition ${
                isSelected
                  ? "border-[#00f0ff] bg-[#00f0ff] text-black shadow-[0_0_18px_rgba(0,240,255,0.35)]"
                  : "border-[#3b494b] bg-[#2a2a2a]/50 text-[#e2e2e2] hover:border-[#00f0ff]/60 hover:bg-[#353535]"
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

      <label className="mt-6 block rounded-[1.5rem] border border-dashed border-[#3b494b] bg-[#1b1b1b]/70 p-5 transition hover:border-[#00f0ff]">
        <span className="text-sm font-extrabold text-[#e2e2e2]">上传一张参考照片</span>
        <span className="mt-2 block text-xs leading-5 text-[#849495]">人物、宠物、地点或一段记忆都可以，默认只保存在你的账号内。</span>
        <input
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          data-testid="story-photo-input"
          onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)}
          type="file"
        />
      </label>

      {photoPreviewUrl ? (
        <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-[#3b494b] bg-[#1b1b1b]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="上传照片预览" className="h-40 w-full object-cover opacity-90" src={photoPreviewUrl} />
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-[#b9cacb]">
            <span className="truncate">{photo?.name}</span>
            <button className="text-[#ffb1c3] hover:text-white" onClick={() => selectPhoto(null)} type="button">
              移除
            </button>
          </div>
        </div>
      ) : null}

      <button
        className="storycam-primary-button mt-7 w-full py-5 text-base disabled:border-[#353535] disabled:bg-[#353535] disabled:text-[#849495] disabled:shadow-none"
        disabled={!canSubmit}
        onClick={submitStoryWorld}
        type="button"
      >
        {submitState.kind === "submitting" ? submitState.message : "生成故事雏形"}
      </button>

      {submitState.kind === "success" || submitState.kind === "error" ? (
        <p
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            submitState.kind === "success" ? "border-[#00f0ff]/50 text-[#dbfcff]" : "border-[#ff4b89]/60 text-[#ffd9e0]"
          }`}
          role="status"
        >
          {submitState.message}
        </p>
      ) : null}

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-[#e2e2e2]">创作入口</h2>
          <span className="text-xs text-[#849495]">Web first</span>
        </div>
        <div className="grid gap-2">
          {storyModeEntries.map((entry) => (
            <button
              className="rounded-[1.25rem] border border-[#353535] bg-[#1b1b1b]/70 p-4 text-left transition hover:border-[#00f0ff]/60"
              key={entry.label}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-[#e2e2e2]">{entry.label}</span>
                <span className="shrink-0 rounded-full border border-[#3b494b] px-3 py-1 text-xs text-[#b9cacb]">{entry.status}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#849495]">{entry.text}</p>
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
