"use client";

/* eslint-disable @next/next/no-img-element */

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Clapperboard, Heart, MapPin, PawPrint, Play, Plus, RefreshCw, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteStoryCamSession,
  getDiscoverySampleAssets,
  getAuthStatus,
  isRecentStoryCamProjectsCacheStale,
  listRecentStoryCamProjects,
  prefetchStoryCamSessionRestore,
  recentProjectsRefreshIntervalMs,
  readCachedRecentStoryCamProjects
} from "@/features/storycam/client/storycamApi";
import type { DiscoverySampleSignedAsset, RecentStoryCamProject } from "@/features/storycam/client/storycamApi";
import {
  discoveryEntries,
  discoveryLayoutPresets,
  storyModeEntries,
  type DiscoveryEntry,
  type DiscoveryPlaceholderEntry,
  type DiscoverySampleEntry
} from "@/features/storycam/domain/shellContent";
import {
  defaultStoryCamVideoAspectRatio,
  storyCamVideoAspectRatioLabel,
  storyCamVideoAspectRatios,
  type StoryCamVideoAspectRatio
} from "@/features/storycam/domain/videoSettings";

type SubmitState =
  | { kind: "idle" }
  | { kind: "error"; message: string };

type AuthStatus = "checking" | "authenticated" | "anonymous" | "error";
type RecentProjectsStatus = "idle" | "loading" | "ready" | "error";
type RecentProjectsNotice = { kind: "success" | "error"; message: string };
type StoryModeEntry = (typeof storyModeEntries)[number];
type StoryModeId = StoryModeEntry["id"];
type RecentProjectThumbnail = NonNullable<RecentStoryCamProject["thumbnail"]>;
type CachedRecentProjectThumbnail = RecentProjectThumbnail & {
  expiresAtMs: number;
};
const recentProjectsListLimit = 20;
const discoveryAssetRefreshFallbackSeconds = 60;
const discoveryAssetRefreshSafetyMarginSeconds = 30;
const storyModeSampleIdeas = new Set<string>(storyModeEntries.map((entry) => entry.sampleIdea));
const discoveryEntryById = new Map(discoveryEntries.map((entry) => [entry.id, entry]));

type IdeaInputPanelProps = {
  initialChoices?: string[];
  initialIdea?: string;
  onProjectDeleted?: (sessionId: string) => void;
  onProjectSelected?: (sessionId: string) => Promise<void> | void;
  onSubmitStoryWorldDraft?: (draft: StoryWorldDraft) => void;
};

export type StoryWorldDraft = {
  idea: string;
  photo: File | null;
  selectedChoices: string[];
  storyModeId: StoryModeId;
  travelDestination?: string;
  videoAspectRatio: StoryCamVideoAspectRatio;
};

type RecentProjectsInlineProps = {
  onContinue: (project: RecentStoryCamProject) => void;
  onOpen: () => void;
  projects: RecentStoryCamProject[];
  restoringProjectId: string | null;
  status: RecentProjectsStatus;
  totalCount: number;
};

type RecentProjectsDrawerProps = {
  confirmingDeleteProjectId: string | null;
  deletingProjectId: string | null;
  onClose: () => void;
  onContinue: (project: RecentStoryCamProject) => void;
  onDelete: (project: RecentStoryCamProject) => void;
  projects: RecentStoryCamProject[];
  recentProjectsNotice: RecentProjectsNotice | null;
  restoringProjectId: string | null;
  status: RecentProjectsStatus;
};

type RecentProjectsDrawerContentProps = Omit<RecentProjectsDrawerProps, "onClose">;

