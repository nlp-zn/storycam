"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createStoryWorld, getAuthStatus, listRecentStoryCamProjects, uploadStoryCamPhoto } from "@/features/storycam/client/storycamApi";
import type { CreateStoryWorldResponse, RecentStoryCamProject } from "@/features/storycam/client/storycamApi";
import { directorChoices, storyModeEntries } from "@/features/storycam/domain/shellContent";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting"; message: string }
  | { kind: "success"; message: string; sessionId: string }
  | { kind: "error"; message: string };

type AuthStatus = "checking" | "authenticated" | "anonymous" | "error";

type IdeaInputPanelProps = {
  initialChoices?: string[];
  initialIdea?: string;
  onProjectSelected?: (sessionId: string) => Promise<void> | void;
  onStoryWorldCreated?: (storyWorld: CreateStoryWorldResponse, draft: { idea: string; selectedChoices: string[] }) => void;
};

export function IdeaInputPanel({
  initialChoices = ["像私人回忆"],
  initialIdea = "我想把暗恋拍成韩剧雨夜",
  onProjectSelected,
  onStoryWorldCreated
}: IdeaInputPanelProps) {
  const [idea, setIdea] = useState(initialIdea);
  const [selectedChoices, setSelectedChoices] = useState<string[]>(initialChoices);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [recentProjects, setRecentProjects] = useState<RecentStoryCamProject[]>([]);
  const [recentProjectsStatus, setRecentProjectsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isRecentProjectsOpen, setIsRecentProjectsOpen] = useState(false);
  const [restoringProjectId, setRestoringProjectId] = useState<string | null>(null);
  const canSubmit = idea.trim().length > 0 && submitState.kind !== "submitting" && authStatus === "authenticated";
  const selectedChoiceSet = useMemo(() => new Set(selectedChoices), [selectedChoices]);
  const ideaLength = idea.trim().length;

  useEffect(() => {
    let isMounted = true;

    void getAuthStatus()
      .then((response) => {
        if (isMounted) {
          setAuthStatus(response.authenticated ? "authenticated" : "anonymous");
        }
      })
      .catch(() => {
        if (isMounted) {
          setAuthStatus("error");
        }
      });

    return () => {
      isMounted = false;

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return;
    }

    let isMounted = true;

    void listRecentStoryCamProjects(5)
      .then((response) => {
        if (isMounted) {
          setRecentProjects(response.projects);
          setRecentProjectsStatus("ready");
        }
      })
      .catch(() => {
        if (isMounted) {
          setRecentProjectsStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authStatus]);

  async function submitStoryWorld() {
    if (!canSubmit) {
      if (authStatus !== "authenticated") {
        setSubmitState({ kind: "error", message: authGateMessage(authStatus) });
      }

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
      onStoryWorldCreated?.(storyWorld, { idea: idea.trim(), selectedChoices });
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

  async function continueProject(project: RecentStoryCamProject) {
    if (!onProjectSelected || restoringProjectId) {
      return;
    }

    try {
      setRestoringProjectId(project.sessionId);
      await onProjectSelected(project.sessionId);
      setIsRecentProjectsOpen(false);
    } catch {
      setSubmitState({ kind: "error", message: "项目恢复失败，可以稍后再试。" });
    } finally {
      setRestoringProjectId(null);
    }
  }

  function revokePhotoPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  return (
    <section className="relative">
      <div className="mb-10 flex items-center gap-4">
        <div className="h-px w-12 bg-[#00f0ff]/50" />
        <span className="storycam-eyebrow tracking-[0.2em]">第一步：核心前提</span>
      </div>

      <div className="storycam-panel storycam-neon-panel relative overflow-hidden p-5 md:p-7">
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(90deg,#fff_1px,transparent_1px),linear-gradient(#fff_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="relative flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="storycam-eyebrow">StoryCam</p>
            <h1 className="mt-2 text-3xl font-black leading-tight text-[#e2e2e2] md:text-4xl">私人小剧场相机</h1>
          </div>
          <p className="max-w-sm text-sm leading-6 text-[#b9cacb] md:text-right">
            从一句私人念头开始，先确认故事世界，再生成分镜和片段。
          </p>
        </div>

        <label className="relative mt-6 block text-sm font-bold text-[#e2e2e2]" htmlFor="story-idea">
          你的这一幕
        </label>
        <div className="group relative mt-3 max-w-3xl">
          <div className="absolute -inset-0.5 rounded-[2rem] bg-gradient-to-r from-[#00f0ff]/35 via-transparent to-[#ff4b89]/30 opacity-45 blur transition group-focus-within:opacity-100" />
          <div className="relative rounded-[2rem] border border-[#3b494b]/70 bg-[#0f1111]/90 p-4 shadow-2xl backdrop-blur-2xl transition group-focus-within:border-[#00f0ff]/60 md:p-5">
            <textarea
              className="min-h-[88px] w-full resize-none border-none bg-transparent p-0 text-base font-semibold leading-7 text-[#e2e2e2] outline-none placeholder:text-[#849495]/45 focus:ring-0 md:min-h-[104px] md:text-lg"
              id="story-idea"
              onChange={(event) => setIdea(event.target.value)}
              placeholder="拖拽/粘贴图片，或写下你想拍成电影的一幕..."
              value={idea}
            />
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
              <div className="flex flex-1 flex-wrap items-center gap-2" data-testid="story-idea-params">
                <label className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full border border-[#3b494b] bg-[#2a2a2a]/70 text-[#b9cacb] transition hover:border-[#00f0ff]/60 hover:text-white">
                  <span className="sr-only">上传一张参考照片</span>
                  <span aria-hidden="true" className="text-lg font-black">+</span>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    data-testid="story-photo-input"
                    onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                </label>
                {selectedChoices.length > 0 ? (
                  selectedChoices.map((choice) => (
                    <button
                      aria-label={`移除 ${choice}`}
                      className="rounded-full border border-[#3b494b] bg-[#2a2a2a]/60 px-3 py-2 text-xs font-black text-[#b9cacb] transition hover:border-[#00f0ff]/60 hover:text-white"
                      key={choice}
                      onClick={() => toggleChoice(choice)}
                      type="button"
                    >
                      {choice}
                      <span className="ml-2" aria-hidden="true">
                        ×
                      </span>
                    </button>
                  ))
                ) : (
                  <span className="rounded-full border border-dashed border-[#3b494b] px-3 py-2 text-xs font-black text-[#849495]">
                    未选择拍法
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="storycam-eyebrow text-[#849495]">{ideaLength} / 120</span>
                <button
                  aria-label={submitState.kind === "submitting" ? submitState.message : "生成故事雏形"}
                  className="flex size-10 items-center justify-center rounded-full border border-[#ff4b89]/50 bg-[#ff4b89] text-xl font-black text-black shadow-[0_0_22px_rgba(255,75,137,0.38)] transition hover:brightness-110 disabled:border-[#353535] disabled:bg-[#353535] disabled:text-[#849495] disabled:shadow-none"
                  disabled={!canSubmit}
                  onClick={submitStoryWorld}
                  type="button"
                >
                  <span aria-hidden="true">{submitState.kind === "submitting" ? "..." : "↑"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4 px-1">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full border border-[#ff4b89]/40 bg-[#ff4b89]/10 text-sm font-black text-[#ffb1c3]">
            调
          </span>
          <h2 className="storycam-eyebrow text-[#b9cacb]">拍法倾向</h2>
        </div>
        <div className="flex flex-wrap gap-4">
          {directorChoices.map((choice) => {
            const isSelected = selectedChoiceSet.has(choice);

            return (
              <button
                aria-pressed={isSelected}
                className={`rounded-full border px-7 py-4 text-left text-xs font-black uppercase tracking-widest transition ${
                  isSelected
                    ? "border-[#00f0ff] bg-[#00f0ff] text-black shadow-[0_0_18px_rgba(0,240,255,0.35)]"
                    : "border-[#3b494b] bg-[#2a2a2a]/50 text-[#e2e2e2] hover:border-[#00f0ff]/60 hover:bg-[#353535]"
                }`}
                key={choice}
                onClick={() => toggleChoice(choice)}
                type="button"
              >
                {choice}
                {isSelected ? <span className="ml-2" aria-hidden="true">×</span> : null}
              </button>
            );
          })}
        </div>
      </div>

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

      {authStatus !== "authenticated" ? (
        <p className="mx-auto mt-4 max-w-xl rounded-2xl border border-[#3b494b] bg-black/30 px-4 py-3 text-center text-sm leading-6 text-[#b9cacb]" role="status">
          {authGateMessage(authStatus)}
        </p>
      ) : null}

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

      <section className="mt-8" aria-label="最近项目">
        <button
          className="group flex w-full items-center justify-between gap-4 rounded-[1.25rem] border border-[#3b494b] bg-[#111616]/80 px-5 py-4 text-left transition hover:border-[#00f0ff]/60 hover:bg-[#162020]"
          onClick={() => setIsRecentProjectsOpen(true)}
          type="button"
        >
          <span>
            <span className="block text-sm font-extrabold text-[#e2e2e2]">最近项目</span>
            <span className="mt-1 block text-xs leading-5 text-[#849495]">
              {recentProjectsStatus === "loading"
                ? "正在查找你账号里的最近创作。"
                : recentProjects.length
                  ? `${recentProjects.length} 个可继续的项目`
                  : "从这里继续上次保存的故事世界或核心分镜。"}
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-[#00f0ff]/30 px-4 py-2 text-xs font-black text-[#00f0ff] transition group-hover:bg-[#00f0ff] group-hover:text-black">
            打开
          </span>
        </button>
      </section>

      <div className="mt-8 space-y-2">
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

      {isRecentProjectsOpen ? (
        <RecentProjectsDrawer
          onClose={() => setIsRecentProjectsOpen(false)}
          onContinue={continueProject}
          projects={recentProjects}
          restoringProjectId={restoringProjectId}
          status={recentProjectsStatus}
        />
      ) : null}
    </section>
  );
}

function RecentProjectsDrawer({
  onClose,
  onContinue,
  projects,
  restoringProjectId,
  status
}: {
  onClose: () => void;
  onContinue: (project: RecentStoryCamProject) => void;
  projects: RecentStoryCamProject[];
  restoringProjectId: string | null;
  status: "idle" | "loading" | "ready" | "error";
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="最近项目">
      <div className="w-full max-w-3xl rounded-[1.5rem] border border-[#3b494b] bg-[#141717] p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="storycam-eyebrow">StoryCam</p>
            <h2 className="mt-1 text-2xl font-black text-[#e2e2e2]">最近项目</h2>
          </div>
          <button
            aria-label="关闭最近项目"
            className="flex size-10 items-center justify-center rounded-full border border-[#3b494b] text-xl font-black text-[#e2e2e2] transition hover:border-[#00f0ff]"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        {status === "loading" ? (
          <p className="py-8 text-sm font-bold text-[#b9cacb]" role="status">正在载入最近项目。</p>
        ) : status === "error" ? (
          <p className="py-8 text-sm font-bold text-[#ffb1c3]" role="status">最近项目暂时载入失败，可以刷新后再试。</p>
        ) : projects.length ? (
          <div className="mt-5 grid gap-3">
            {projects.map((project) => (
              <article className="grid gap-4 rounded-[1.25rem] border border-white/10 bg-black/25 p-3 sm:grid-cols-[160px_1fr]" key={project.sessionId}>
                <div className="aspect-video overflow-hidden rounded-xl border border-white/10 bg-[#0e1111]">
                  {project.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={`${project.title} 缩略图`} className="size-full object-cover" src={project.thumbnail.signedUrl} />
                  ) : (
                    <div className="storycam-cinematic-frame size-full rounded-none" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="truncate text-lg font-black text-[#e2e2e2]">{project.title}</h3>
                    <span className="rounded-full border border-[#00f0ff]/25 px-3 py-1 text-xs font-black text-[#00f0ff]">
                      {project.currentStep === "core-storyboard" ? "核心分镜" : "故事世界"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#b9cacb]">{project.summary}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-bold text-[#849495]">
                      1 组 · 约 15 秒 · {formatProjectDate(project.updatedAt)}
                    </span>
                    <button
                      className="storycam-primary-button px-4 py-2 text-xs"
                      disabled={Boolean(restoringProjectId)}
                      onClick={() => onContinue(project)}
                      type="button"
                    >
                      {restoringProjectId === project.sessionId ? "恢复中" : "继续创作"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="py-8 text-sm font-bold leading-6 text-[#b9cacb]">还没有可继续的项目。生成故事世界后，它会出现在这里。</p>
        )}
      </div>
    </div>
  );
}

function formatProjectDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

function authGateMessage(authStatus: AuthStatus) {
  if (authStatus === "checking") {
    return "正在确认登录状态。";
  }

  if (authStatus === "error") {
    return "暂时无法确认登录状态，请稍后再试。";
  }

  return "登录后才能上传照片和生成真实故事。你可以先编辑想法。";
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

    if (
      error.message === "OPENROUTER_TEXT_INVALID_OUTPUT" ||
      error.message === "OPENROUTER_STORY_WORLD_INVALID_OUTPUT" ||
      error.message === "DEEPSEEK_STORY_WORLD_INVALID_OUTPUT"
    ) {
      return "结构化故事输出校验失败，请重试或切换文本模型。";
    }

    if (error.message === "DEEPSEEK_TOOL_CALL_MISSING") {
      return "DeepSeek 没有返回必要的结构化工具调用，请重试或切换文本模型。";
    }

    if (error.message === "DEEPSEEK_TOOL_ARGUMENTS_INVALID_JSON") {
      return "DeepSeek 返回的工具参数不是合法 JSON，请重试或切换文本模型。";
    }

    if (error.message === "DEEPSEEK_TEXT_PROVIDER_FAILED") {
      return "DeepSeek 文本服务暂时不可用，请稍后重试。";
    }

    if (error.message === "STORYCAM_CONFIG_INVALID") {
      return "文本模型配置暂时不可用，请检查本地 OpenRouter 或 DeepSeek 配置。";
    }
  }

  return "故事雏形生成失败，请稍后再试。";
}
