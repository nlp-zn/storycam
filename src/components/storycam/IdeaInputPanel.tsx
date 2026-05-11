"use client";

/* eslint-disable @next/next/no-img-element */

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { getAuthStatus, listRecentStoryCamProjects } from "@/features/storycam/client/storycamApi";
import type { RecentStoryCamProject } from "@/features/storycam/client/storycamApi";
import { discoveryEntries, storyModeEntries } from "@/features/storycam/domain/shellContent";

type SubmitState =
  | { kind: "idle" }
  | { kind: "error"; message: string };

type AuthStatus = "checking" | "authenticated" | "anonymous" | "error";
type RecentProjectsStatus = "idle" | "loading" | "ready" | "error";
type StoryModeEntry = (typeof storyModeEntries)[number];
type StoryModeId = StoryModeEntry["id"];

const storyModeSampleIdeas = new Set<string>(storyModeEntries.map((entry) => entry.sampleIdea));

type IdeaInputPanelProps = {
  initialChoices?: string[];
  initialIdea?: string;
  onProjectSelected?: (sessionId: string) => Promise<void> | void;
  onSubmitStoryWorldDraft?: (draft: StoryWorldDraft) => void;
};

export type StoryWorldDraft = {
  idea: string;
  photo: File | null;
  selectedChoices: string[];
};

type RecentProjectsInlineProps = {
  onOpen: () => void;
  projects: RecentStoryCamProject[];
  status: RecentProjectsStatus;
  totalCount: number;
};

type RecentProjectsDrawerProps = {
  onClose: () => void;
  onContinue: (project: RecentStoryCamProject) => void;
  projects: RecentStoryCamProject[];
  restoringProjectId: string | null;
  status: RecentProjectsStatus;
};

type RecentProjectsDrawerContentProps = Omit<RecentProjectsDrawerProps, "onClose">;