export function IdeaInputPanel({
  initialChoices = ["留白多一点"],
  initialIdea = "我想把暗恋拍成韩剧雨夜",
  onProjectDeleted,
  onProjectSelected,
  onSubmitStoryWorldDraft
}: IdeaInputPanelProps) {
  const [idea, setIdea] = useState(initialIdea);
  const [selectedChoices, setSelectedChoices] = useState<string[]>(initialChoices);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [travelDestination, setTravelDestination] = useState("");
  const previewUrlRef = useRef<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [recentProjects, setRecentProjects] = useState<RecentStoryCamProject[]>([]);
  const [recentProjectsStatus, setRecentProjectsStatus] = useState<RecentProjectsStatus>("idle");
  const [isRecentProjectsOpen, setIsRecentProjectsOpen] = useState(false);
  const [restoringProjectId, setRestoringProjectId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [confirmingDeleteProjectId, setConfirmingDeleteProjectId] = useState<string | null>(null);
  const [recentProjectsNotice, setRecentProjectsNotice] = useState<RecentProjectsNotice | null>(null);
  const [selectedStoryModeId, setSelectedStoryModeId] = useState<StoryModeId>(storyModeEntries[0].id);
  const [videoAspectRatio, setVideoAspectRatio] = useState<StoryCamVideoAspectRatio>(defaultStoryCamVideoAspectRatio);
  const [isAspectRatioMenuOpen, setIsAspectRatioMenuOpen] = useState(false);
  const [storyModeNotice, setStoryModeNotice] = useState<string | null>(null);
  const aspectRatioMenuRef = useRef<HTMLDivElement>(null);
  const recentProjectsAbortRef = useRef<AbortController | null>(null);
  const recentProjectsInFlightRef = useRef(false);
  const recentProjectsLastRefreshMsRef = useRef(0);
  const recentProjectsRequestIdRef = useRef(0);
  const recentProjectThumbnailCacheRef = useRef<Record<string, CachedRecentProjectThumbnail>>({});
  const selectedStoryMode = storyModeEntries.find((entry) => entry.id === selectedStoryModeId) ?? storyModeEntries[0];
  const trimmedTravelDestination = travelDestination.trim();
  const missingRequiredPhoto = selectedStoryMode.requiresPhoto && !photo;
  const missingTravelDestination = selectedStoryMode.requiresTravelDestination && !trimmedTravelDestination;
  const canSubmit = idea.trim().length > 0 && authStatus === "authenticated" && !missingRequiredPhoto && !missingTravelDestination;
  const selectedChoiceSet = useMemo(() => new Set(selectedChoices), [selectedChoices]);
  const displayedRecentProjects = useMemo(
    () => (authStatus === "authenticated" ? recentProjects : []),
    [authStatus, recentProjects]
  );
  const displayedRecentProjectsStatus = authStatus === "authenticated" ? recentProjectsStatus : "idle";
  const recentPreviewProjects = displayedRecentProjects.slice(0, 2);
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

  const refreshRecentProjects = useCallback(async (options: { force?: boolean; showLoading?: boolean } = {}) => {
    if (authStatus !== "authenticated") {
      return;
    }

    const nowMs = Date.now();

    if (!options.force && recentProjectsLastRefreshMsRef.current + recentProjectsRefreshIntervalMs > nowMs) {
      return;
    }

    if (recentProjectsInFlightRef.current) {
      if (options.showLoading ?? true) {
        setRecentProjectsStatus((current) => (current === "idle" ? "loading" : current));
      }

      return;
    }

    const requestId = recentProjectsRequestIdRef.current + 1;
    const controller = new AbortController();

    recentProjectsRequestIdRef.current = requestId;
    recentProjectsAbortRef.current = controller;
    recentProjectsInFlightRef.current = true;

    if (options.showLoading ?? true) {
      setRecentProjectsStatus("loading");
    }

    try {
      const response = await listRecentStoryCamProjects(recentProjectsListLimit, { signal: controller.signal });

      if (recentProjectsRequestIdRef.current === requestId) {
        setRecentProjects(cacheRecentProjectThumbnails(response.projects, recentProjectThumbnailCacheRef.current));
        setRecentProjectsStatus("ready");
        recentProjectsLastRefreshMsRef.current = Date.now();
      }
    } catch {
      if (recentProjectsRequestIdRef.current === requestId) {
        setRecentProjectsStatus((current) => (current === "ready" && options.showLoading === false ? current : "error"));
      }
    } finally {
      recentProjectsInFlightRef.current = false;

      if (recentProjectsAbortRef.current === controller) {
        recentProjectsAbortRef.current = null;
      }
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      recentProjectsRequestIdRef.current += 1;
      recentProjectsAbortRef.current?.abort();
      recentProjectsAbortRef.current = null;
      return;
    }

    const cached = readCachedRecentStoryCamProjects();

    if (cached) {
      setRecentProjects(cacheRecentProjectThumbnails(cached.projects, recentProjectThumbnailCacheRef.current));
      setRecentProjectsStatus("ready");
      recentProjectsLastRefreshMsRef.current = cached.fetchedAtMs;
    }

    const shouldRefresh = !cached || isRecentStoryCamProjectsCacheStale(cached);

    if (!shouldRefresh) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshRecentProjects({ force: !cached, showLoading: !cached });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      recentProjectsRequestIdRef.current += 1;
      recentProjectsAbortRef.current?.abort();
      recentProjectsAbortRef.current = null;
    };
  }, [authStatus, refreshRecentProjects]);

  useEffect(() => {
    if (!isAspectRatioMenuOpen) {
      return;
    }

    function closeWhenOutside(event: PointerEvent) {
      if (!aspectRatioMenuRef.current?.contains(event.target as Node)) {
        setIsAspectRatioMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAspectRatioMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isAspectRatioMenuOpen]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return;
    }

    const refreshVisibleRecentProjects = () => {
      if (document.visibilityState === "visible") {
        void refreshRecentProjects({ showLoading: false });
      }
    };
    const refreshFocusedRecentProjects = () => {
      void refreshRecentProjects({ showLoading: false });
    };

    document.addEventListener("visibilitychange", refreshVisibleRecentProjects);
    window.addEventListener("focus", refreshFocusedRecentProjects);
    window.addEventListener("pageshow", refreshFocusedRecentProjects);

    return () => {
      document.removeEventListener("visibilitychange", refreshVisibleRecentProjects);
      window.removeEventListener("focus", refreshFocusedRecentProjects);
      window.removeEventListener("pageshow", refreshFocusedRecentProjects);
    };
  }, [authStatus, refreshRecentProjects]);

  useEffect(() => {
    if (displayedRecentProjectsStatus !== "ready") {
      return;
    }

    displayedRecentProjects.slice(0, 5).forEach((project) => {
      prefetchStoryCamSessionRestore(project.sessionId);
    });
  }, [displayedRecentProjects, displayedRecentProjectsStatus]);

  function submitStoryWorld() {
    if (!canSubmit) {
      if (authStatus !== "authenticated") {
        setSubmitState({ kind: "error", message: authGateMessage(authStatus) });
        return;
      }

      if (missingRequiredPhoto || missingTravelDestination) {
        setSubmitState({ kind: "error", message: travelModeRequirementMessage(missingRequiredPhoto, missingTravelDestination) });
      }

      return;
    }

    setSubmitState({ kind: "idle" });
    onSubmitStoryWorldDraft?.({
      idea: idea.trim(),
      photo,
      selectedChoices,
      storyModeId: selectedStoryMode.id,
      ...(selectedStoryMode.requiresTravelDestination ? { travelDestination: trimmedTravelDestination } : {}),
      videoAspectRatio
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
    setVideoAspectRatio(entry.preferredAspectRatio);

    if (!entry.requiresTravelDestination) {
      setTravelDestination("");
    }

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
    if (!onProjectSelected || restoringProjectId || deletingProjectId) {
      return;
    }

    try {
      setRestoringProjectId(project.sessionId);
      setRecentProjectsNotice(null);
      await onProjectSelected(project.sessionId);
      setIsRecentProjectsOpen(false);
    } catch {
      setSubmitState({ kind: "error", message: "项目恢复失败，可以稍后再试。" });
    } finally {
      setRestoringProjectId(null);
    }
  }

  async function deleteRecentProject(project: RecentStoryCamProject) {
    if (deletingProjectId || restoringProjectId) {
      return;
    }

    if (confirmingDeleteProjectId !== project.sessionId) {
      setConfirmingDeleteProjectId(project.sessionId);
      setRecentProjectsNotice({ kind: "error", message: "再点一次确认删除，这个故事会从你的账号中移除。" });
      return;
    }

    try {
      setDeletingProjectId(project.sessionId);
      setRecentProjectsNotice(null);
      await deleteStoryCamSession(project.sessionId);
      deleteRestoreThumbnailCache(project, recentProjectThumbnailCacheRef.current);
      setRecentProjects((current) => current.filter((item) => item.sessionId !== project.sessionId));
      setConfirmingDeleteProjectId(null);
      onProjectDeleted?.(project.sessionId);
      setRecentProjectsNotice({ kind: "success", message: `已删除「${project.title}」。` });
    } catch {
      setRecentProjectsNotice({ kind: "error", message: "删除失败，请稍后再试。" });
    } finally {
      setDeletingProjectId(null);
    }
  }

  function revokePhotoPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  function openRecentProjects() {
    setIsRecentProjectsOpen(true);
    setConfirmingDeleteProjectId(null);

    if (authStatus === "authenticated") {
      void refreshRecentProjects({ force: true, showLoading: recentProjects.length === 0 });
    }
  }

  function selectAspectRatio(ratio: StoryCamVideoAspectRatio) {
    setVideoAspectRatio(ratio);
    setIsAspectRatioMenuOpen(false);
  }

  return (
    <section className="relative mx-auto w-full">
      <div className="mx-auto flex w-full max-w-[920px] flex-col items-stretch">
        <header className="storycam-input-hero">
          <div className="storycam-section-kicker">
            <span />
            <p>第一步：核心前提</p>
            <span />
          </div>
          <h1 className="storycam-heading-xl">私人小剧场相机</h1>
        </header>

        <label className="mb-3 ml-1 block text-[14px] font-black leading-none text-[#f4ffff]" htmlFor="story-idea">
          你的这一幕
        </label>
        <div className="group relative">
          <div className="absolute -inset-0.5 rounded-[2rem] bg-gradient-to-r from-[#ff4b89]/80 via-[#dbfcff]/25 to-[#00f0ff]/90 opacity-75 blur-sm transition group-focus-within:opacity-100" />
          <div className="relative overflow-hidden rounded-[2rem] border border-[#00f0ff]/70 bg-[#0b0e0e]/90 p-5 shadow-[0_0_34px_rgba(0,240,255,0.14)] backdrop-blur-2xl transition group-focus-within:border-[#dbfcff] md:p-7">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,75,137,0.09),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.05),transparent_42%)]" />
            {photoPreviewUrl ? (
              <div className="storycam-inline-photo-preview relative mb-5 flex items-center gap-3" data-testid="story-photo-inline-preview">
                <div className="relative size-[76px] overflow-hidden rounded-[18px] border border-[#dbfcff]/70 bg-white/[0.04] shadow-[0_0_18px_rgba(0,240,255,0.18)]">
                  <img alt="上传照片预览" className="size-full object-cover" src={photoPreviewUrl} />
                  <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-xs font-black text-white backdrop-blur-sm">
                    1
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.06] px-3 py-2">
                    <img alt="" aria-hidden="true" className="size-6 shrink-0 rounded-full object-cover" src={photoPreviewUrl} />
                    <span className="truncate text-xs font-black text-[#e2e2e2]">{photo?.name}</span>
                    <button className="shrink-0 text-xs font-black text-[#ffb1c3] transition hover:text-white" onClick={() => selectPhoto(null)} type="button">
                      移除
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
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
            {selectedStoryMode.requiresTravelDestination ? (
              <div className="relative mt-5 grid gap-2 border-t border-white/[0.08] pt-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
                <label className="text-[13px] font-black leading-none text-[#dbfcff]" htmlFor="story-travel-destination">
                  旅行地
                </label>
                <div className="relative">
                  <MapPin aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#00f0ff]" strokeWidth={2.4} />
                  <input
                    className="h-11 w-full rounded-full border border-white/[0.12] bg-white/[0.045] pl-10 pr-4 text-sm font-bold text-[#e2e2e2] outline-none transition placeholder:text-[#849495]/55 focus:border-[#00f0ff]/70 focus:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-[#00f0ff]/35"
                    id="story-travel-destination"
                    onChange={(event) => setTravelDestination(event.target.value)}
                    placeholder="例如：葡萄牙里斯本阿尔法玛"
                    value={travelDestination}
                  />
                </div>
              </div>
            ) : null}
            <div className="relative mt-5 flex flex-col gap-3 border-t border-white/[0.08] pt-3 md:flex-row md:items-center md:justify-between">
              <div className="storycam-input-tools flex flex-1 flex-wrap items-center gap-1.5" data-testid="story-idea-params">
                <label className="storycam-input-photo-button inline-flex cursor-pointer items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.04] text-[#aebcbd] transition hover:border-[#00f0ff]/55 hover:text-white">
                  <span className="sr-only">上传一张参考照片</span>
                  <Plus aria-hidden="true" className="size-4" strokeWidth={2.4} />
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    data-testid="story-photo-input"
                    onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                </label>
                <div className="storycam-aspect-menu" ref={aspectRatioMenuRef}>
                  <button
                    aria-expanded={isAspectRatioMenuOpen}
                    aria-haspopup="menu"
                    className={inputToolChipClassName(true)}
                    onClick={() => setIsAspectRatioMenuOpen((current) => !current)}
                    type="button"
                  >
                    {aspectRatioButtonLabel(videoAspectRatio)}
                    <ChevronDown aria-hidden="true" className="ml-1 size-3.5" strokeWidth={2.4} />
                  </button>
                  {isAspectRatioMenuOpen ? (
                    <div className="storycam-aspect-menu-panel" role="menu">
                      {storyCamVideoAspectRatios.map((ratio) => (
                        <button
                          aria-checked={videoAspectRatio === ratio}
                          className="storycam-aspect-menu-item"
                          key={ratio}
                          onClick={() => selectAspectRatio(ratio)}
                          role="menuitemradio"
                          type="button"
                        >
                          {storyCamVideoAspectRatioLabel(ratio)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
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
                    </button>
                  );
                })}
              </div>
              <div className="flex shrink-0 items-center justify-end gap-4">
                <span className="storycam-eyebrow text-[12px] text-[#00f0ff]">{ideaLength} / 120</span>
                <Button
                  aria-label="生成故事雏形"
                  className="size-12 border-[#ff4b89]/70 bg-[#ff4b89] text-black shadow-[0_0_28px_rgba(255,75,137,0.48)] hover:scale-105 hover:brightness-110 disabled:scale-100 disabled:border-[#353535] disabled:bg-[#353535] disabled:text-[#849495] disabled:shadow-none"
                  disabled={!canSubmit}
                  onClick={submitStoryWorld}
                  size="icon-lg"
                  type="button"
                  variant="iconGlass"
                >
                  <ArrowUp aria-hidden="true" data-icon="icon" strokeWidth={2.8} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-7 px-1">
          <div className="flex flex-wrap justify-center gap-3">
            {storyModeEntries.map((entry) => (
              <Button
                aria-label={`${entry.label}：${entry.text}`}
                aria-pressed={selectedStoryModeId === entry.id}
                data-pressed={selectedStoryModeId === entry.id ? "" : undefined}
                key={entry.label}
                onClick={() => selectStoryMode(entry)}
                size="pill"
                type="button"
                variant="storyMode"
              >
                <StoryModeIcon id={entry.id} />
                {entry.label}
              </Button>
            ))}
          </div>
          {storyModeNotice ? (
            <p className="mt-3 text-center text-xs font-bold leading-5 text-[#9eadae]" role="status">
              {storyModeNotice}
            </p>
          ) : null}
          {selectedStoryMode.requiresPhoto || selectedStoryMode.requiresTravelDestination ? (
            <p className="mt-3 text-center text-xs font-bold leading-5 text-[#9eadae]" role="status">
              {travelModeRequirementMessage(missingRequiredPhoto, missingTravelDestination)}
            </p>
          ) : null}
        </div>
      </div>
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
        onContinue={continueProject}
        onOpen={openRecentProjects}
        projects={recentPreviewProjects}
        restoringProjectId={restoringProjectId}
        status={displayedRecentProjectsStatus}
        totalCount={displayedRecentProjects.length}
      />

      <DiscoveryWall />

      {isRecentProjectsOpen ? (
        <RecentProjectsDrawer
          confirmingDeleteProjectId={confirmingDeleteProjectId}
          deletingProjectId={deletingProjectId}
          onClose={() => setIsRecentProjectsOpen(false)}
          onContinue={continueProject}
          onDelete={deleteRecentProject}
          projects={displayedRecentProjects}
          recentProjectsNotice={recentProjectsNotice}
          restoringProjectId={restoringProjectId}
          status={displayedRecentProjectsStatus}
        />
      ) : null}
    </section>
  );
}

function RecentProjectsInline({
  onContinue,
  onOpen,
  projects,
  restoringProjectId,
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
        <Button
          className="self-start text-[#00f0ff] md:self-center"
          onClick={onOpen}
          size="pill"
          type="button"
          variant="secondaryGlass"
        >
          打开
        </Button>
      </div>

      {hasProjects ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {projects.map((project) => (
            <button
              aria-label={`继续创作 ${project.title}`}
              className="group grid min-w-0 grid-cols-[52px_minmax(0,1fr)] items-center gap-4 rounded-[1rem] border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-[#00f0ff]/55 hover:bg-white/[0.07] focus:outline-none focus-visible:border-[#00f0ff] focus-visible:ring-2 focus-visible:ring-[#00f0ff]/35 disabled:cursor-wait disabled:opacity-70"
              disabled={Boolean(restoringProjectId)}
              key={project.sessionId}
              onClick={() => onContinue(project)}
              type="button"
            >
              <div className="flex size-12 items-center justify-center rounded-xl border border-[#ff4b89]/40 bg-[#ff4b89]/20 text-xl font-black text-[#ff4b89]">
                <Clapperboard aria-hidden="true" className="size-5" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-[14px] font-black leading-tight text-[#e2e2e2]">{project.title}</h3>
                <p className="mt-1 truncate text-[12px] font-bold leading-tight text-[#849495]">
                  {recentProjectMetaLabel(project, restoringProjectId)}
                </p>
              </div>
            </button>
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

function getDiscoveryLayoutEntries(layoutPresetIndex: number): DiscoveryEntry[] {
  const preset = discoveryLayoutPresets[layoutPresetIndex % discoveryLayoutPresets.length] ?? discoveryLayoutPresets[0];

  return preset
    .map((entryId) => discoveryEntryById.get(entryId))
    .filter((entry): entry is DiscoveryEntry => Boolean(entry));
}

function mapDiscoveryAssetsById(assets: DiscoverySampleSignedAsset[]): Record<string, DiscoverySampleSignedAsset> {
  return Object.fromEntries(assets.map((asset) => [asset.id, asset]));
}

function discoveryAssetRefreshDelayMs(signedUrlExpiresIn: number): number {
  return Math.max(discoveryAssetRefreshSafetyMarginSeconds, signedUrlExpiresIn - discoveryAssetRefreshSafetyMarginSeconds) * 1000;
}

function discoveryFormatDescription(entry: DiscoveryEntry): string {
  return entry.format === "portrait" ? "竖版 9:16" : "横版 16:9";
}

function DiscoveryWall() {
  const [layoutPresetIndex, setLayoutPresetIndex] = useState(0);
  const [sampleAssetsById, setSampleAssetsById] = useState<Record<string, DiscoverySampleSignedAsset>>({});
  const [failedPosterIds, setFailedPosterIds] = useState<Set<string>>(() => new Set());
  const [activeSample, setActiveSample] = useState<DiscoverySampleEntry | null>(null);
  const sampleAssetRefreshInFlightRef = useRef(false);
  const featuredEntries = useMemo(() => getDiscoveryLayoutEntries(layoutPresetIndex), [layoutPresetIndex]);
  const activeAsset = activeSample ? sampleAssetsById[activeSample.id] : undefined;

  const loadDiscoverySampleAssets = useCallback(async (signal?: AbortSignal): Promise<number> => {
    try {
      const result = await getDiscoverySampleAssets({ signal });

      if (signal?.aborted) {
        return discoveryAssetRefreshFallbackSeconds;
      }

      if (!result.ok) {
        setSampleAssetsById({});
        return discoveryAssetRefreshFallbackSeconds;
      }

      setSampleAssetsById(mapDiscoveryAssetsById(result.assets));
      setFailedPosterIds(new Set());

      return result.signedUrlExpiresIn;
    } catch {
      if (!signal?.aborted) {
        setSampleAssetsById({});
      }
    }

    return discoveryAssetRefreshFallbackSeconds;
  }, []);

  useEffect(() => {
    let controller: AbortController | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let isMounted = true;

    async function loadAndSchedule(): Promise<void> {
      controller = new AbortController();
      const signedUrlExpiresIn = await loadDiscoverySampleAssets(controller.signal);

      if (!isMounted) {
        return;
      }

      refreshTimer = setTimeout(loadAndSchedule, discoveryAssetRefreshDelayMs(signedUrlExpiresIn));
    }

    void loadAndSchedule();

    return () => {
      isMounted = false;
      controller?.abort();

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [loadDiscoverySampleAssets]);

  function rotateDiscoveryEntries(): void {
    setLayoutPresetIndex((current) => (current + 1) % discoveryLayoutPresets.length);
    setActiveSample(null);
  }

  function handlePosterError(entryId: string): void {
    setFailedPosterIds((current) => new Set(current).add(entryId));

    if (sampleAssetRefreshInFlightRef.current) {
      return;
    }

    sampleAssetRefreshInFlightRef.current = true;
    void loadDiscoverySampleAssets().finally(() => {
      sampleAssetRefreshInFlightRef.current = false;
    });
  }

  return (
    <section className="storycam-discovery-section mx-auto mt-14 w-full max-w-[1180px]" aria-label="发现更多">
      <div className="storycam-discovery-header">
        <div className="storycam-discovery-title-row">
          <Sparkles aria-hidden="true" className="storycam-discovery-title-icon" strokeWidth={2.2} />
          <h2>发现更多</h2>
          <p>灵感样片，仅用于启发你的私人创作</p>
        </div>
        <Button
          aria-label="换一批发现样片"
          className="storycam-discovery-refresh"
          onClick={rotateDiscoveryEntries}
          size="sm"
          type="button"
          variant="ghost"
        >
          换一批
          <RefreshCw aria-hidden="true" data-icon="inline-end" strokeWidth={2.2} />
        </Button>
      </div>

      <div className="storycam-discovery-grid">
        {featuredEntries.map((entry, index) => {
          const formatDescription = discoveryFormatDescription(entry);
          const sampleAsset = entry.kind === "sample" ? sampleAssetsById[entry.id] : undefined;
          const posterUrl = sampleAsset?.posterUrl && !failedPosterIds.has(entry.id) ? sampleAsset.posterUrl : undefined;

          if (entry.kind === "placeholder") {
            return (
              <DiscoveryPlaceholderCard
                entry={entry}
                formatDescription={formatDescription}
                key={entry.id}
                slotNumber={index + 1}
              />
            );
          }

          return (
            <DiscoverySampleCard
              asset={sampleAsset}
              entry={entry}
              formatDescription={formatDescription}
              key={entry.id}
              onOpen={setActiveSample}
              onPosterError={handlePosterError}
              posterUrl={posterUrl}
              slotNumber={index + 1}
            />
          );
        })}
      </div>

      <p className="storycam-discovery-footnote">
        所有内容由 AI 生成，仅供个人创作参考，请勿用于任何公开传播或商业用途。
      </p>

      {activeSample && activeAsset ? (
        <DiscoveryPlayer activeAsset={activeAsset} activeSample={activeSample} onClose={() => setActiveSample(null)} />
      ) : null}
    </section>
  );
}

type DiscoveryPlaceholderCardProps = {
  entry: DiscoveryPlaceholderEntry;
  formatDescription: string;
  slotNumber: number;
};

function DiscoveryPlaceholderCard({ entry, formatDescription, slotNumber }: DiscoveryPlaceholderCardProps): ReactNode {
  return (
    <article
      aria-label={`${entry.title}，${formatDescription} 展位`}
      className={`storycam-discovery-card storycam-discovery-card--placeholder storycam-discovery-card--slot-${slotNumber}`}
    >
      <div className="storycam-discovery-placeholder-visual" />
      <div className="storycam-discovery-card-overlay storycam-discovery-card-overlay--placeholder">
        <div className="storycam-discovery-card-copy">
          <p className="storycam-discovery-card-kicker">{entry.category}</p>
          <h3 className="storycam-discovery-card-title">{entry.title}</h3>
          <span className="storycam-discovery-card-note">{entry.note}</span>
        </div>
      </div>
    </article>
  );
}

type DiscoverySampleCardProps = {
  asset: DiscoverySampleSignedAsset | undefined;
  entry: DiscoverySampleEntry;
  formatDescription: string;
  onOpen: (entry: DiscoverySampleEntry) => void;
  onPosterError: (entryId: string) => void;
  posterUrl: string | undefined;
  slotNumber: number;
};

function DiscoverySampleCard({
  asset,
  entry,
  formatDescription,
  onOpen,
  onPosterError,
  posterUrl,
  slotNumber
}: DiscoverySampleCardProps): ReactNode {
  return (
    <button
      aria-label={`播放 ${entry.title}，${formatDescription} 样片`}
      className={`group storycam-discovery-card storycam-discovery-card--slot-${slotNumber}`}
      disabled={!asset?.videoUrl}
      onClick={() => onOpen(entry)}
      type="button"
    >
      {posterUrl ? (
        <img alt={`${entry.title} 样片画面`} onError={() => onPosterError(entry.id)} src={posterUrl} />
      ) : (
        <div className="storycam-discovery-placeholder-visual" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/[0.84] via-black/[0.12] to-transparent" />
      <span className="storycam-discovery-play-badge">
        <Play aria-hidden="true" className="size-3.5 fill-current" strokeWidth={2.4} />
      </span>
      <div className="storycam-discovery-card-overlay">
        <div className="storycam-discovery-card-copy">
          <p className="storycam-discovery-card-kicker">{entry.category}</p>
          <h3 className="storycam-discovery-card-title">{entry.title}</h3>
        </div>
        <span className="storycam-discovery-duration">{entry.duration}</span>
      </div>
    </button>
  );
}

type DiscoveryPlayerProps = {
  activeAsset: DiscoverySampleSignedAsset;
  activeSample: DiscoverySampleEntry;
  onClose: () => void;
};

function DiscoveryPlayer({ activeAsset, activeSample, onClose }: DiscoveryPlayerProps): ReactNode {
  return (
    <div aria-label={`${activeSample.title} 样片播放器`} aria-modal="true" className="storycam-discovery-player" role="dialog">
      <div className="storycam-discovery-player-card">
        <div className="storycam-discovery-player-header">
          <div>
            <p>{activeSample.category}</p>
            <h3>{activeSample.title}</h3>
          </div>
          <Button aria-label="关闭样片播放器" className="px-4 py-2 text-xs" onClick={onClose} size="sm" type="button" variant="secondaryGlass">
            <X aria-hidden="true" data-icon="inline-start" strokeWidth={2.4} />
            关闭
          </Button>
        </div>
        <video autoPlay className="storycam-discovery-player-video" controls playsInline poster={activeAsset.posterUrl} src={activeAsset.videoUrl} />
      </div>
    </div>
  );
}

function inputToolChipClassName(isSelected: boolean): string {
  const baseClassName = "storycam-input-tool-chip inline-flex items-center justify-center whitespace-nowrap rounded-full border transition";

  if (isSelected) {
    return `${baseClassName} border-[#00f0ff]/70 bg-[#00dbe9] text-black shadow-[0_0_8px_rgba(0,240,255,0.18)]`;
  }

  return `${baseClassName} border-white/[0.12] bg-white/[0.035] text-[#9eadae] hover:border-[#00f0ff]/45 hover:bg-white/[0.07] hover:text-white`;
}

function aspectRatioButtonLabel(aspectRatio: StoryCamVideoAspectRatio): string {
  return storyCamVideoAspectRatioLabel(aspectRatio);
}

function StoryModeIcon({ id }: { id: StoryModeId }) {
  const strokeWidth = 2.2;

  switch (id) {
    case "personal-memory":
      return <Heart aria-hidden="true" data-icon="inline-start" strokeWidth={strokeWidth} />;
    case "pet-theater":
      return <PawPrint aria-hidden="true" data-icon="inline-start" strokeWidth={strokeWidth} />;
    case "novel-character":
      return <UserRound aria-hidden="true" data-icon="inline-start" strokeWidth={strokeWidth} />;
    case "emotion-short":
      return <Clapperboard aria-hidden="true" data-icon="inline-start" strokeWidth={strokeWidth} />;
    case "handdrawn-travel-vlog":
      return <MapPin aria-hidden="true" data-icon="inline-start" strokeWidth={strokeWidth} />;
  }
}

function travelModeRequirementMessage(missingPhoto: boolean, missingDestination: boolean) {
  if (missingPhoto && missingDestination) {
    return "上传一张自己的照片，再写一个旅行地。";
  }

  if (missingPhoto) {
    return "上传一张自己的照片，系统会把你转成手绘旅行角色。";
  }

  if (missingDestination) {
    return "写一个旅行地，系统会生成真实地点感的场景资产。";
  }

  return "会用你的照片生成手绘角色，再放进这个真实旅行地。";
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

function recentProjectMetaLabel(project: RecentStoryCamProject, restoringProjectId: string | null): string {
  if (restoringProjectId === project.sessionId) {
    return "恢复中";
  }

  return `${storyCamVideoAspectRatioLabel(project.videoAspectRatio)} · 最后编辑：${formatProjectDate(project.updatedAt)}`;
}

function deleteRecentProjectButtonLabel(
  project: RecentStoryCamProject,
  deletingProjectId: string | null,
  confirmingDeleteProjectId: string | null
) {
  if (deletingProjectId === project.sessionId) {
    return "删除中";
  }

  if (confirmingDeleteProjectId === project.sessionId) {
    return "确认删除";
  }

  return "删除";
}

function RecentProjectsDrawer({
  confirmingDeleteProjectId,
  deletingProjectId,
  onClose,
  onContinue,
  onDelete,
  projects,
  recentProjectsNotice,
  restoringProjectId,
  status
}: RecentProjectsDrawerProps) {
  const content = renderRecentProjectsDrawerContent({
    confirmingDeleteProjectId,
    deletingProjectId,
    onContinue,
    onDelete,
    projects,
    recentProjectsNotice,
    restoringProjectId,
    status
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="最近项目">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-[1.5rem] border border-[#3b494b] bg-[#141717] p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="storycam-eyebrow">StoryCam</p>
            <h2 className="mt-1 text-2xl font-black text-[#e2e2e2]">最近项目</h2>
          </div>
          <Button
            aria-label="关闭最近项目"
            onClick={onClose}
            size="icon-lg"
            type="button"
            variant="iconGlass"
          >
            <X aria-hidden="true" data-icon="icon" strokeWidth={2.4} />
          </Button>
        </div>

        {content}
      </div>
    </div>
  );
}

function renderRecentProjectsDrawerContent({
  confirmingDeleteProjectId,
  deletingProjectId,
  onContinue,
  onDelete,
  projects,
  recentProjectsNotice,
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
    <div className="mt-5 min-h-0">
      {recentProjectsNotice ? (
        <p
          className={`mb-3 rounded-[0.875rem] border px-4 py-3 text-sm font-bold ${
            recentProjectsNotice.kind === "success"
              ? "border-[#00f0ff]/35 bg-[#00f0ff]/10 text-[#dbfcff]"
              : "border-[#ff4b89]/45 bg-[#ff4b89]/10 text-[#ffd9e0]"
          }`}
          role="status"
        >
          {recentProjectsNotice.message}
        </p>
      ) : null}
      <div className="max-h-[min(62vh,620px)] overflow-y-auto pr-1 [scrollbar-color:rgba(0,240,255,0.45)_rgba(255,255,255,0.06)]">
        <div className="grid gap-3">
          {projects.map((project) => (
            <article className="grid gap-4 rounded-[1.25rem] border border-white/10 bg-black/25 p-3 sm:grid-cols-[160px_1fr]" key={project.sessionId}>
              <div className="aspect-video overflow-hidden rounded-xl border border-white/10 bg-[#0e1111]">
                {project.thumbnail ? (
                  <RecentProjectThumbnailImage project={project} />
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
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      className="border-[#ff4b89]/40 px-3 py-2 text-xs text-[#ffb1c3] hover:border-[#ff4b89]/70 hover:text-white"
                      disabled={Boolean(restoringProjectId || deletingProjectId)}
                      onClick={() => onDelete(project)}
                      size="sm"
                      type="button"
                      variant="secondaryGlass"
                    >
                      <Trash2 aria-hidden="true" data-icon="inline-start" strokeWidth={2.2} />
                      {deleteRecentProjectButtonLabel(project, deletingProjectId, confirmingDeleteProjectId)}
                    </Button>
                    <Button
                      className="px-4 py-2 text-xs"
                      disabled={Boolean(restoringProjectId || deletingProjectId)}
                      onClick={() => onContinue(project)}
                      size="sm"
                      type="button"
                      variant="primaryNeon"
                    >
                      {restoringProjectId === project.sessionId ? "恢复中" : "继续创作"}
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecentProjectThumbnailImage({ project }: { project: RecentStoryCamProject }) {
  const [imageState, setImageState] = useState<{ src: string | undefined; status: "loading" | "ready" | "failed" }>({
    src: undefined,
    status: "loading"
  });
  const thumbnail = project.thumbnail;
  const src = thumbnail?.signedUrl;
  const status = imageState.src === src ? imageState.status : "loading";

  return (
    <div className="relative size-full">
      <div className={`storycam-cinematic-frame absolute inset-0 rounded-none transition-opacity ${status === "ready" ? "opacity-0" : "opacity-100"}`} />
      {thumbnail && status !== "failed" ? (
        <img
          alt={`${project.title} 缩略图`}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${status === "ready" ? "opacity-100" : "opacity-0"}`}
          decoding="async"
          loading="lazy"
          onError={() => setImageState({ src, status: "failed" })}
          onLoad={() => setImageState({ src, status: "ready" })}
          src={thumbnail.signedUrl}
        />
      ) : null}
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

function cacheRecentProjectThumbnails(
  projects: RecentStoryCamProject[],
  cache: Record<string, CachedRecentProjectThumbnail>,
  nowMs = Date.now()
) {
  return projects.map((project) => {
    const thumbnail = project.thumbnail;

    if (!thumbnail) {
      return project;
    }

    const cached = cache[thumbnail.id];
    const minimumFreshMs = 30_000;

    if (cached && cached.expiresAtMs > nowMs + minimumFreshMs) {
      return {
        ...project,
        thumbnail: {
          id: cached.id,
          mimeType: cached.mimeType,
          signedUrl: cached.signedUrl,
          signedUrlExpiresIn: Math.max(1, Math.floor((cached.expiresAtMs - nowMs) / 1000))
        }
      };
    }

    cache[thumbnail.id] = {
      ...thumbnail,
      expiresAtMs: nowMs + thumbnail.signedUrlExpiresIn * 1000
    };

    return project;
  });
}

function deleteRestoreThumbnailCache(project: RecentStoryCamProject, cache: Record<string, CachedRecentProjectThumbnail>) {
  if (project.thumbnail) {
    delete cache[project.thumbnail.id];
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
