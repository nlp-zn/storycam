"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Info } from "lucide-react";
import { ClipGenerationWorkspace } from "@/components/storycam/ClipGenerationWorkspace";
import { CoreFramesStage } from "@/components/storycam/CoreFramesStage";
import { IdeaInputPanel } from "@/components/storycam/IdeaInputPanel";
import type { StoryWorldDraft } from "@/components/storycam/IdeaInputPanel";
import { StoryCamBottomDock } from "@/components/storycam/StoryCamPrimitives";
import { StoryWorldReview } from "@/components/storycam/StoryWorldReview";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  confirmedArtifactVersionsForClip,
  confirmedArtifactVersionsFromStoryWorld,
  staleStoryboardAfterStoryWorldEdit,
  type StoryboardStatus
} from "@/features/storycam/client/storycamState";
import {
  cancelGenerationJob,
  clearStoryCamRestoreCache,
  createFinalWork,
  createStitchSuggestion,
  createStoryWorld,
  createStoryboard,
  deleteStoryCamSession,
  expandStoryboardGroup,
  generateClipJob,
  generateStoryWorldAssetImages,
  getGenerationJob,
  regenerateStoryboardFrameImage,
  refreshStoryCamSessionRestore,
  restoreCachedCurrentStoryCamSession,
  restoreCurrentStoryCamSession,
  restoreStoryCamSession,
  uploadStoryCamPhoto,
  getAuthStatus,
  type CreateStoryboardResponse,
  type CreateStoryWorldResponse,
  type GenerateStoryWorldAssetImageResponse,
  type FinalWorkResponse,
  type StoryboardImageState,
  type GenerationJobSummary,
  type ExpandStoryboardGroupResponse
} from "@/features/storycam/client/storycamApi";
import {
  imageGenerationPollingPolicy,
  mapWithConcurrencyLimit,
  nextImageGenerationPollDelayMs,
  nextVideoGenerationPollDelayMs,
  shouldPollGenerationJob
} from "@/features/storycam/client/jobPolling";
import { workflowStages } from "@/features/storycam/domain/shellContent";
import {
  defaultStoryCamVideoAspectRatio,
  defaultStoryCamVideoModel,
  parseStoryCamVideoModel,
  type StoryCamVideoAspectRatio,
  type StoryCamVideoModel
} from "@/features/storycam/domain/videoSettings";

const stepPaths = [
  "/storycam/input",
  "/storycam/story-world",
  "/storycam/core-storyboard",
  "/storycam/clip-generation"
] as const;

type StoryWorldAssetImage = NonNullable<GenerateStoryWorldAssetImageResponse["media"]>;
type TopBarAuthStatus = "checking" | "authenticated" | "anonymous" | "error";
type StoryWorldGenerationRequest = StoryWorldDraft & {
  requestId: number;
  sessionId?: string;
  uploadedPhotoIds?: string[];
};
type StoryWorldGenerationState =
  | { kind: "idle" }
  | { kind: "pending"; request: StoryWorldGenerationRequest }
  | { kind: "error"; message: string; request: StoryWorldGenerationRequest };
type StoryboardGenerationRequest = {
  coreGroupTargetCount: 1 | 2 | 3;
  requestId: number;
  storyWorld: CreateStoryWorldResponse;
};
type StoryboardGenerationState =
  | { kind: "idle" }
  | { kind: "pending"; request: StoryboardGenerationRequest }
  | { kind: "error"; message: string; request: StoryboardGenerationRequest };
type ClipGenerationRequest = {
  coreArtifactId: string;
  coreGroupIndex: number;
  durationSeconds: number;
  requestId: number;
  sessionId: string;
  videoModel: StoryCamVideoModel;
};
type ClipGenerationState =
  | { kind: "idle" }
  | { kind: "pending"; request: ClipGenerationRequest }
  | { kind: "error"; message: string; request: ClipGenerationRequest };
const requiredExpandedFrameCount = 8;
const initialStoryboardImageRetryDelayMs = 2500;
const maxInitialStoryboardImageRetryCount = 12;

function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