export function IdeaInputPanel({
  initialChoices = ["像私人回忆"],
  initialIdea = "我想把暗恋拍成韩剧雨夜",
  onProjectSelected,
  onSubmitStoryWorldDraft
}: IdeaInputPanelProps) {
  const [idea, setIdea] = useState(initialIdea);
  const [selectedChoices, setSelectedChoices] = useState<string[]>(initialChoices);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [recentProjects, setRecentProjects] = useState<RecentStoryCamProject[]>([]);
  const [recentProjectsStatus, setRecentProjectsStatus] = useState<RecentProjectsStatus>("idle");
  const [isRecentProjectsOpen, setIsRecentProjectsOpen] = useState(false);
  const [restoringProjectId, setRestoringProjectId] = useState<string | null>(null);
  const [selectedStoryModeId, setSelectedStoryModeId] = useState<StoryModeId>(storyModeEntries[0].id);
  const [storyModeNotice, setStoryModeNotice] = useState<string | null>(null);
  const canSubmit = idea.trim().length > 0 && authStatus === "authenticated";
  const selectedStoryMode = storyModeEntries.find((entry) => entry.id === selectedStoryModeId) ?? storyModeEntries[0];
  const selectedChoiceSet = useMemo(() => new Set(selectedChoices), [selectedChoices]);
  const recentPreviewProjects = recentProjects.slice(0, 2);
  const ideaLength = idea.trim().length;

  useEffect(() => {
    let isMounted = true;

    void getAuthStatus()
      .then((response) => {
        if (isMounted) {
          setAuthStatus(response.authenticated ? "authenticated" : "anonymous");
          if (response.authenticated) {
            setRecentProjectsStatus("loading");
          }
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

  function submitStoryWorld() {
    if (!canSubmit) {
      if (authStatus !== "authenticated") {
        setSubmitState({ kind: "error", message: authGateMessage(authStatus) });
      }

      return;
    }

    setSubmitState({ kind: "idle" });
    onSubmitStoryWorldDraft?.({
      idea: idea.trim(),
      photo,
      selectedChoices
    });
  }

  function toggleChoice(choice: string) {
    setSelectedChoices((current) => (current.includes(choice) ? current.filter((item) => item !== choice) : [...current, choice]));
  }

  function selectStoryMode(entry: StoryModeEntry) {
    const currentIdea = idea.trim();
    const canReplaceIdea = currentIdea.length === 0 || storyModeSampleIdeas.has(currentIdea);

    setSelectedStoryModeId(entry.id);
    setSelectedChoices([...entry.defaultChoices]);

    if (canReplaceIdea) {
      setIdea(entry.sampleIdea);
      setStoryModeNotice(null);
      return;
    }

    setStoryModeNotice("已切换方向，不会覆盖你的文字。");
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
    <section className="relative mx-auto w-full">
      <div className="mx-auto flex w-full max-w-[920px] flex-col items-stretch">
        <div className="mb-8 flex items-center justify-center gap-5 text-center">
          <div className="hidden h-px w-14 bg-[#00f0ff]/35 sm:block" />
          <div>
            <span className="storycam-eyebrow text-[11px] tracking-[0.18em]">第一步：核心前提</span>
            <h1 className="mt-3 text-[16px] font-black leading-none tracking-wide text-[#f4ffff] md:text-[18px]">私人小剧场相机</h1>
          </div>
          <div className="hidden h-px w-14 bg-[#00f0ff]/35 sm:block" />
        </div>

        <label className="mb-3 ml-1 block text-[14px] font-black leading-none text-[#f4ffff]" htmlFor="story-idea">
          你的这一幕
        </label>
        <div className="group relative">
          <div className="absolute -inset-0.5 rounded-[2rem] bg-gradient-to-r from-[#ff4b89]/80 via-[#dbfcff]/25 to-[#00f0ff]/90 opacity-75 blur-sm transition group-focus-within:opacity-100" />
          <div className="relative overflow-hidden rounded-[2rem] border border-[#00f0ff]/70 bg-[#0b0e0e]/90 p-5 shadow-[0_0_34px_rgba(0,240,255,0.14)] backdrop-blur-2xl transition group-focus-within:border-[#dbfcff] md:p-7">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,75,137,0.09),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.05),transparent_42%)]" />
            <textarea
              className="storycam-idea-textarea relative min-h-[92px] w-full resize-none border-none bg-transparent p-0 text-[#e2e2e2] outline-none placeholder:text-[#849495]/45 focus:ring-0 md:min-h-[108px]"
              id="story-idea"
              onChange={(event) => {
                setIdea(event.target.value);
                setStoryModeNotice(null);
              }}
              placeholder="描述电影般的瞬间..."
              value={idea}
            />
            <div className="relative mt-5 flex flex-col gap-3 border-t border-white/[0.08] pt-3 md:flex-row md:items-center md:justify-between">
              <div className="storycam-input-tools flex flex-1 flex-wrap items-center gap-1.5" data-testid="story-idea-params">
                <label className="storycam-input-photo-button inline-flex cursor-pointer items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.04] text-[#aebcbd] transition hover:border-[#00f0ff]/55 hover:text-white">
                  <span className="sr-only">上传一张参考照片</span>
                  <span aria-hidden="true">+</span>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    data-testid="story-photo-input"
                    onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                </label>
                <span className="storycam-input-tool-label px-1.5 text-[#aebcbd]">拍法倾向</span>
                {selectedStoryMode.directorChoices.map((choice) => {
                  const isSelected = selectedChoiceSet.has(choice);

                  return (
                    <button
                      aria-label={isSelected ? `移除 ${choice}` : choice}
                      aria-pressed={isSelected}
                      className={inputToolChipClassName(isSelected)}
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
              <div className="flex shrink-0 items-center justify-end gap-4">
                <span className="storycam-eyebrow text-[12px] text-[#00f0ff]">{ideaLength} / 120</span>
                <button
                  aria-label="生成故事雏形"
                  className="flex size-12 items-center justify-center rounded-full border border-[#ff4b89]/70 bg-[#ff4b89] text-2xl font-black text-black shadow-[0_0_28px_rgba(255,75,137,0.48)] transition hover:scale-105 hover:brightness-110 disabled:scale-100 disabled:border-[#353535] disabled:bg-[#353535] disabled:text-[#849495] disabled:shadow-none"
                  disabled={!canSubmit}
                  onClick={submitStoryWorld}
                  type="button"
                >
                  <span aria-hidden="true">↑</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-7 px-1">
          <div className="flex flex-wrap justify-center gap-3">
            {storyModeEntries.map((entry) => (
              <button
                aria-label={`${entry.label}：${entry.text}`}
                aria-pressed={selectedStoryModeId === entry.id}
                className={storyModeButtonClassName(selectedStoryModeId === entry.id)}
                key={entry.label}
                onClick={() => selectStoryMode(entry)}
                type="button"
              >
                <span aria-hidden="true" className="mr-2 text-[#dbfcff]">✧</span>
                {entry.label}
              </button>
            ))}
          </div>
          {storyModeNotice ? (
            <p className="mt-3 text-center text-xs font-bold leading-5 text-[#9eadae]" role="status">
              {storyModeNotice}
            </p>
          ) : null}
        </div>
      </div>

      {photoPreviewUrl ? (
        <div className="mx-auto mt-5 max-w-[920px] overflow-hidden rounded-[1.5rem] border border-[#3b494b] bg-[#1b1b1b]">
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
        <p className="mx-auto mt-5 max-w-xl rounded-2xl border border-[#3b494b] bg-black/40 px-4 py-3 text-center text-sm leading-6 text-[#b9cacb]" role="status">
          {authGateMessage(authStatus)}
        </p>
      ) : null}

      {submitState.kind === "error" ? (
        <p className="mx-auto mt-5 max-w-[920px] rounded-2xl border border-[#ff4b89]/60 px-4 py-3 text-sm text-[#ffd9e0]" role="status">
          {submitState.message}
        </p>
      ) : null}

      <RecentProjectsInline
        onOpen={() => setIsRecentProjectsOpen(true)}
        projects={recentPreviewProjects}
        status={recentProjectsStatus}
        totalCount={recentProjects.length}
      />

      <DiscoveryWall />

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

function RecentProjectsInline({
  onOpen,
  projects,
  status,
  totalCount
}: RecentProjectsInlineProps) {
  const hasProjects = projects.length > 0;

  return (
    <section
      aria-label="最近项目"
      className="mx-auto mt-9 w-full max-w-[1180px] rounded-[1.5rem] border border-white/10 bg-[#101313]/[0.78] p-5 shadow-[0_0_38px_rgba(0,240,255,0.08)] backdrop-blur-2xl md:p-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[18px] font-black leading-tight text-[#f4ffff]">最近项目</h2>
          <p className="mt-1 text-[14px] leading-6 text-[#849495]">
            {recentProjectsSummary(status, totalCount)}
          </p>
        </div>
        <button
          className="self-start rounded-full border border-white/[0.12] bg-black/20 px-6 py-3 text-[14px] font-black leading-none text-[#00f0ff] transition hover:border-[#00f0ff] hover:bg-[#00f0ff] hover:text-black md:self-center"
          onClick={onOpen}
          type="button"
        >
          打开
        </button>
      </div>

      {hasProjects ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {projects.map((project) => (
            <article className="grid min-w-0 grid-cols-[52px_minmax(0,1fr)] items-center gap-4 rounded-[1rem] border border-white/10 bg-white/[0.04] p-4" key={project.sessionId}>
              <div className="flex size-12 items-center justify-center rounded-xl border border-[#ff4b89]/40 bg-[#ff4b89]/20 text-xl font-black text-[#ff4b89]">
                ▣
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-[14px] font-black leading-tight text-[#e2e2e2]">{project.title}</h3>
                <p className="mt-1 truncate text-[12px] font-bold leading-tight text-[#849495]">
                  最后编辑：{formatProjectDate(project.updatedAt)}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[1rem] border border-white/[0.08] bg-white/[0.03] px-4 py-5 text-[14px] font-bold text-[#849495]">
          {recentProjectsEmptyMessage(status)}
        </div>
      )}
    </section>
  );
}

function DiscoveryWall() {
  return (
    <section className="storycam-discovery-section mx-auto mt-14 w-full max-w-[1360px]" aria-label="发现更多">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <span className="storycam-eyebrow text-[11px] tracking-[0.2em] text-[#00f0ff]">STORYCAM PRESETS</span>
        <h2 className="mt-3 text-[34px] font-black leading-tight text-[#f4ffff] md:text-[48px]">发现更多</h2>
        <p className="mx-auto mt-3 max-w-xl text-[14px] font-bold leading-6 text-[#849495]">
          预置横版 16:9 与竖版 9:16 样片槽位，后续可直接替换为自有生成视频。
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <span className="storycam-discovery-format-pill">16:9 横版</span>
          <span className="storycam-discovery-format-pill">9:16 竖版</span>
        </div>
      </div>

      <div className="storycam-discovery-grid">
        {discoveryEntries.map((entry) => {
          const formatLabel = entry.format === "portrait" ? "9:16" : "16:9";
          const formatDescription = entry.format === "portrait" ? "竖版 9:16" : "横版 16:9";
          const mediaStateLabel = entry.videoSrc ? "可播放样片" : "视频槽位待替换";

          return (
            <article
              aria-label={`${entry.title}，${formatDescription} 样片`}
              className={`group storycam-discovery-card storycam-discovery-card--${entry.format}`}
              key={entry.title}
            >
              {entry.videoSrc ? (
                <video
                  aria-label={`${entry.title} 预设视频`}
                  autoPlay
                  className="size-full object-cover"
                  loop
                  muted
                  playsInline
                  poster={entry.imageSrc}
                  preload="metadata"
                  src={entry.videoSrc}
                />
              ) : (
                <img alt={`${entry.title} 样片画面`} className="size-full object-cover" src={entry.imageSrc} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/[0.82] via-black/[0.12] to-transparent" />
              <div className="absolute left-3 top-3 flex items-center gap-2">
                <span className="storycam-discovery-card-badge">{formatLabel}</span>
                <span className="storycam-discovery-card-badge storycam-discovery-card-badge--muted">{entry.category}</span>
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 md:p-4">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-black leading-tight text-white md:text-[17px]">{entry.title}</h3>
                  <p className="mt-1 truncate text-[11px] font-bold leading-none text-[#b9cacb]">{mediaStateLabel}</p>
                </div>
                <span className="shrink-0 text-[12px] font-bold leading-none text-[#e2e2e2]">{entry.duration}</span>
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                <span className="flex size-12 items-center justify-center rounded-full bg-black/50 text-base font-black text-white backdrop-blur-md">
                  ▶
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-8 text-center text-sm leading-6 text-[#6f7d7e]">
        当前展示为 StoryCam 自有占位海报；竞品素材仅作布局参考，不下载或复用到产品中。
      </p>
    </section>
  );
}

function inputToolChipClassName(isSelected: boolean): string {
  const baseClassName = "storycam-input-tool-chip rounded-full border transition";

  if (isSelected) {
    return `${baseClassName} border-[#00f0ff]/70 bg-[#00dbe9] text-black shadow-[0_0_8px_rgba(0,240,255,0.18)]`;
  }

  return `${baseClassName} border-white/[0.12] bg-white/[0.035] text-[#9eadae] hover:border-[#00f0ff]/45 hover:bg-white/[0.07] hover:text-white`;
}

function storyModeButtonClassName(isActive: boolean): string {
  const baseClassName =
    "rounded-full border px-5 py-3 text-left text-[15px] font-black leading-none transition duration-200";

  if (isActive) {
    return `${baseClassName} scale-[1.03] border-[#ff4b89] bg-[#ff4b89]/[0.24] text-[#ffe4ee] shadow-[0_0_24px_rgba(255,75,137,0.34),inset_0_0_18px_rgba(255,75,137,0.1)]`;
  }

  return `${baseClassName} border-white/[0.12] bg-white/[0.055] text-[#d5e0e1] hover:border-[#00f0ff]/65 hover:bg-white/10 hover:text-white hover:shadow-[0_0_18px_rgba(0,240,255,0.16)]`;
}

function recentProjectsSummary(status: RecentProjectsStatus, totalCount: number): string {
  if (status === "loading") {
    return "正在查找你账号里的最近创作。";
  }

  if (status === "error") {
    return "最近项目暂时载入失败，可以打开面板稍后重试。";
  }

  if (totalCount > 0) {
    return `${totalCount} 个可继续的项目`;
  }

  return "从这里继续上次保存的故事世界或核心分镜。";
}

function recentProjectsEmptyMessage(status: RecentProjectsStatus): string {
  if (status === "loading") {
    return "正在载入最近项目。";
  }

  if (status === "error") {
    return "最近项目暂时载入失败。";
  }

  return "还没有可继续的项目。";
}

function RecentProjectsDrawer({
  onClose,
  onContinue,
  projects,
  restoringProjectId,
  status
}: RecentProjectsDrawerProps) {
  const content = renderRecentProjectsDrawerContent({
    onContinue,
    projects,
    restoringProjectId,
    status
  });

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

        {content}
      </div>
    </div>
  );
}

function renderRecentProjectsDrawerContent({
  onContinue,
  projects,
  restoringProjectId,
  status
}: RecentProjectsDrawerContentProps): ReactNode {
  if (status === "loading") {
    return <p className="py-8 text-sm font-bold text-[#b9cacb]" role="status">正在载入最近项目。</p>;
  }

  if (status === "error") {
    return <p className="py-8 text-sm font-bold text-[#ffb1c3]" role="status">最近项目暂时载入失败，可以刷新后再试。</p>;
  }

  if (!projects.length) {
    return <p className="py-8 text-sm font-bold leading-6 text-[#b9cacb]">还没有可继续的项目。生成故事世界后，它会出现在这里。</p>;
  }

  return (
    <div className="mt-5 grid gap-3">
      {projects.map((project) => (
        <article className="grid gap-4 rounded-[1.25rem] border border-white/10 bg-black/25 p-3 sm:grid-cols-[160px_1fr]" key={project.sessionId}>
          <div className="aspect-video overflow-hidden rounded-xl border border-white/10 bg-[#0e1111]">
            {project.thumbnail ? (
              <img alt={`${project.title} 缩略图`} className="size-full object-cover" src={project.thumbnail.signedUrl} />
            ) : (
              <div className="storycam-cinematic-frame size-full rounded-none" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="truncate text-lg font-black text-[#e2e2e2]">{project.title}</h3>
              <span className="rounded-full border border-[#00f0ff]/25 px-3 py-1 text-xs font-black text-[#00f0ff]">
                {projectStepLabel(project.currentStep)}
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

function projectStepLabel(step: RecentStoryCamProject["currentStep"]) {
  switch (step) {
    case "export":
      return "片段已保存";
    case "clip-review":
    case "clip-generation":
      return "片段生成";
    case "core-storyboard":
      return "核心分镜";
    case "story-world":
      return "故事世界";
  }
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