export function StoryCamWorkspace() {
  const [storyWorld, setStoryWorld] = useState<CreateStoryWorldResponse | null>(null);
  const [storyWorldConfirmed, setStoryWorldConfirmed] = useState(false);
  const [storyboard, setStoryboard] = useState<CreateStoryboardResponse | null>(null);
  const [selectedCoreGroupIndex, setSelectedCoreGroupIndex] = useState<number | null>(null);
  const [expansion, setExpansion] = useState<ExpandStoryboardGroupResponse | null>(null);
  const [isExpansionLoading, setIsExpansionLoading] = useState(false);
  const [regeneratingFrameKey, setRegeneratingFrameKey] = useState<string | null>(null);
  const [clipConfirmationSummary, setClipConfirmationSummary] = useState<string | null>(null);
  const [clipJob, setClipJob] = useState<GenerationJobSummary | null>(null);
  const [isClipSubmitting, setIsClipSubmitting] = useState(false);
  const [finalWork, setFinalWork] = useState<FinalWorkResponse | null>(null);
  const [finalWorkSaveError, setFinalWorkSaveError] = useState<string | null>(null);
  const [isFinalWorkSubmitting, setIsFinalWorkSubmitting] = useState(false);
  const [isDeletingStory, setIsDeletingStory] = useState(false);
  const [isStoryWorldEditorOpen, setIsStoryWorldEditorOpen] = useState(false);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [storyboardStatus, setStoryboardStatus] = useState<StoryboardStatus>("idle");
  const [storyboardMessage, setStoryboardMessage] = useState("确认故事世界后才能生成核心分镜。");
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(() =>
    typeof window === "undefined" ? null : stepIndexFromPath(window.location.pathname)
  );
  const [inputDraft, setInputDraft] = useState({ idea: "我想把暗恋拍成韩剧雨夜", selectedChoices: ["留白多一点"] });
  const [videoAspectRatio, setVideoAspectRatio] = useState<StoryCamVideoAspectRatio>(defaultStoryCamVideoAspectRatio);
  const [videoModel, setVideoModel] = useState<StoryCamVideoModel>(defaultStoryCamVideoModel);
  const [storyWorldGeneration, setStoryWorldGeneration] = useState<StoryWorldGenerationState>({ kind: "idle" });
  const [storyboardGeneration, setStoryboardGeneration] = useState<StoryboardGenerationState>({ kind: "idle" });
  const [clipGeneration, setClipGeneration] = useState<ClipGenerationState>({ kind: "idle" });
  const [storyWorldAssetImageJobs, setStoryWorldAssetImageJobs] = useState<Record<string, string>>({});
  const [coreGroupTargetCount, setCoreGroupTargetCount] = useState<1 | 2 | 3>(1);
  const imagePollAttemptsRef = useRef<Record<string, number>>({});
  const storyWorldAssetImagePollAttemptsRef = useRef<Record<string, number>>({});
  const videoPollAttemptsRef = useRef<Record<string, number>>({});
  const mediaRefreshInFlightRef = useRef(false);
  const storyWorldAssetImagesInFlightRef = useRef<Set<string>>(new Set());
  const finalWorkCreationInFlightRef = useRef<Set<string>>(new Set());
  const finalWorkActiveSaveKeyRef = useRef<string | null>(null);
  const finalWorkAutoSubmittedKeyRef = useRef<string | null>(null);
  const finalWorkSaveFailedKeyRef = useRef<string | null>(null);
  const storyWorldRequestIdRef = useRef(0);
  const storyboardRequestIdRef = useRef(0);
  const initialStoryboardImageRetryAttemptsRef = useRef<Record<number, number>>({});
  const clipRequestIdRef = useRef(0);
  const storyWorldRef = useLatestRef(storyWorld);
  const storyboardRef = useLatestRef(storyboard);
  const clipJobRef = useLatestRef(clipJob);
  const expansionRef = useLatestRef(expansion);
  const selectedCoreGroupIndexRef = useLatestRef(selectedCoreGroupIndex);
  const storyboardGenerationRef = useLatestRef(storyboardGeneration);

  const rememberStoryWorldAssetImage = useCallback((artifactId: string, media: StoryWorldAssetImage) => {
    setStoryWorld((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        assetImagesByArtifactId: {
          ...(current.assetImagesByArtifactId ?? {}),
          [artifactId]: media
        }
      };
    });
  }, []);

  const applyStoryWorldAssetImageResult = useCallback((artifactId: string, image: StoryboardImageState) => {
    if (image.status === "ready") {
      rememberStoryWorldAssetImage(artifactId, mediaFromReadyStoryboardImage(image));
      setStoryWorldAssetImageJobs((current) => removeJob(current, artifactId));
      return;
    }

    if (image.status === "generating") {
      setStoryWorldAssetImageJobs((current) => ({
        ...current,
        [artifactId]: image.jobId
      }));
      return;
    }

    setStoryWorldAssetImageJobs((current) => removeJob(current, artifactId));
  }, [rememberStoryWorldAssetImage]);

  function replaceStoryboardImage(jobId: string, nextImage: StoryboardImageState) {
    setStoryboard((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        storyboard: {
          ...current.storyboard,
          coreStoryboardGroups: current.storyboard.coreStoryboardGroups.map((group) => ({
            ...group,
            representativeImage:
              shouldReplaceGeneratingImage(group.representativeImage, jobId) ? nextImage : group.representativeImage,
            expandedStoryboardImages: group.expandedStoryboardImages.map((image) =>
              shouldReplaceGeneratingImage(image, jobId) ? nextImage : image
            )
          }))
        }
      };
    });

    setExpansion((current) =>
      current
        ? {
            ...current,
            expandedStoryboardImages: current.expandedStoryboardImages.map((image) =>
              shouldReplaceGeneratingImage(image, jobId) ? nextImage : image
            ),
            expansionCards: current.expansionCards.map((card) => ({
              ...card,
              image: shouldReplaceGeneratingImage(card.image, jobId) ? nextImage : card.image
            }))
          }
        : current
    );
  }

  function applyStoryboardFrameImage(coreGroupIndex: number, frameNumber: number, nextImage: StoryboardImageState) {
    setStoryboard((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        storyboard: {
          ...current.storyboard,
          coreStoryboardGroups: current.storyboard.coreStoryboardGroups.map((group, groupIndex) => {
            if (groupIndex !== coreGroupIndex) {
              return group;
            }

            if (frameNumber === 1) {
              return {
                ...group,
                representativeImage: nextImage
              };
            }

            const imageIndex = frameNumber - 2;
            const expandedStoryboardImages = [...group.expandedStoryboardImages];
            expandedStoryboardImages[imageIndex] = nextImage;

            return {
              ...group,
              expandedStoryboardImages
            };
          })
        }
      };
    });

    setExpansion((current) => {
      if (!current || frameNumber === 1) {
        return current;
      }

      const imageIndex = frameNumber - 2;
      const expandedStoryboardImages = [...current.expandedStoryboardImages];
      expandedStoryboardImages[imageIndex] = nextImage;

      return {
        ...current,
        expandedStoryboardImages,
        expansionCards: current.expansionCards.map((card) =>
          (card.frameNumber ?? card.sortOrder + 2) === frameNumber
            ? {
                ...card,
                image: nextImage
              }
            : card
        )
      };
    });
  }

  function hydrateRestoredProject(
    restored: Exclude<Awaited<ReturnType<typeof restoreCurrentStoryCamSession>>, { restored: false }>,
    options: { preserveCurrentPath?: boolean } = {}
  ) {
    const restoredStepIndex = stepIndexForRestoredCurrentStep(restored.currentStep);
    const currentPathStepIndex = typeof window === "undefined" ? null : stepIndexFromPath(window.location.pathname);
    const targetStepIndex = restoreTargetStepIndex({
      currentPathStepIndex,
      preserveCurrentPath: options.preserveCurrentPath === true,
      restoredStepIndex
    });

    setStoryWorld(restored.storyWorld);
    setStoryWorldAssetImageJobs({});
    setStoryWorldConfirmed(restored.storyWorldConfirmed);
    setStoryboard(restored.storyboard);
    setCoreGroupTargetCount(restored.coreGroupTargetCount);
    setVideoAspectRatio(restored.videoAspectRatio ?? restored.storyWorld.videoAspectRatio ?? defaultStoryCamVideoAspectRatio);
    setVideoModel(parseStoryCamVideoModel(restored.clipJob?.providerName) ?? defaultStoryCamVideoModel);
    setSelectedCoreGroupIndex(restored.storyboard ? 0 : null);
    setExpansion(null);
    setClipConfirmationSummary(null);
    setClipJob(restored.clipJob ?? null);
    setFinalWork(restored.finalWork ?? null);
    resetFinalWorkSaveState();
    setIsStoryWorldEditorOpen(false);
    setStoryWorldGeneration({ kind: "idle" });
    setStoryboardGeneration({ kind: "idle" });
    setClipGeneration({ kind: "idle" });
    setSelectedStepIndex(targetStepIndex === restoredStepIndex ? null : targetStepIndex);
    setWorkspaceNotice(null);
    setStoryboardStatus(restored.storyboard ? "ready" : "idle");
    setStoryboardMessage(
      restored.storyboard
        ? "已恢复核心分镜：1 个 15 秒内核心分镜组。"
        : "已恢复上次生成的故事世界，请确认后继续。"
    );
    if (currentPathStepIndex !== targetStepIndex) {
      syncStepPath(targetStepIndex);
    }

    if (restored.storyboard && shouldSubmitInitialStoryboardImage(restored.storyboard)) {
      const requestId = storyboardRequestIdRef.current + 1;
      storyboardRequestIdRef.current = requestId;
      window.setTimeout(() => {
        void ensureStoryWorldAssetImages(restored.storyWorld);
        void submitInitialStoryboardImage(restored.storyboard!, requestId);
      }, 0);
    }
  }

  function clearRestoredWorkspaceState() {
    storyWorldRequestIdRef.current += 1;
    storyboardRequestIdRef.current += 1;
    clipRequestIdRef.current += 1;
    imagePollAttemptsRef.current = {};
    storyWorldAssetImagePollAttemptsRef.current = {};
    videoPollAttemptsRef.current = {};
    storyWorldAssetImagesInFlightRef.current.clear();
    finalWorkCreationInFlightRef.current.clear();
    finalWorkAutoSubmittedKeyRef.current = null;
    finalWorkSaveFailedKeyRef.current = null;
    finalWorkActiveSaveKeyRef.current = null;

    setStoryWorld(null);
    setStoryWorldAssetImageJobs({});
    setStoryWorldConfirmed(false);
    setStoryboard(null);
    setSelectedCoreGroupIndex(null);
    setExpansion(null);
    setIsExpansionLoading(false);
    setRegeneratingFrameKey(null);
    setClipConfirmationSummary(null);
    setClipJob(null);
    setIsClipSubmitting(false);
    setFinalWork(null);
    setIsFinalWorkSubmitting(false);
    resetFinalWorkSaveState();
    setIsStoryWorldEditorOpen(false);
    setStoryWorldGeneration({ kind: "idle" });
    setStoryboardGeneration({ kind: "idle" });
    setClipGeneration({ kind: "idle" });
    setCoreGroupTargetCount(1);
    setVideoAspectRatio(defaultStoryCamVideoAspectRatio);
    setVideoModel(defaultStoryCamVideoModel);
    setSelectedStepIndex(0);
    setWorkspaceNotice("上次项目已不可用，可以重新开始。");
    setStoryboardStatus("idle");
    setStoryboardMessage("确认故事世界后才能生成核心分镜。");
    syncStepPath(0);
  }

  const refreshSessionMediaUrls = useCallback(async (sessionId: string) => {
    const hasPendingImageJobs = collectStoryboardImageJobIds(storyboardRef.current, expansionRef.current).length > 0;

    if (
      mediaRefreshInFlightRef.current ||
      storyboardGenerationRef.current.kind !== "idle" ||
      hasPendingImageJobs
    ) {
      return;
    }

    mediaRefreshInFlightRef.current = true;

    try {
      const restored = await refreshStoryCamSessionRestore(sessionId);

      if (!restored.restored) {
        return;
      }

      setStoryWorld((current) =>
        current?.sessionId === sessionId
          ? {
              ...current,
              assetImagesByArtifactId: restored.storyWorld.assetImagesByArtifactId
            }
          : current
      );
      setStoryboard((current) =>
        current?.sessionId === sessionId && restored.storyboard
          ? refreshStoryboardMediaFromRestored(current, restored.storyboard)
          : current
      );
      setExpansion((current) =>
        current && restored.storyboard
          ? refreshExpansionMediaFromStoryboard(current, restored.storyboard, selectedCoreGroupIndexRef.current ?? 0)
          : current
      );
      setClipJob((current) => (current && restored.clipJob ? restored.clipJob : current));
      setFinalWork((current) => (current && restored.finalWork ? restored.finalWork : current));
    } catch {
      setWorkspaceNotice("图片预览链接刷新失败，可以稍后刷新页面重试。");
    } finally {
      mediaRefreshInFlightRef.current = false;
    }
  }, [expansionRef, selectedCoreGroupIndexRef, storyboardGenerationRef, storyboardRef]);

  const refreshCurrentSessionMediaUrls = useCallback(() => {
    if (storyWorld?.sessionId) {
      void refreshSessionMediaUrls(storyWorld.sessionId);
    }
  }, [refreshSessionMediaUrls, storyWorld?.sessionId]);

  useEffect(() => {
    if (window.location.pathname === "/" || window.location.pathname === "/storycam") {
      window.history.replaceState(null, "", stepPaths[0]);
    }

    if (window.location.pathname === "/storycam/clip-review" || window.location.pathname === "/storycam/export") {
      window.history.replaceState(null, "", stepPaths[3]);
    }
  }, []);

  useEffect(() => {
    if (!storyWorld?.sessionId) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshSessionMediaUrls(storyWorld.sessionId);
    }, 4 * 60 * 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshSessionMediaUrls, storyWorld?.sessionId]);

  useEffect(() => {
    let isCanceled = false;

    async function restoreSession() {
      if (!shouldAutoRestoreFromPath(window.location.pathname)) {
        setIsRestoringSession(false);
        return;
      }

      try {
        const cachedRestore = await restoreCachedCurrentStoryCamSession();

        if (isCanceled) {
          return;
        }

        if (cachedRestore.restored) {
          hydrateRestoredProject(cachedRestore, { preserveCurrentPath: true });
          setIsRestoringSession(false);
        }

        const restored = await restoreCurrentStoryCamSession();

        if (isCanceled) {
          return;
        }

        if (!restored.restored) {
          if (cachedRestore.restored) {
            clearRestoredWorkspaceState();
          } else {
            setIsRestoringSession(false);
          }
          return;
        }

        hydrateRestoredProject(restored, { preserveCurrentPath: true });
      } catch {
        if (!isCanceled) {
          setWorkspaceNotice("恢复失败，可以重新开始或稍后刷新。");
        }
      } finally {
        if (!isCanceled) {
          setIsRestoringSession(false);
        }
      }
    }

    void restoreSession();

    return () => {
      isCanceled = true;
    };
    // Restore runs only once on mount so it does not replay user navigation state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!clipJob || !shouldPollGenerationJob(clipJob.status)) {
      videoPollAttemptsRef.current = {};
      return;
    }

    const attempts = videoPollAttemptsRef.current[clipJob.id] ?? 0;
    const timer = window.setTimeout(async () => {
      try {
        const response = await getGenerationJob(clipJob.id);
        videoPollAttemptsRef.current[clipJob.id] = attempts + 1;
        setClipJob((current) => (current?.id === clipJob.id ? response.job : current));
      } catch {
        videoPollAttemptsRef.current[clipJob.id] = attempts + 1;
        setClipJob((current) =>
          current?.id === clipJob.id ? { ...current, redactedError: "状态更新失败。", status: "failed" } : current
        );
      }
    }, nextVideoGenerationPollDelayMs(attempts));

    return () => window.clearTimeout(timer);
  }, [clipJob]);

  useEffect(() => {
    if (!clipJob || clipJob.status !== "succeeded" || !clipJob.outputArtifactId || clipJob.outputPreview) {
      return;
    }

    let canceled = false;
    const jobId = clipJob.id;

    async function hydrateClipPreview() {
      try {
        const response = await getGenerationJob(jobId);

        if (!canceled) {
          setClipJob((current) => (current?.id === response.job.id ? response.job : current));
        }
      } catch {
        if (!canceled) {
          setStoryboardMessage("片段已生成，但预览链接刷新失败。可以稍后再试。");
        }
      }
    }

    void hydrateClipPreview();

    return () => {
      canceled = true;
    };
  }, [clipJob]);

  useEffect(() => {
    if (!clipJob?.outputArtifactId || clipJob.status !== "succeeded" || finalWork || finalWorkSaveError || !storyboard) {
      return;
    }

    const inFlight = finalWorkCreationInFlightRef.current;
    const key = `${storyboard.sessionId}:${clipJob.outputArtifactId}`;

    if (finalWorkSaveFailedKeyRef.current === key || finalWorkAutoSubmittedKeyRef.current === key) {
      return;
    }

    if (inFlight.has(key)) {
      return;
    }

    inFlight.add(key);
    finalWorkAutoSubmittedKeyRef.current = key;

    void createFinalWorkFromAcceptedClip().finally(() => {
      inFlight.delete(key);
    });
    // Final work creation is tied to the current completed clip artifact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipJob?.outputArtifactId, clipJob?.status, finalWork, finalWorkSaveError, storyboard?.sessionId]);

  useEffect(() => {
    const imageJobIds = collectStoryboardImageJobIds(storyboard, expansion);

    if (imageJobIds.length === 0) {
      imagePollAttemptsRef.current = {};
      return;
    }

    const pendingJobIds = new Set(imageJobIds);
    imagePollAttemptsRef.current = Object.fromEntries(
      Object.entries(imagePollAttemptsRef.current).filter(([jobId]) => pendingJobIds.has(jobId))
    );

    let canceled = false;
    let isPolling = false;
    let timer: number | undefined;

    const pollImages = async () => {
      if (isPolling) {
        return;
      }

      isPolling = true;
      const results = await mapWithConcurrencyLimit(
        imageJobIds,
        imageGenerationPollingPolicy.maxConcurrentRequests,
        async (jobId) => ({
          jobId,
          result: await getGenerationJob(jobId)
        })
      );
      isPolling = false;

      if (canceled) {
        return;
      }

      for (const [index, result] of results.entries()) {
        const fallbackJobId = imageJobIds[index];

        if (!fallbackJobId) {
          continue;
        }

        if (result.status !== "fulfilled") {
          imagePollAttemptsRef.current[fallbackJobId] = (imagePollAttemptsRef.current[fallbackJobId] ?? 0) + 1;
          continue;
        }

        const { jobId } = result.value;
        imagePollAttemptsRef.current[jobId] = (imagePollAttemptsRef.current[jobId] ?? 0) + 1;

        if (!result.value.result.image || result.value.result.image.status === "generating") {
          continue;
        }

        delete imagePollAttemptsRef.current[jobId];
        replaceStoryboardImage(result.value.result.job.id, result.value.result.image);
      }

      const remainingJobIds = imageJobIds.filter((jobId) => imagePollAttemptsRef.current[jobId] !== undefined);

      if (remainingJobIds.length > 0) {
        const completedAttempts = Math.min(...remainingJobIds.map((jobId) => imagePollAttemptsRef.current[jobId] ?? 0));
        timer = window.setTimeout(pollImages, nextImageGenerationPollDelayMs(completedAttempts));
      }
    };

    timer = window.setTimeout(pollImages, nextImageGenerationPollDelayMs(0));

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [storyboard, expansion]);

  useEffect(() => {
    const jobEntries = Object.entries(storyWorldAssetImageJobs);

    if (jobEntries.length === 0) {
      storyWorldAssetImagePollAttemptsRef.current = {};
      return;
    }

    const pendingJobIds = new Set(jobEntries.map(([, jobId]) => jobId));
    storyWorldAssetImagePollAttemptsRef.current = Object.fromEntries(
      Object.entries(storyWorldAssetImagePollAttemptsRef.current).filter(([jobId]) => pendingJobIds.has(jobId))
    );

    let canceled = false;
    let isPolling = false;
    let timer: number | undefined;

    const pollAssetImages = async () => {
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
          storyWorldAssetImagePollAttemptsRef.current[fallbackJobId] =
            (storyWorldAssetImagePollAttemptsRef.current[fallbackJobId] ?? 0) + 1;
          continue;
        }

        const { jobId } = result.value;
        storyWorldAssetImagePollAttemptsRef.current[jobId] =
          (storyWorldAssetImagePollAttemptsRef.current[jobId] ?? 0) + 1;

        if (result.value.result.job.sessionId !== storyWorldRef.current?.sessionId) {
          delete storyWorldAssetImagePollAttemptsRef.current[jobId];
          setStoryWorldAssetImageJobs((current) => removeJob(current, result.value.artifactId));
          continue;
        }

        const image = result.value.result.image;

        if (!image || image.status === "generating") {
          continue;
        }

        delete storyWorldAssetImagePollAttemptsRef.current[jobId];
        applyStoryWorldAssetImageResult(result.value.artifactId, image);
      }

      const remainingJobIds = jobEntries
        .map(([, jobId]) => jobId)
        .filter((jobId) => storyWorldAssetImagePollAttemptsRef.current[jobId] !== undefined);

      if (remainingJobIds.length > 0) {
        const completedAttempts = Math.min(
          ...remainingJobIds.map((jobId) => storyWorldAssetImagePollAttemptsRef.current[jobId] ?? 0)
        );
        timer = window.setTimeout(pollAssetImages, nextImageGenerationPollDelayMs(completedAttempts));
      }
    };

    timer = window.setTimeout(pollAssetImages, nextImageGenerationPollDelayMs(0));

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [applyStoryWorldAssetImageResult, storyWorldAssetImageJobs, storyWorldRef]);

  function applyStoryWorldCreated(nextStoryWorld: CreateStoryWorldResponse, draft: { idea: string; selectedChoices: string[] }) {
    setInputDraft(draft);
    setVideoAspectRatio(nextStoryWorld.videoAspectRatio ?? defaultStoryCamVideoAspectRatio);
    setVideoModel(defaultStoryCamVideoModel);
    setWorkspaceNotice(null);
    setStoryWorld(nextStoryWorld);
    setStoryWorldAssetImageJobs({});
    setStoryWorldGeneration({ kind: "idle" });
    setStoryboardGeneration({ kind: "idle" });
    setClipGeneration({ kind: "idle" });
    setStoryWorldConfirmed(false);
    setStoryboard(null);
    setSelectedCoreGroupIndex(null);
    setExpansion(null);
    setClipConfirmationSummary(null);
    setClipJob(null);
    setFinalWork(null);
    resetFinalWorkSaveState();
    setIsStoryWorldEditorOpen(false);
    setSelectedStepIndex(null);
    setStoryboardStatus("idle");
    setStoryboardMessage("故事雏形已准备好，请先确认剧本、人物和地点。");
    syncStepPath(1);
  }

  function submitStoryWorldDraft(draft: StoryWorldDraft) {
    const request = {
      ...draft,
      requestId: storyWorldRequestIdRef.current + 1
    };
    storyWorldRequestIdRef.current = request.requestId;

    setInputDraft({ idea: draft.idea, selectedChoices: draft.selectedChoices });
    setVideoAspectRatio(draft.videoAspectRatio);
    setVideoModel(defaultStoryCamVideoModel);
    setWorkspaceNotice(null);
    setStoryWorld(null);
    setStoryWorldAssetImageJobs({});
    setStoryWorldConfirmed(false);
    setStoryboard(null);
    setSelectedCoreGroupIndex(null);
    setExpansion(null);
    setClipConfirmationSummary(null);
    setClipJob(null);
    setFinalWork(null);
    resetFinalWorkSaveState();
    setIsStoryWorldEditorOpen(false);
    setSelectedStepIndex(null);
    setStoryboardStatus("idle");
    setStoryboardMessage("正在生成故事雏形。");
    setStoryboardGeneration({ kind: "idle" });
    setClipGeneration({ kind: "idle" });
    setStoryWorldGeneration({ kind: "pending", request });
    syncStepPath(1);
    void runStoryWorldGeneration(request);
  }

  async function runStoryWorldGeneration(request: StoryWorldGenerationRequest) {
    let requestWithUploads = request;

    try {
      if (request.photo && !request.uploadedPhotoIds?.length) {
        const upload = await uploadStoryCamPhoto({ file: request.photo, sessionId: request.sessionId });

        if (!isActiveStoryWorldRequest(request.requestId)) {
          return;
        }

        requestWithUploads = {
          ...request,
          sessionId: upload.sessionId,
          uploadedPhotoIds: upload.uploadedPhotoIds
        };
        setStoryWorldGeneration({ kind: "pending", request: requestWithUploads });
      }

      const nextStoryWorld = await createStoryWorld({
        input: requestWithUploads.idea,
        lightweightChoices: requestWithUploads.selectedChoices,
        sessionId: requestWithUploads.sessionId,
        uploadedPhotoIds: requestWithUploads.uploadedPhotoIds,
        videoAspectRatio: requestWithUploads.videoAspectRatio
      });

      if (!isActiveStoryWorldRequest(request.requestId)) {
        return;
      }

      applyStoryWorldCreated(nextStoryWorld, {
        idea: requestWithUploads.idea,
        selectedChoices: requestWithUploads.selectedChoices
      });
    } catch {
      if (!isActiveStoryWorldRequest(request.requestId)) {
        return;
      }

      setStoryWorldGeneration({
        kind: "error",
        message: "故事雏形生成失败，可以重试或返回修改。",
        request: requestWithUploads
      });
    }
  }

  function retryStoryWorldGeneration() {
    if (storyWorldGeneration.kind !== "error") {
      return;
    }

    const request = {
      ...storyWorldGeneration.request,
      requestId: storyWorldRequestIdRef.current + 1
    };
    storyWorldRequestIdRef.current = request.requestId;

    setStoryWorldGeneration({ kind: "pending", request });
    setSelectedStepIndex(null);
    syncStepPath(1);
    void runStoryWorldGeneration(request);
  }

  function returnToStoryWorldInput() {
    abandonStoryWorldGeneration();
    setSelectedStepIndex(0);
    syncStepPath(0);
  }

  function abandonStoryWorldGeneration() {
    if (storyWorldGeneration.kind === "idle") {
      return;
    }

    storyWorldRequestIdRef.current += 1;
    setStoryWorldGeneration({ kind: "idle" });
  }

  function isActiveStoryWorldRequest(requestId: number) {
    return storyWorldRequestIdRef.current === requestId;
  }

  async function restoreSelectedProject(sessionId: string) {
    const restored = await restoreStoryCamSession(sessionId);

    if (restored.restored) {
      hydrateRestoredProject(restored);
    }
  }

  async function confirmStoryWorld(_nextCoreGroupTargetCount: 1 | 2 | 3 = 1) {
    if (!storyWorld || storyboardGeneration.kind === "pending") {
      return;
    }

    const request = {
      coreGroupTargetCount: 1 as const,
      requestId: storyboardRequestIdRef.current + 1,
      storyWorld
    };
    storyboardRequestIdRef.current = request.requestId;

    setStoryWorldConfirmed(true);
    setIsStoryWorldEditorOpen(false);
    setCoreGroupTargetCount(1);
    setStoryboard(null);
    setSelectedCoreGroupIndex(null);
    setExpansion(null);
    setClipConfirmationSummary(null);
    setClipJob(null);
    setFinalWork(null);
    resetFinalWorkSaveState();
    setClipGeneration({ kind: "idle" });
    setSelectedStepIndex(null);
    setStoryboardStatus("generating");
    setStoryboardMessage("正在生成核心分镜。");
    setStoryboardGeneration({ kind: "pending", request });
    syncStepPath(2);
    void runStoryboardGeneration(request);
  }

  function handleStoryWorldEdit() {
    setStoryWorldConfirmed(false);
    setStoryboard(null);
    setSelectedCoreGroupIndex(null);
    setExpansion(null);
    setClipConfirmationSummary(null);
    setClipJob(null);
    setFinalWork(null);
    resetFinalWorkSaveState();
    abandonStoryboardGeneration();
    abandonClipGeneration();
    setIsStoryWorldEditorOpen(false);
    setStoryboardStatus((current) => staleStoryboardAfterStoryWorldEdit(current));
    setStoryboardMessage("分镜已过期，需要重新确认故事世界。");
    syncStepPath(1);
  }

  async function deleteCurrentStory() {
    if (!storyWorld || isDeletingStory) {
      return;
    }

    const sessionId = storyWorld.sessionId;
    const runningClipJob = clipJob;

    try {
      setIsDeletingStory(true);
      setStoryboardMessage("正在删除这个故事。");
      abandonClipGeneration();

      if (runningClipJob?.status === "queued" || runningClipJob?.status === "running") {
        await cancelGenerationJob(runningClipJob.id).catch(() => undefined);
      }

      await deleteStoryCamSession(sessionId);
      setStoryWorld(null);
      setStoryWorldAssetImageJobs({});
      setStoryWorldConfirmed(false);
      setStoryboard(null);
      setSelectedCoreGroupIndex(null);
      setExpansion(null);
      setClipConfirmationSummary(null);
      setClipJob(null);
      setFinalWork(null);
      resetFinalWorkSaveState();
      setIsStoryWorldEditorOpen(false);
      setStoryWorldGeneration({ kind: "idle" });
      setStoryboardGeneration({ kind: "idle" });
      setClipGeneration({ kind: "idle" });
      setSelectedStepIndex(null);
      setStoryboardStatus("idle");
      setStoryboardMessage("这个故事已删除，可以重新开始。");
      setWorkspaceNotice("这个故事已删除，可以重新开始。");
    } catch {
      setStoryboardMessage("删除失败，请稍后再试。");
    } finally {
      setIsDeletingStory(false);
    }
  }

  async function runStoryboardGeneration(request: StoryboardGenerationRequest) {
    try {
      setStoryboardStatus("generating");
      setStoryboardMessage("正在生成核心分镜。");
      void ensureStoryWorldAssetImages(request.storyWorld);
      const storyboard = await createStoryboard({
        confirmedArtifactVersions: confirmedArtifactVersionsFromStoryWorld(request.storyWorld),
        coreGroupTargetCount: request.coreGroupTargetCount,
        deferRepresentativeImages: true,
        sessionId: request.storyWorld.sessionId
      });

      if (!isActiveStoryboardRequest(request.requestId)) {
        return;
      }

      setStoryboard(storyboard);
      setSelectedCoreGroupIndex(0);
      setExpansion(null);
      setClipConfirmationSummary(null);
      setClipJob(null);
      setFinalWork(null);
      resetFinalWorkSaveState();
      setClipGeneration({ kind: "idle" });
      setIsStoryWorldEditorOpen(false);
      setSelectedStepIndex(null);
      setStoryboardGeneration({ kind: "idle" });
      setStoryboardStatus("ready");
      setStoryboardMessage(
        `分镜已准备好：1 个核心分镜组，控制在 ${storyboard.durationPlan.plannedDurationSeconds} 秒内。`
      );
      syncStepPath(2);
      void submitInitialStoryboardImage(storyboard, request.requestId);
    } catch {
      if (!isActiveStoryboardRequest(request.requestId)) {
        return;
      }

      setStoryboardStatus("error");
      setStoryboardMessage("核心分镜生成失败，可以重试或返回故事世界。");
      setStoryboardGeneration({
        kind: "error",
        message: "核心分镜生成失败，可以重试或返回故事世界。",
        request
      });
    }
  }

  async function ensureStoryWorldAssetImages(targetStoryWorld: CreateStoryWorldResponse) {
    const assetIds = storyWorldAssetIds(targetStoryWorld);
    const readyAssetImages = targetStoryWorld.assetImagesByArtifactId ?? {};
    const inFlight = storyWorldAssetImagesInFlightRef.current;
    const missingAssetIds = assetIds.filter(
      (artifactId) => !readyAssetImages[artifactId] && !inFlight.has(assetArtifactInFlightKey(targetStoryWorld.sessionId, artifactId))
    );

    if (missingAssetIds.length === 0) {
      return;
    }

    const inFlightKeys = missingAssetIds.map((artifactId) => assetArtifactInFlightKey(targetStoryWorld.sessionId, artifactId));
    inFlightKeys.forEach((key) => inFlight.add(key));

    try {
      const result = await generateStoryWorldAssetImages({
        assetArtifactIds: missingAssetIds,
        sessionId: targetStoryWorld.sessionId
      });

      if (storyWorldRef.current?.sessionId !== targetStoryWorld.sessionId) {
        return;
      }

      for (const [artifactId, item] of Object.entries(result.imagesByArtifactId)) {
        applyStoryWorldAssetImageResult(artifactId, item.image);
      }
    } catch {
      setStoryboardMessage("分镜脚本会先生成，资产图稍后可回到故事世界重试。");
    } finally {
      inFlightKeys.forEach((key) => inFlight.delete(key));
    }
  }

  function retryStoryboardGeneration() {
    if (storyboardGeneration.kind !== "error") {
      return;
    }

    const request = {
      ...storyboardGeneration.request,
      requestId: storyboardRequestIdRef.current + 1
    };
    storyboardRequestIdRef.current = request.requestId;

    setStoryboardGeneration({ kind: "pending", request });
    setStoryboardStatus("generating");
    setStoryboardMessage("正在生成核心分镜。");
    setSelectedStepIndex(null);
    syncStepPath(2);
    void runStoryboardGeneration(request);
  }

  function returnToStoryWorldFromStoryboardGeneration() {
    abandonStoryboardGeneration();
    setSelectedStepIndex(1);
    setStoryboardStatus("idle");
    setStoryboardMessage("确认故事世界后才能生成核心分镜。");
    syncStepPath(1);
  }

  function abandonStoryboardGeneration() {
    if (storyboardGeneration.kind === "idle") {
      return;
    }

    storyboardRequestIdRef.current += 1;
    setStoryboardGeneration({ kind: "idle" });
    setStoryboardStatus("idle");
    setStoryboardMessage("确认故事世界后才能生成核心分镜。");
  }

  function isActiveStoryboardRequest(requestId: number) {
    return storyboardRequestIdRef.current === requestId;
  }

  async function submitInitialStoryboardImage(nextStoryboard: CreateStoryboardResponse, requestId: number) {
    const firstGroup = nextStoryboard.storyboard.coreStoryboardGroups[0];
    const firstArtifact = nextStoryboard.artifacts.coreStoryboardGroups[0];

    if (!firstGroup || !firstArtifact || !shouldSubmitInitialStoryboardImage(storyboardRef.current ?? nextStoryboard)) {
      return;
    }

    try {
      const result = await regenerateStoryboardFrameImage({
        coreStoryboardGroupId: firstArtifact.id,
        frameNumber: 1,
        sessionId: nextStoryboard.sessionId
      });

      if (!isActiveInitialStoryboardImageRequest(nextStoryboard, requestId)) {
        return;
      }

      applyStoryboardFrameImage(0, 1, result.image);

      if (result.image.status === "placeholder" && result.image.reason === "waiting_for_asset_images") {
        if (!scheduleInitialStoryboardImageRetry(nextStoryboard, requestId)) {
          applyStoryboardFrameImage(0, 1, {
            placeholder: true,
            reason: "provider_failed",
            status: "placeholder"
          });
          setStoryboardMessage("资产图暂时没有准备好，第 01 帧主分镜图可稍后手动重试。");
          return;
        }

        setStoryboardMessage("分镜脚本已准备好，等待角色/场景资产图完成后生成第 01 帧主分镜图。");
        return;
      }

      delete initialStoryboardImageRetryAttemptsRef.current[requestId];
      setStoryboardMessage(
        result.image.status === "ready"
          ? "分镜脚本和第 01 帧主分镜图已准备好。"
          : "分镜脚本已准备好，正在生成第 01 帧主分镜图。"
      );
    } catch {
      if (!isActiveInitialStoryboardImageRequest(nextStoryboard, requestId)) {
        return;
      }

      delete initialStoryboardImageRetryAttemptsRef.current[requestId];
      applyStoryboardFrameImage(0, 1, {
        placeholder: true,
        reason: "provider_failed",
        status: "placeholder"
      });
      setStoryboardMessage("分镜脚本已准备好，第 01 帧主分镜图生成失败，可稍后重试。");
    }
  }

  function scheduleInitialStoryboardImageRetry(nextStoryboard: CreateStoryboardResponse, requestId: number) {
    const retryCount = initialStoryboardImageRetryAttemptsRef.current[requestId] ?? 0;

    if (retryCount >= maxInitialStoryboardImageRetryCount) {
      delete initialStoryboardImageRetryAttemptsRef.current[requestId];
      return false;
    }

    initialStoryboardImageRetryAttemptsRef.current[requestId] = retryCount + 1;
    window.setTimeout(() => {
      if (!isActiveInitialStoryboardImageRequest(nextStoryboard, requestId)) {
        return;
      }

      void submitInitialStoryboardImage(storyboardRef.current ?? nextStoryboard, requestId);
    }, initialStoryboardImageRetryDelayMs);

    return true;
  }

  function isActiveInitialStoryboardImageRequest(nextStoryboard: CreateStoryboardResponse, requestId: number) {
    const currentStoryboard = storyboardRef.current;
    const currentArtifact = currentStoryboard?.artifacts.coreStoryboardGroups[0];
    const nextArtifact = nextStoryboard.artifacts.coreStoryboardGroups[0];

    return (
      isActiveStoryboardRequest(requestId) &&
      Boolean(currentStoryboard) &&
      currentStoryboard?.sessionId === nextStoryboard.sessionId &&
      currentArtifact?.id === nextArtifact?.id
    );
  }

  async function cancelLateClipJob(jobId: string) {
    try {
      await cancelGenerationJob(jobId);
    } catch {
      // Best-effort cleanup after the user leaves the pending clip request.
    }
  }

  async function expandCoreGroup(index: number, targetCount = 8) {
    if (!storyboard || isExpansionLoading) {
      return;
    }

    const coreArtifact = storyboard.artifacts.coreStoryboardGroups[index];

    if (!coreArtifact) {
      return;
    }

    if (!canAttemptCoreGroupExpansion(storyboard, index)) {
      setStoryboardMessage("第 01 帧主分镜图还在生成中，完成后再展开 8 张扩展分镜。");
      return;
    }

    try {
      setSelectedCoreGroupIndex(index);
      setIsExpansionLoading(true);
      setStoryboardMessage("正在扩展当前核心分镜组。");
      const nextExpansion = await expandStoryboardGroup({
        coreStoryboardGroupId: coreArtifact.id,
        sessionId: storyboard.sessionId,
        targetCount
      });

      setExpansion(nextExpansion);
      setStoryboard((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          storyboard: {
            ...current.storyboard,
            coreStoryboardGroups: current.storyboard.coreStoryboardGroups.map((group, groupIndex) =>
              groupIndex === index
                ? {
                    ...group,
                    expandedStoryboardImages: nextExpansion.expandedStoryboardImages
                  }
                : group
            )
          }
        };
      });
      setClipConfirmationSummary(null);
      setClipJob(null);
      setFinalWork(null);
      setSelectedStepIndex(null);
      setStoryboardMessage(`已提交 ${nextExpansion.expansionCards.length} 张扩展分镜图，全部完成后才能生成片段。`);
    } catch {
      setStoryboardMessage("扩展分镜生成失败，生成片段前需要补齐 8 张扩展图。");
    } finally {
      setIsExpansionLoading(false);
    }
  }

  async function regenerateFrameImage(index: number, frameNumber: number) {
    if (!storyboard) {
      return;
    }

    const coreArtifact = storyboard.artifacts.coreStoryboardGroups[index];

    if (!coreArtifact) {
      return;
    }

    const frameKey = `${index}:${frameNumber}`;

    try {
      setRegeneratingFrameKey(frameKey);
      const result = await regenerateStoryboardFrameImage({
        coreStoryboardGroupId: coreArtifact.id,
        frameNumber,
        sessionId: storyboard.sessionId
      });

      applyStoryboardFrameImage(index, frameNumber, result.image);
      setStoryboardMessage(`已重新提交第 ${String(frameNumber).padStart(2, "0")} 帧生成。`);
    } catch {
      setStoryboardMessage("这一帧重生成失败，请稍后再试。");
    } finally {
      setRegeneratingFrameKey(null);
    }
  }

  function selectCoreGroup(index: number) {
    if (clipJob || finalWork || isClipSubmitting) {
      return;
    }

    setSelectedCoreGroupIndex(index);
    setClipConfirmationSummary(null);
    setClipJob(null);
    setFinalWork(null);
    resetFinalWorkSaveState();
  }

  function prepareClipGeneration(index = selectedCoreGroupIndex ?? 0) {
    const group = storyboard?.storyboard.coreStoryboardGroups[index];
    const coreArtifact = storyboard?.artifacts.coreStoryboardGroups[index];

    if (!storyboard || !group || !coreArtifact) {
      return;
    }

    setSelectedCoreGroupIndex(index);
    setClipJob(null);
    setFinalWork(null);
    resetFinalWorkSaveState();
    setSelectedStepIndex(null);

    const readyCount = readyExpandedFrameCount(group);

    if (readyCount < requiredExpandedFrameCount) {
      setClipGeneration({ kind: "idle" });
      setClipConfirmationSummary(null);
      setStoryboardMessage(`需要先补齐 8 张扩展分镜图。当前已完成 ${readyCount} / 8。`);
      return;
    }

    const request = {
      coreArtifactId: coreArtifact.id,
      coreGroupIndex: index,
      durationSeconds: group.estimatedClipDurationSeconds,
      requestId: clipRequestIdRef.current + 1,
      sessionId: storyboard.sessionId,
      videoModel
    };
    clipRequestIdRef.current = request.requestId;

    setClipConfirmationSummary(null);
    setClipGeneration({ kind: "pending", request });
    setStoryboardMessage("正在创建片段生成任务。");
    syncStepPath(3);
    void runClipGeneration(request);
  }

  async function runClipGeneration(request: ClipGenerationRequest) {
    if (!storyboard) {
      return;
    }

    const coreArtifact = storyboard.artifacts.coreStoryboardGroups[request.coreGroupIndex];
    const selectedGroup = storyboard.storyboard.coreStoryboardGroups[request.coreGroupIndex];

    if (!coreArtifact || !selectedGroup) {
      return;
    }

    const readyCount = readyExpandedFrameCount(selectedGroup);

    if (readyCount < requiredExpandedFrameCount) {
      setClipConfirmationSummary(null);
      setStoryboardMessage(`需要先补齐 8 张扩展分镜图。当前已完成 ${readyCount} / 8。`);
      return;
    }

    try {
      setIsClipSubmitting(true);
      const response = await generateClipJob({
        confirmedArtifactVersions: confirmedArtifactVersionsForClip(storyboard, request.coreGroupIndex, expansion),
        coreStoryboardGroupId: request.coreArtifactId,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${coreArtifact.id}-${Date.now()}`,
        sessionId: request.sessionId,
        videoModel: request.videoModel
      });

      if (!isActiveClipRequest(request.requestId)) {
        void cancelLateClipJob(response.jobId);
        return;
      }

      setClipConfirmationSummary(null);
      setClipJob({
        attempts: 0,
        id: response.jobId,
        ...(response.outputArtifactId ? { outputArtifactId: response.outputArtifactId } : {}),
        ...(response.providerErrorCategory ? { providerErrorCategory: response.providerErrorCategory } : {}),
        ...(response.providerHttpStatus !== undefined ? { providerHttpStatus: response.providerHttpStatus } : {}),
        providerKind: "video",
        providerName: response.providerName ?? "mock",
        ...(response.redactedError ? { redactedError: response.redactedError } : {}),
        sessionId: storyboard.sessionId,
        status: response.status,
        type: "video_clip"
      });
      setClipGeneration({ kind: "idle" });
      setSelectedStepIndex(null);
      setStoryboardMessage("片段生成任务已创建。");
      syncStepPath(3);
    } catch {
      if (!isActiveClipRequest(request.requestId)) {
        return;
      }

      setStoryboardMessage("片段生成任务创建失败，可以重试或返回核心分镜。");
      setClipGeneration({
        kind: "error",
        message: "片段生成任务创建失败，可以重试或返回核心分镜。",
        request
      });
    } finally {
      if (isActiveClipRequest(request.requestId)) {
        setIsClipSubmitting(false);
      }
    }
  }

  async function cancelClipJob() {
    if (!clipJob) {
      return;
    }

    try {
      const response = await cancelGenerationJob(clipJob.id);
      setClipJob((current) => (current ? { ...current, status: response.status } : current));
      setStoryboardMessage("已取消片段生成任务。");
    } catch {
      setStoryboardMessage("取消失败，请稍后再试。");
    }
  }

  function retryClipGeneration() {
    if (clipGeneration.kind === "error") {
      const request = {
        ...clipGeneration.request,
        requestId: clipRequestIdRef.current + 1
      };
      clipRequestIdRef.current = request.requestId;

      setClipJob(null);
      setFinalWork(null);
      resetFinalWorkSaveState();
      setClipGeneration({ kind: "pending", request });
      setStoryboardMessage("正在创建片段生成任务。");
      setSelectedStepIndex(null);
      syncStepPath(3);
      void runClipGeneration(request);
      return;
    }

    setClipJob(null);
    setFinalWork(null);
    resetFinalWorkSaveState();
    prepareClipGeneration(selectedCoreGroupIndex ?? 0);
  }

  function returnToCoreStoryboardFromClipGeneration() {
    abandonClipGeneration();
    setClipJob(null);
    setFinalWork(null);
    resetFinalWorkSaveState();
    setSelectedStepIndex(2);
    syncStepPath(2);
  }

  function abandonClipGeneration() {
    if (clipGeneration.kind === "idle") {
      return;
    }

    clipRequestIdRef.current += 1;
    setClipGeneration({ kind: "idle" });
    setIsClipSubmitting(false);
  }

  function isActiveClipRequest(requestId: number) {
    return clipRequestIdRef.current === requestId;
  }

  function resetFinalWorkSaveState() {
    finalWorkActiveSaveKeyRef.current = null;
    finalWorkAutoSubmittedKeyRef.current = null;
    finalWorkSaveFailedKeyRef.current = null;
    setFinalWorkSaveError(null);
  }

  async function createFinalWorkFromAcceptedClip(options: { force?: boolean } = {}) {
    if (!clipJob?.outputArtifactId || !storyboard) {
      return null;
    }

    const clipArtifactId = clipJob.outputArtifactId;
    const sessionId = storyboard.sessionId;
    const saveKey = `${sessionId}:${clipArtifactId}`;

    try {
      finalWorkActiveSaveKeyRef.current = saveKey;
      setIsFinalWorkSubmitting(true);
      if (options.force || finalWorkSaveFailedKeyRef.current === saveKey) {
        finalWorkSaveFailedKeyRef.current = null;
      }
      setFinalWorkSaveError(null);
      const suggestion = await createStitchSuggestion({
        generatedClipArtifactIds: [clipArtifactId],
        sessionId
      });
      const nextFinalWork = await createFinalWork({
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${clipArtifactId}-${Date.now()}`,
        sessionId,
        stitchSuggestionArtifactId: suggestion.stitchSuggestion.id
      });

      if (clipJobRef.current?.outputArtifactId !== clipArtifactId || storyboardRef.current?.sessionId !== sessionId) {
        return null;
      }

      setFinalWork(nextFinalWork);
      finalWorkSaveFailedKeyRef.current = null;
      setFinalWorkSaveError(null);
      setSelectedStepIndex(null);
      setStoryboardMessage("最终作品已生成，并保存到账号内预览。");
      syncStepPath(3);
      return nextFinalWork;
    } catch {
      if (clipJobRef.current?.outputArtifactId !== clipArtifactId || storyboardRef.current?.sessionId !== sessionId) {
        return null;
      }

      finalWorkSaveFailedKeyRef.current = saveKey;
      setFinalWorkSaveError("最终作品保存失败，请重试。");
      setStoryboardMessage("最终作品保存失败，请重试。");
      return null;
    } finally {
      if (finalWorkActiveSaveKeyRef.current === saveKey) {
        finalWorkActiveSaveKeyRef.current = null;
        setIsFinalWorkSubmitting(false);
      }
    }
  }

  function retryFinalWorkSave() {
    return createFinalWorkFromAcceptedClip({ force: true });
  }

  const selectedGroup =
    storyboard && selectedCoreGroupIndex !== null ? storyboard.storyboard.coreStoryboardGroups[selectedCoreGroupIndex] : undefined;
  const reachedStepIndex = currentStepIndex({
    clipGeneration,
    clipConfirmationSummary,
    clipJob,
    finalWork,
    storyboardGeneration,
    storyboard,
    storyWorld,
    storyWorldGeneration
  });
  const activeStepIndex = selectedStepIndex !== null && selectedStepIndex <= reachedStepIndex ? selectedStepIndex : reachedStepIndex;

  useEffect(() => {
    function handlePopState() {
      const stepIndex = stepIndexFromPath(window.location.pathname);

      if (stepIndex === 0 && !storyWorld && storyWorldGeneration.kind !== "idle") {
        storyWorldRequestIdRef.current += 1;
        setStoryWorldGeneration({ kind: "idle" });
      }

      if ((stepIndex === null || stepIndex <= 1) && storyboardGeneration.kind !== "idle") {
        storyboardRequestIdRef.current += 1;
        setStoryboardGeneration({ kind: "idle" });
        setStoryboardStatus("idle");
        setStoryboardMessage("确认故事世界后才能生成核心分镜。");
      }

      if ((stepIndex === null || stepIndex <= 2) && clipGeneration.kind !== "idle") {
        clipRequestIdRef.current += 1;
        setClipGeneration({ kind: "idle" });
        setIsClipSubmitting(false);
      }

      setSelectedStepIndex(stepIndex !== null && stepIndex <= reachedStepIndex ? stepIndex : null);
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [clipGeneration.kind, reachedStepIndex, storyWorld, storyboardGeneration.kind, storyWorldGeneration.kind]);

  const clipWorkspaceVideoModel =
    clipGeneration.kind !== "idle"
      ? clipGeneration.request.videoModel
      : parseStoryCamVideoModel(clipJob?.providerName) ?? videoModel;

  const clipGenerationPanel =
    activeStepIndex >= 3 && (clipGeneration.kind !== "idle" || clipJob || finalWork) ? (
      <ClipGenerationWorkspace
        clipGenerationState={clipGeneration}
        clipJob={clipJob}
        durationSeconds={
          clipJob?.outputPreview?.durationSeconds ??
          finalWork?.preview?.durationSeconds ??
          (clipGeneration.kind !== "idle" ? clipGeneration.request.durationSeconds : undefined) ??
          selectedGroup?.estimatedClipDurationSeconds ??
          15
        }
        finalWork={finalWork}
        finalWorkError={finalWorkSaveError}
        isDeletingStory={isDeletingStory}
        isFinalWorkSubmitting={isFinalWorkSubmitting}
        onBackToCoreStoryboard={clipGeneration.kind !== "idle" ? returnToCoreStoryboardFromClipGeneration : () => navigateToStep(2)}
        onCancelClip={cancelClipJob}
        onDeleteStory={deleteCurrentStory}
        onRetryFinalWork={retryFinalWorkSave}
        onRetake={retryClipGeneration}
        posterImageUrl={selectedGroup?.representativeImage.status === "ready" ? selectedGroup.representativeImage.signedUrl : undefined}
        title={selectedGroup?.title}
        videoAspectRatio={videoAspectRatio}
        videoModel={clipWorkspaceVideoModel}
      />
    ) : null;
  function navigateToStep(index: number) {
    if (index > reachedStepIndex) {
      return;
    }

    if (index === 0 && !storyWorld) {
      abandonStoryWorldGeneration();
    }

    if (index <= 1) {
      abandonStoryboardGeneration();
    }

    if (index <= 2) {
      abandonClipGeneration();
    }

    setSelectedStepIndex(index);
    syncStepPath(index);

    if (index !== 1) {
      setIsStoryWorldEditorOpen(false);
    }
  }

  function goHome() {
    if (!storyWorld) {
      abandonStoryWorldGeneration();
    }

    abandonStoryboardGeneration();
    abandonClipGeneration();
    setSelectedStepIndex(0);
    setIsStoryWorldEditorOpen(false);
    syncStepPath(0);
  }

  const mainSurface = isRestoringSession ? (
    <div className="storycam-glass p-8 text-sm font-bold text-[#dbfcff]" role="status">
      正在恢复你上次生成的故事。
    </div>
  ) : storyWorld && activeStepIndex === 0 ? (
    <div className="flex w-full flex-col gap-6">
      <IdeaInputPanel
        initialChoices={inputDraft.selectedChoices}
        initialIdea={inputDraft.idea}
        onProjectSelected={restoreSelectedProject}
        onSubmitStoryWorldDraft={submitStoryWorldDraft}
      />
    </div>
  ) : storyWorldGeneration.kind !== "idle" && activeStepIndex >= 1 ? (
    <StoryWorldPendingReviewShell
      generationState={storyWorldGeneration}
      onBackToInput={returnToStoryWorldInput}
      onRetry={retryStoryWorldGeneration}
    />
  ) : storyWorld ? (
    <div>
      {clipGenerationPanel ? (
        clipGenerationPanel
      ) : storyboardGeneration.kind !== "idle" && activeStepIndex >= 2 ? (
        <CoreStoryboardPendingShell
          generationState={storyboardGeneration}
          onBackToStoryWorld={returnToStoryWorldFromStoryboardGeneration}
          onRetry={retryStoryboardGeneration}
        />
      ) : activeStepIndex >= 2 && storyboard && !isStoryWorldEditorOpen ? (
        <CoreFramesStage
          expansion={expansion}
          isBusy={isExpansionLoading || isClipSubmitting}
          isExpansionLoading={isExpansionLoading}
          isRegeneratingFrame={(frameNumber) => regeneratingFrameKey === `${selectedCoreGroupIndex ?? 0}:${frameNumber}`}
          onBackToStoryWorld={() => navigateToStep(1)}
          onConfirmExpansion={(index) => expandCoreGroup(index, 8)}
          onGenerateClip={prepareClipGeneration}
          onMediaLoadError={refreshCurrentSessionMediaUrls}
          onRegenerateFrame={regenerateFrameImage}
          onSelectGroup={selectCoreGroup}
          onVideoModelChange={setVideoModel}
          selectedIndex={selectedCoreGroupIndex ?? 0}
          storyboard={storyboard}
          videoModel={videoModel}
        />
      ) : (
        <StoryWorldReview
          initiallyEditing={isStoryWorldEditorOpen}
          isGeneratingStoryboard={storyboardStatus === "generating"}
          isConfirmed={storyWorldConfirmed}
          initialAssetImages={storyWorld.assetImagesByArtifactId}
          key={storyWorld.artifacts.script.id}
          onAssetImageReady={rememberStoryWorldAssetImage}
          onConfirm={confirmStoryWorld}
          onEditSaved={handleStoryWorldEdit}
          onMediaLoadError={refreshCurrentSessionMediaUrls}
          storyWorld={storyWorld}
        />
      )}
    </div>
  ) : (
    <div className="flex w-full flex-col gap-6">
      {workspaceNotice ? (
        <p className="rounded-[1.5rem] border border-[#00f0ff]/40 bg-[#00f0ff]/10 px-5 py-4 text-sm font-bold text-[#dbfcff]" role="status">
          {workspaceNotice}
        </p>
      ) : null}
      <IdeaInputPanel
        initialChoices={inputDraft.selectedChoices}
        initialIdea={inputDraft.idea}
        onProjectSelected={restoreSelectedProject}
        onSubmitStoryWorldDraft={submitStoryWorldDraft}
      />
    </div>
  );
  const isInputStep = activeStepIndex === 0;

  return (
    <main className={`storycam-page ${isInputStep ? "" : "storycam-page--with-progress"}`}>
      <StoryCamTopBar
        activeStepIndex={isInputStep ? null : activeStepIndex}
        onHome={goHome}
        onSelectStep={navigateToStep}
        reachedStepIndex={reachedStepIndex}
      />
      <div className={`storycam-shell ${isInputStep ? "storycam-shell--centered" : ""}`}>
        <div className="storycam-workspace-surface">{mainSurface}</div>
      </div>
    </main>
  );
}

type StoryWorldPendingReviewShellProps = {
  generationState: Exclude<StoryWorldGenerationState, { kind: "idle" }>;
  onBackToInput: () => void;
  onRetry: () => void;
};

function StoryWorldPendingReviewShell({
  generationState,
  onBackToInput,
  onRetry
}: StoryWorldPendingReviewShellProps) {
  const { request } = generationState;
  const isPending = generationState.kind === "pending";

  return (
    <section className="storycam-story-world relative" data-testid="story-world-generating">
      <StoryWorldPendingHero />

      <div className="storycam-story-world-grid" data-testid="story-world-layout-grid">
        <div className="storycam-script-column">
          <StoryWorldPendingScriptCard generationState={generationState} />
        </div>
        <StoryWorldPendingAssetsColumn />
      </div>

      <StoryWorldPendingDock isPending={isPending} onBackToInput={onBackToInput} onRetry={onRetry} />
    </section>
  );
}

function StoryWorldPendingHero() {
  return (
    <div className="storycam-story-world-hero">
      <div className="storycam-section-kicker">
        <span />
        <p>第二部：故事世界</p>
        <span />
      </div>
      <h1 className="storycam-heading-lg">确认故事世界</h1>
      <p>审查剧本、人物与场景资产，确认后进入核心分镜。</p>
    </div>
  );
}

function StoryWorldPendingScriptCard({
  generationState
}: {
  generationState: Exclude<StoryWorldGenerationState, { kind: "idle" }>;
}) {
  const { request } = generationState;
  const isPending = generationState.kind === "pending";
  const statusText = request.photo ? "正在保存参考照片并生成剧本。" : "正在生成你的剧本、人物和地点。";
  const visibleChoices = request.selectedChoices.length ? request.selectedChoices : ["未选择拍法"];

  return (
    <div
      className="storycam-glass storycam-script-card relative overflow-hidden p-6 md:p-8"
      data-testid="story-world-script-card"
      role={isPending ? "status" : "alert"}
    >
      <div className="storycam-script-card-texture" />
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <span className="storycam-script-icon">
            文
          </span>
          <div>
            <p className="storycam-eyebrow">我的剧本</p>
            <p className="mt-1 text-xs font-bold text-[#849495]">
              {isPending ? "生成中" : "需要重试"}
            </p>
          </div>
        </div>
        <Button className="px-4 py-2 text-xs" disabled size="sm" type="button" variant="secondaryGlass">
          改剧本
        </Button>
      </div>

      <div className="storycam-logline-box">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#00f0ff]">故事一句话</p>
        <p className="mt-2 text-lg font-black leading-8 text-[#eefbfc]">{request.idea}</p>
        <p className="mt-3 text-xs font-bold text-[#849495]">{statusText}</p>
        {request.photo ? (
          <p className="mt-3 text-xs font-bold text-[#849495]">参考照片：{request.photo.name}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleChoices.map((choice) => (
            <span className="rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-xs font-black text-[#dbfcff]" key={choice}>
              {choice}
            </span>
          ))}
        </div>
      </div>

      <StoryWorldPendingScriptBody generationState={generationState} />
      <StoryWorldPendingBeats isPending={isPending} />
    </div>
  );
}

function StoryWorldPendingScriptBody({
  generationState
}: {
  generationState: Exclude<StoryWorldGenerationState, { kind: "idle" }>;
}) {
  const isPending = generationState.kind === "pending";

  return (
    <article className="storycam-script-body">
      <p className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-[#849495]">完整剧本</p>
      {isPending ? (
        <div className="space-y-4" data-testid="story-world-script-skeleton">
          <span className="storycam-skeleton-line storycam-skeleton-line--wide" />
          <span className="storycam-skeleton-line storycam-skeleton-line--medium" />
          <span className="storycam-skeleton-line storycam-skeleton-line--short" />
        </div>
      ) : (
        <div>
          <p className="text-[15px] font-semibold leading-8 text-[#ffd9e0]">{generationState.message}</p>
          <p className="mt-4 text-sm font-bold leading-6 text-[#849495]">可以重试，或回到输入页调整这一幕。</p>
        </div>
      )}
    </article>
  );
}

function StoryWorldPendingBeats({ isPending }: { isPending: boolean }) {
  return (
    <div className="relative mt-6 border-t border-white/10 pt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="storycam-eyebrow">关键片段</p>
        <span className="text-xs font-bold text-[#849495]">{isPending ? "生成中" : "未生成"}</span>
      </div>
      {isPending ? (
        <ol className="storycam-story-beats" data-testid="story-world-beats-skeleton">
          {[1, 2, 3].map((item) => (
            <li key={item}>
              <span>{String(item).padStart(2, "0")}</span>
              <p><span className="storycam-skeleton-line" /></p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-[1rem] border border-[#ff4b89]/30 bg-[#ff4b89]/10 px-4 py-3 text-sm font-bold text-[#ffd9e0]">
          关键片段还没有生成。
        </p>
      )}
    </div>
  );
}

function StoryWorldPendingAssetsColumn() {
  return (
    <div className="storycam-assets-column">
      <div className="storycam-asset-generate-banner">
        <p>
          <span aria-hidden="true">
            <Info className="size-3.5" strokeWidth={2.4} />
          </span>
          资产图会在剧本生成后出现。
        </p>
        <Button className="px-4 py-2 text-xs" disabled size="sm" type="button" variant="secondaryGlass">
          等待剧本生成
        </Button>
      </div>
      <StoryWorldPendingAssetSection heading="角色资产" title="人物生成后出现" variant="characters" />
      <StoryWorldPendingAssetSection heading="场景资产" title="地点生成后出现" variant="scenes" />
    </div>
  );
}

function StoryWorldPendingAssetSection({
  heading,
  title,
  variant
}: {
  heading: string;
  title: string;
  variant: "characters" | "scenes";
}) {
  return (
    <section>
      <div className="storycam-asset-section-header">
        <h2 className="text-2xl font-black text-[#e2e2e2]">{heading}</h2>
        <span className="storycam-eyebrow">WAITING</span>
      </div>
      <div className={`storycam-asset-grid storycam-asset-grid--${variant}`}>
        <StoryWorldPendingAssetPlaceholder title={title} />
      </div>
    </section>
  );
}

function StoryWorldPendingAssetPlaceholder({ title }: { title: string }) {
  return (
    <article className="storycam-glass storycam-asset-card storycam-asset-card--pending p-5">
      <div className="storycam-skeleton-block" />
      <p className="mt-4 text-sm font-black text-[#d5e2e3]">{title}</p>
      <div className="mt-3 space-y-2">
        <span className="storycam-skeleton-line storycam-skeleton-line--wide" />
        <span className="storycam-skeleton-line storycam-skeleton-line--medium" />
      </div>
    </article>
  );
}

function StoryWorldPendingDock({
  isPending,
  onBackToInput,
  onRetry
}: {
  isPending: boolean;
  onBackToInput: () => void;
  onRetry: () => void;
}) {
  return (
    <StoryCamBottomDock>
      <div className="rounded-full border border-white/10 bg-black/40 px-5 py-3 text-sm font-black text-[#dbfcff]">
        1 组 · 约 15 秒内
      </div>
      {isPending ? (
        <Button disabled type="button" variant="primaryNeon">
          剧本生成中
        </Button>
      ) : (
        <div className="flex flex-wrap justify-end gap-3">
          <Button onClick={onBackToInput} type="button" variant="secondaryGlass">
            返回修改
          </Button>
          <Button onClick={onRetry} type="button" variant="primaryNeon">
            重试生成
          </Button>
        </div>
      )}
    </StoryCamBottomDock>
  );
}

type CoreStoryboardPendingShellProps = {
  generationState: Exclude<StoryboardGenerationState, { kind: "idle" }>;
  onBackToStoryWorld: () => void;
  onRetry: () => void;
};

function CoreStoryboardPendingShell({
  generationState,
  onBackToStoryWorld,
  onRetry
}: CoreStoryboardPendingShellProps) {
  const isPending = generationState.kind === "pending";
  const story = generationState.request.storyWorld.storyWorld;

  return (
    <section className="storycam-core-stage relative" data-testid="core-storyboard-card">
      <header className="storycam-core-hero">
        <div className="storycam-section-kicker">
          <span />
          <p>第三部：核心分镜</p>
          <span />
        </div>
        <h1 className="storycam-heading-xl">核心分镜</h1>
        <p>把已确认的故事世界整理成一组可生成片段的核心分镜。</p>
      </header>

      <div className="storycam-core-workbench">
        <div className="storycam-core-board-panel" data-testid="core-storyboard-pending-board">
          <div className="storycam-core-board-header">
            <h2>01 · 自动延展画布</h2>
            <div className="storycam-core-board-status">
              <span>中心主图</span>
              <strong>{isPending ? "生成中" : "未生成"}</strong>
              <span>扩展中</span>
              <strong>0 / 8</strong>
            </div>
          </div>

          <div className="storycam-expansion-board storycam-core-inline-board" data-expanded="false">
            <article className="storycam-expansion-slot storycam-expansion-slot--center storycam-expansion-slot--pending" data-testid="storyboard-frame-01">
              <span className="storycam-frame-number">01</span>
              <div className="storycam-skeleton-block" />
            </article>
          </div>
        </div>

        <aside className="storycam-core-script-panel" data-testid="core-storyboard-pending-script">
          <div className="storycam-core-script-header">
            <div>
              <p className="storycam-eyebrow">分镜脚本</p>
              <h2>{story.script.title}</h2>
            </div>
            <span>{isPending ? "生成中" : "未生成"}</span>
          </div>
          <p className="storycam-core-script-rhythm">{story.script.logline}</p>
          {isPending ? (
            <div className="space-y-4">
              <span className="storycam-skeleton-line storycam-skeleton-line--wide" />
              <span className="storycam-skeleton-line storycam-skeleton-line--medium" />
              <span className="storycam-skeleton-line storycam-skeleton-line--wide" />
              <span className="storycam-skeleton-line storycam-skeleton-line--short" />
            </div>
          ) : (
            <p className="rounded-[1rem] border border-[#ff4b89]/30 bg-[#ff4b89]/10 px-4 py-3 text-sm font-bold text-[#ffd9e0]">
              {generationState.message}
            </p>
          )}
        </aside>
      </div>

      <StoryCamBottomDock className="storycam-core-dock">
        <div className="rounded-full border border-white/10 bg-black/40 px-5 py-3 text-sm font-black text-[#dbfcff]">
          1 组 · 约 15 秒内
        </div>
        <Button onClick={onBackToStoryWorld} type="button" variant="secondaryGlass">
          返回故事世界
        </Button>
        {isPending ? (
          <Button disabled type="button" variant="primaryNeon">
            核心分镜生成中
          </Button>
        ) : (
          <Button onClick={onRetry} type="button" variant="primaryNeon">
            重试生成
          </Button>
        )}
        <div className="storycam-core-dock-progress">
          <span />
          0 / 8 已完成
        </div>
      </StoryCamBottomDock>
    </section>
  );
}

type CurrentStepInput = {
  clipGeneration: ClipGenerationState;
  clipConfirmationSummary: string | null;
  clipJob: GenerationJobSummary | null;
  finalWork: FinalWorkResponse | null;
  storyboard: CreateStoryboardResponse | null;
  storyboardGeneration: StoryboardGenerationState;
  storyWorld: CreateStoryWorldResponse | null;
  storyWorldGeneration: StoryWorldGenerationState;
};

function currentStepIndex({
  clipGeneration,
  clipConfirmationSummary,
  clipJob,
  finalWork,
  storyboard,
  storyboardGeneration,
  storyWorld,
  storyWorldGeneration
}: CurrentStepInput) {
  if (finalWork || clipJob || clipConfirmationSummary || clipGeneration.kind !== "idle") {
    return 3;
  }

  if (storyboard || storyboardGeneration.kind !== "idle") {
    return 2;
  }

  if (storyWorld || storyWorldGeneration.kind !== "idle") {
    return 1;
  }

  return 0;
}

function shouldSubmitInitialStoryboardImage(storyboard: CreateStoryboardResponse) {
  const image = storyboard.storyboard.coreStoryboardGroups[0]?.representativeImage;

  return image?.status === "placeholder" && (!image.reason || image.reason === "waiting_for_asset_images");
}

function storyWorldAssetIds(storyWorld: CreateStoryWorldResponse) {
  return [
    ...storyWorld.artifacts.characterAssets.map((artifact) => artifact.id),
    ...storyWorld.artifacts.sceneAssets.slice(0, 1).map((artifact) => artifact.id)
  ];
}

function assetArtifactInFlightKey(sessionId: string, artifactId: string) {
  return `${sessionId}:${artifactId}`;
}

function mediaFromReadyStoryboardImage(image: Extract<StoryboardImageState, { status: "ready" }>): StoryWorldAssetImage {
  return {
    id: image.mediaId,
    mimeType: image.mimeType,
    signedUrl: image.signedUrl,
    signedUrlExpiresIn: image.signedUrlExpiresIn
  };
}

function removeJob(current: Record<string, string>, artifactId: string) {
  const next = { ...current };
  delete next[artifactId];

  return next;
}

function canAttemptCoreGroupExpansion(storyboard: CreateStoryboardResponse, index: number) {
  const image = storyboard.storyboard.coreStoryboardGroups[index]?.representativeImage;

  if (image?.status === "ready") {
    return true;
  }

  return image?.status === "placeholder" && Boolean(image.reason) && image.reason !== "waiting_for_asset_images";
}

function refreshExpansionMediaFromStoryboard(
  current: ExpandStoryboardGroupResponse,
  restoredStoryboard: CreateStoryboardResponse,
  coreGroupIndex: number
) {
  const restoredGroup = restoredStoryboard.storyboard.coreStoryboardGroups[coreGroupIndex];

  if (!restoredGroup) {
    return current;
  }

  return {
    ...current,
    expandedStoryboardImages: restoredGroup.expandedStoryboardImages,
    expansionCards: current.expansionCards.map((card, index) => {
      const frameNumber = card.frameNumber ?? card.sortOrder + 2;
      const restoredImage = restoredGroup.expandedStoryboardImages[frameNumber - 2] ?? restoredGroup.expandedStoryboardImages[index];

      return restoredImage ? { ...card, image: restoredImage } : card;
    })
  };
}

function refreshStoryboardMediaFromRestored(
  current: CreateStoryboardResponse,
  restored: CreateStoryboardResponse
): CreateStoryboardResponse {
  return {
    ...current,
    storyboard: {
      ...current.storyboard,
      coreStoryboardGroups: current.storyboard.coreStoryboardGroups.map((group, index) => {
        const restoredGroup = restored.storyboard.coreStoryboardGroups[index];

        if (!restoredGroup) {
          return group;
        }

        return {
          ...group,
          expandedStoryboardImages: group.expandedStoryboardImages.map((image, imageIndex) =>
            refreshStoryboardImage(image, restoredGroup.expandedStoryboardImages[imageIndex])
          ),
          representativeImage: refreshStoryboardImage(group.representativeImage, restoredGroup.representativeImage)
        };
      })
    }
  };
}

function refreshStoryboardImage(current: StoryboardImageState, restored?: StoryboardImageState) {
  if (!restored || current.status === "generating") {
    return current;
  }

  if (current.status === "ready") {
    return restored.status === "ready" ? restored : current;
  }

  return restored;
}

function syncStepPath(index: number) {
  const path = stepPaths[index];

  if (!path || typeof window === "undefined" || window.location.pathname === path) {
    return;
  }

  window.history.pushState(null, "", path);
}

function stepIndexFromPath(pathname: string) {
  const index = stepPaths.findIndex((path) => path === pathname);

  if (index >= 0) {
    return index;
  }

  if (pathname === "/storycam/clip-review" || pathname === "/storycam/export") {
    return 3;
  }

  return null;
}

type RestoredCurrentStep = Exclude<Awaited<ReturnType<typeof restoreCurrentStoryCamSession>>, { restored: false }>["currentStep"];

function stepIndexForRestoredCurrentStep(step: RestoredCurrentStep) {
  switch (step) {
    case "story-world":
      return 1;
    case "core-storyboard":
      return 2;
    case "clip-generation":
      return 3;
    case "clip-review":
    case "export":
      return 3;
  }
}

function restoreTargetStepIndex(input: {
  currentPathStepIndex: number | null;
  preserveCurrentPath: boolean;
  restoredStepIndex: number;
}) {
  if (!input.preserveCurrentPath || input.currentPathStepIndex === null) {
    return input.restoredStepIndex;
  }

  if (input.currentPathStepIndex > input.restoredStepIndex) {
    return input.restoredStepIndex;
  }

  return input.currentPathStepIndex;
}

function shouldAutoRestoreFromPath(pathname: string) {
  return pathname !== "/" && pathname !== "/storycam" && pathname !== "/storycam/input";
}

function collectStoryboardImageJobIds(storyboard: CreateStoryboardResponse | null, expansion: ExpandStoryboardGroupResponse | null) {
  const jobIds = new Set<string>();

  for (const group of storyboard?.storyboard.coreStoryboardGroups ?? []) {
    if (group.representativeImage.status === "generating") {
      jobIds.add(group.representativeImage.jobId);
    }

    for (const image of group.expandedStoryboardImages) {
      if (image.status === "generating") {
        jobIds.add(image.jobId);
      }
    }
  }

  for (const image of expansion?.expandedStoryboardImages ?? []) {
    if (image.status === "generating") {
      jobIds.add(image.jobId);
    }
  }

  return Array.from(jobIds);
}

function shouldReplaceGeneratingImage(current: StoryboardImageState, jobId: string) {
  return current.status === "generating" && current.jobId === jobId;
}

function readyExpandedFrameCount(group: CreateStoryboardResponse["storyboard"]["coreStoryboardGroups"][number]) {
  return (group.expandedStoryboardImages ?? []).filter((image) => image.status === "ready").length;
}

function StoryCamTopBar({
  activeStepIndex,
  onHome,
  onSelectStep,
  reachedStepIndex
}: {
  activeStepIndex: number | null;
  onHome: () => void;
  onSelectStep: (index: number) => void;
  reachedStepIndex: number;
}) {
  return (
    <header className={`storycam-topbar ${activeStepIndex === null ? "" : "storycam-topbar--with-progress"}`}>
      <button aria-label="返回首页" className="storycam-brand" onClick={onHome} type="button">
        StoryCam 导演工作台
      </button>
      {activeStepIndex === null ? null : (
        <div className="storycam-topbar-progress">
          <StoryCamProgress activeIndex={activeStepIndex} onSelectStep={onSelectStep} reachedIndex={reachedStepIndex} />
        </div>
      )}
      <div className="storycam-topbar-actions">
        <StoryCamAccountButton />
      </div>
    </header>
  );
}

function StoryCamAccountButton() {
  const [authStatus, setAuthStatus] = useState<TopBarAuthStatus>("checking");
  const [email, setEmail] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    void getAuthStatus()
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setAuthStatus(response.authenticated ? "authenticated" : "anonymous");
        setEmail(response.authenticated ? response.user.email : undefined);
        setIsMenuOpen(false);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setAuthStatus("error");
        setEmail(undefined);
        setIsMenuOpen(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function closeWhenOutside(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMenuOpen]);

  async function signInWithGoogle() {
    if (authStatus === "authenticated" || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      setErrorMessage("登录暂时不可用，请稍后再试。");
      setIsSubmitting(false);
    }
  }

  async function signOut() {
    if (authStatus !== "authenticated" || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const response = await fetch("/api/auth/sign-out", { method: "POST" });

    if (!response.ok) {
      setErrorMessage("退出暂时不可用，请稍后再试。");
      setIsSubmitting(false);
      return;
    }

    setIsMenuOpen(false);
    setAuthStatus("anonymous");
    setEmail(undefined);
    setIsSubmitting(false);
    clearStoryCamRestoreCache();
    window.location.reload();
  }

  async function handleAccountAction() {
    if (authStatus === "authenticated") {
      setErrorMessage(null);
      setIsMenuOpen((current) => !current);
      return;
    }

    await signInWithGoogle();
  }

  const isAuthenticated = authStatus === "authenticated";
  const label = accountLabel(authStatus, isSubmitting);
  const initials = accountInitials(authStatus, email);

  return (
    <div className="storycam-account-entry" ref={accountMenuRef}>
      <button
        aria-expanded={isAuthenticated ? isMenuOpen : undefined}
        aria-haspopup={isAuthenticated ? "menu" : undefined}
        aria-label={isAuthenticated ? `账号 ${email ?? "已登录"}` : "账号，使用 Google 登录"}
        className={`storycam-account-button${isAuthenticated ? " storycam-account-button--icon-only" : ""}`}
        disabled={authStatus === "checking" || isSubmitting}
        onClick={handleAccountAction}
        type="button"
      >
        <span aria-hidden="true" className="storycam-account-avatar">
          {initials}
        </span>
        <span className="storycam-account-label">{label}</span>
      </button>
      {isAuthenticated && isMenuOpen ? (
        <div className="storycam-account-menu" role="menu">
          <p className="storycam-account-menu-email">{email ?? "已登录"}</p>
          <button className="storycam-account-menu-item" disabled={isSubmitting} onClick={signOut} role="menuitem" type="button">
            {isSubmitting ? "正在退出" : "退出"}
          </button>
        </div>
      ) : null}
      {errorMessage ? <span className="storycam-account-error">{errorMessage}</span> : null}
    </div>
  );
}

function accountLabel(authStatus: TopBarAuthStatus, isSubmitting: boolean) {
  if (isSubmitting) {
    return authStatus === "authenticated" ? "正在退出" : "打开 Google";
  }

  if (authStatus === "checking") {
    return "检查账号";
  }

  if (authStatus === "authenticated") {
    return "";
  }

  return "账号登录";
}

function accountInitials(authStatus: TopBarAuthStatus, email: string | undefined) {
  if (authStatus === "checking") {
    return "...";
  }

  if (authStatus === "authenticated") {
    return (email?.trim().charAt(0) || "A").toUpperCase();
  }

  return "G";
}

function StoryCamProgress({
  activeIndex,
  onSelectStep,
  reachedIndex
}: {
  activeIndex: number;
  onSelectStep: (index: number) => void;
  reachedIndex: number;
}) {
  const progressStages = workflowStages.slice(1);
  const progressReachedIndex = Math.max(0, Math.min(progressStages.length - 1, reachedIndex - 1));
  const activeProgress = progressStages.length > 1 ? progressReachedIndex / (progressStages.length - 1) : 0;
  const activeStyle = {
    "--storycam-progress": activeProgress
  } as CSSProperties;

  return (
    <nav aria-label="StoryCam steps" className="storycam-stepper">
      <div className="storycam-stepper-line" />
      <div className="storycam-stepper-line-active" style={activeStyle} />
      <ol className="storycam-stepper-items">
        {progressStages.map((stage, index) => {
          const stepIndex = index + 1;
          const isReachable = stepIndex <= reachedIndex;

          return (
            <li
              className={`storycam-step ${stepIndex === activeIndex ? "is-active" : ""} ${isReachable ? "is-reachable" : "is-disabled"}`}
              key={stage}
            >
              <button
                aria-current={stepIndex === activeIndex ? "step" : undefined}
                aria-label={`转到${stage}`}
                className="storycam-step-button"
                disabled={!isReachable}
                onClick={() => onSelectStep(stepIndex)}
                type="button"
              >
                <span className="storycam-step-dot">
                  {stepIndex < activeIndex ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : stepIndex}
                </span>
                <span className="storycam-step-label">{stage}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
