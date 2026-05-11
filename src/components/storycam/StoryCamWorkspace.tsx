"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipGenerationWorkspace } from "@/components/storycam/ClipGenerationWorkspace";
import { CoreFramesStage } from "@/components/storycam/CoreFramesStage";
import { IdeaInputPanel } from "@/components/storycam/IdeaInputPanel";
import type { StoryWorldDraft } from "@/components/storycam/IdeaInputPanel";
import { StoryWorldReview } from "@/components/storycam/StoryWorldReview";
import { createClient } from "@/lib/supabase/client";
import {
  confirmedArtifactVersionsForClip,
  confirmedArtifactVersionsFromStoryWorld,
  staleStoryboardAfterStoryWorldEdit,
  type StoryboardStatus
} from "@/features/storycam/client/storycamState";
import {
  cancelGenerationJob,
  createFinalWork,
  createStitchSuggestion,
  createStoryWorld,
  createStoryboard,
  deleteStoryCamSession,
  expandStoryboardGroup,
  generateClipJob,
  getGenerationJob,
  regenerateStoryboardFrameImage,
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
const requiredExpandedFrameCount = 8;

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
  const [inputDraft, setInputDraft] = useState({ idea: "我想把暗恋拍成韩剧雨夜", selectedChoices: ["像私人回忆"] });
  const [storyWorldGeneration, setStoryWorldGeneration] = useState<StoryWorldGenerationState>({ kind: "idle" });
  const [coreGroupTargetCount, setCoreGroupTargetCount] = useState<1 | 2 | 3>(1);
  const imagePollAttemptsRef = useRef<Record<string, number>>({});
  const videoPollAttemptsRef = useRef<Record<string, number>>({});
  const mediaRefreshInFlightRef = useRef(false);
  const storyWorldRequestIdRef = useRef(0);

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

  function hydrateRestoredProject(restored: Exclude<Awaited<ReturnType<typeof restoreCurrentStoryCamSession>>, { restored: false }>) {
    setStoryWorld(restored.storyWorld);
    setStoryWorldConfirmed(restored.storyWorldConfirmed);
    setStoryboard(restored.storyboard);
    setCoreGroupTargetCount(1);
    setSelectedCoreGroupIndex(restored.storyboard ? 0 : null);
    setExpansion(null);
    setClipConfirmationSummary(null);
    setClipJob(restored.clipJob ?? null);
    setFinalWork(restored.finalWork ?? null);
    setIsStoryWorldEditorOpen(false);
    setStoryWorldGeneration({ kind: "idle" });
    setSelectedStepIndex(null);
    setWorkspaceNotice(null);
    setStoryboardStatus(restored.storyboard ? "ready" : "idle");
    setStoryboardMessage(
      restored.storyboard
        ? "已恢复核心分镜：1 个 15 秒内核心分镜组。"
        : "已恢复上次生成的故事世界，请确认后继续。"
    );
    syncStepPath(stepIndexForRestoredCurrentStep(restored.currentStep));
  }

  const refreshSessionMediaUrls = useCallback(async () => {
    const sessionId = storyWorld?.sessionId;

    if (!sessionId || mediaRefreshInFlightRef.current || collectStoryboardImageJobIds(storyboard, expansion).length > 0) {
      return;
    }

    mediaRefreshInFlightRef.current = true;

    try {
      const restored = await restoreStoryCamSession(sessionId);

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
      setStoryboard((current) => (current?.sessionId === sessionId && restored.storyboard ? restored.storyboard : current));
      setExpansion((current) =>
        current && restored.storyboard
          ? refreshExpansionMediaFromStoryboard(current, restored.storyboard, selectedCoreGroupIndex ?? 0)
          : current
      );
      setClipJob((current) => (current && restored.clipJob ? restored.clipJob : current));
      setFinalWork((current) => (current && restored.finalWork ? restored.finalWork : current));
    } catch {
      setWorkspaceNotice("图片预览链接刷新失败，可以稍后刷新页面重试。");
    } finally {
      mediaRefreshInFlightRef.current = false;
    }
  }, [expansion, selectedCoreGroupIndex, storyboard, storyWorld?.sessionId]);

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

    const initialRefresh = window.setTimeout(() => {
      void refreshSessionMediaUrls();
    }, 0);
    const interval = window.setInterval(() => {
      void refreshSessionMediaUrls();
    }, 4 * 60 * 1000);

    return () => {
      window.clearTimeout(initialRefresh);
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
        const restored = await restoreCurrentStoryCamSession();

        if (isCanceled) {
          return;
        }

        if (!restored.restored) {
          return;
        }

        hydrateRestoredProject(restored);
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

  function applyStoryWorldCreated(nextStoryWorld: CreateStoryWorldResponse, draft: { idea: string; selectedChoices: string[] }) {
    setInputDraft(draft);
    setWorkspaceNotice(null);
    setStoryWorld(nextStoryWorld);
    setStoryWorldGeneration({ kind: "idle" });
    setStoryWorldConfirmed(false);
    setStoryboard(null);
    setSelectedCoreGroupIndex(null);
    setExpansion(null);
    setClipConfirmationSummary(null);
    setClipJob(null);
    setFinalWork(null);
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
    setWorkspaceNotice(null);
    setStoryWorld(null);
    setStoryWorldConfirmed(false);
    setStoryboard(null);
    setSelectedCoreGroupIndex(null);
    setExpansion(null);
    setClipConfirmationSummary(null);
    setClipJob(null);
    setFinalWork(null);
    setIsStoryWorldEditorOpen(false);
    setSelectedStepIndex(null);
    setStoryboardStatus("idle");
    setStoryboardMessage("正在生成故事雏形。");
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
        uploadedPhotoIds: requestWithUploads.uploadedPhotoIds
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
    if (!storyWorld || storyboardStatus === "generating") {
      return;
    }

    setStoryWorldConfirmed(true);
    setIsStoryWorldEditorOpen(false);
    setCoreGroupTargetCount(1);
    await generateStoryboardFromStoryWorld(storyWorld, 1);
  }

  function handleStoryWorldEdit() {
    setStoryWorldConfirmed(false);
    setStoryboard(null);
    setSelectedCoreGroupIndex(null);
    setExpansion(null);
    setClipConfirmationSummary(null);
    setClipJob(null);
    setFinalWork(null);
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

      if (runningClipJob?.status === "queued" || runningClipJob?.status === "running") {
        await cancelGenerationJob(runningClipJob.id).catch(() => undefined);
      }

      await deleteStoryCamSession(sessionId);
      setStoryWorld(null);
      setStoryWorldConfirmed(false);
      setStoryboard(null);
      setSelectedCoreGroupIndex(null);
      setExpansion(null);
      setClipConfirmationSummary(null);
      setClipJob(null);
      setFinalWork(null);
      setIsStoryWorldEditorOpen(false);
      setStoryWorldGeneration({ kind: "idle" });
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

  async function generateStoryboardFromStoryWorld(
    currentStoryWorld: CreateStoryWorldResponse,
    _nextCoreGroupTargetCount: 1 | 2 | 3
  ) {
    if (storyboardStatus === "generating") {
      return;
    }

    try {
      setStoryboardStatus("generating");
      setStoryboardMessage("正在生成核心分镜。");
      const storyboard = await createStoryboard({
        confirmedArtifactVersions: confirmedArtifactVersionsFromStoryWorld(currentStoryWorld),
        coreGroupTargetCount: 1,
        sessionId: currentStoryWorld.sessionId
      });

      setStoryboard(storyboard);
      setSelectedCoreGroupIndex(0);
      setExpansion(null);
      setClipConfirmationSummary(null);
      setClipJob(null);
      setFinalWork(null);
      setIsStoryWorldEditorOpen(false);
      setSelectedStepIndex(null);
      setStoryboardStatus("ready");
      setStoryboardMessage(
        `分镜已准备好：1 个核心分镜组，控制在 ${storyboard.durationPlan.plannedDurationSeconds} 秒内。`
      );
      syncStepPath(2);
    } catch {
      setStoryboardStatus("error");
      setStoryboardMessage("核心分镜生成失败，请重新确认后再试。");
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
  }

  function prepareClipGeneration(index = selectedCoreGroupIndex ?? 0) {
    const group = storyboard?.storyboard.coreStoryboardGroups[index];

    if (!group) {
      return;
    }

    setSelectedCoreGroupIndex(index);
    setClipJob(null);
    setFinalWork(null);
    setSelectedStepIndex(null);

    const readyCount = readyExpandedFrameCount(group);

    if (readyCount < requiredExpandedFrameCount) {
      setClipConfirmationSummary(null);
      setStoryboardMessage(`需要先补齐 8 张扩展分镜图。当前已完成 ${readyCount} / 8。`);
      return;
    }

    setClipConfirmationSummary(
      `用「${group.title}」生成一个约 ${group.estimatedClipDurationSeconds.toFixed(1).replace(".0", "")} 秒的私人片段。`
    );
    setStoryboardMessage("请确认是否发送这一组生成片段。");
    syncStepPath(3);
  }

  async function confirmClipGeneration() {
    if (!storyboard || selectedCoreGroupIndex === null) {
      return;
    }

    const coreArtifact = storyboard.artifacts.coreStoryboardGroups[selectedCoreGroupIndex];
    const selectedGroup = storyboard.storyboard.coreStoryboardGroups[selectedCoreGroupIndex];

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
        confirmedArtifactVersions: confirmedArtifactVersionsForClip(storyboard, selectedCoreGroupIndex, expansion),
        coreStoryboardGroupId: coreArtifact.id,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${coreArtifact.id}-${Date.now()}`,
        sessionId: storyboard.sessionId
      });

      setClipConfirmationSummary(response.confirmationSummary);
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
      setSelectedStepIndex(null);
      setStoryboardMessage("片段生成任务已创建。");
      syncStepPath(3);
    } catch {
      setStoryboardMessage("片段生成任务创建失败，请重试。");
    } finally {
      setIsClipSubmitting(false);
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
    setClipJob(null);
    setFinalWork(null);
    void confirmClipGeneration();
  }

  async function createFinalWorkFromAcceptedClip() {
    if (!clipJob?.outputArtifactId || !storyboard) {
      return null;
    }

    try {
      setIsFinalWorkSubmitting(true);
      const suggestion = await createStitchSuggestion({
        generatedClipArtifactIds: [clipJob.outputArtifactId],
        sessionId: storyboard.sessionId
      });
      const nextFinalWork = await createFinalWork({
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${clipJob.outputArtifactId}-${Date.now()}`,
        sessionId: storyboard.sessionId,
        stitchSuggestionArtifactId: suggestion.stitchSuggestion.id
      });

      setFinalWork(nextFinalWork);
      setSelectedStepIndex(null);
      setStoryboardMessage("最终作品已生成，并保存到账号内预览。");
      syncStepPath(3);
      return nextFinalWork;
    } catch {
      setStoryboardMessage("最终作品生成失败，请稍后再试。");
      return null;
    } finally {
      setIsFinalWorkSubmitting(false);
    }
  }

  const selectedGroup =
    storyboard && selectedCoreGroupIndex !== null ? storyboard.storyboard.coreStoryboardGroups[selectedCoreGroupIndex] : undefined;
  const reachedStepIndex = currentStepIndex({
    clipConfirmationSummary,
    clipJob,
    finalWork,
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

      setSelectedStepIndex(stepIndex !== null && stepIndex <= reachedStepIndex ? stepIndex : null);
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [reachedStepIndex, storyWorld, storyWorldGeneration.kind]);
  const clipGenerationPanel =
    activeStepIndex >= 3 && (clipConfirmationSummary || clipJob || finalWork) ? (
      <ClipGenerationWorkspace
        clipConfirmationSummary={clipConfirmationSummary}
        clipJob={clipJob}
        durationSeconds={clipJob?.outputPreview?.durationSeconds ?? finalWork?.preview?.durationSeconds ?? selectedGroup?.estimatedClipDurationSeconds ?? 15}
        finalWork={finalWork}
        isClipSubmitting={isClipSubmitting}
        isDeletingStory={isDeletingStory}
        isFinalWorkSubmitting={isFinalWorkSubmitting}
        onBackToCoreStoryboard={() => navigateToStep(2)}
        onCancelClip={cancelClipJob}
        onCancelProviderSend={() => setClipConfirmationSummary(null)}
        onConfirmProviderSend={confirmClipGeneration}
        onCreateFinalWork={createFinalWorkFromAcceptedClip}
        onDeleteStory={deleteCurrentStory}
        onRetake={retryClipGeneration}
        posterImageUrl={selectedGroup?.representativeImage.status === "ready" ? selectedGroup.representativeImage.signedUrl : undefined}
        title={selectedGroup?.title}
      />
    ) : null;
  function navigateToStep(index: number) {
    if (index > reachedStepIndex) {
      return;
    }

    if (index === 0 && !storyWorld) {
      abandonStoryWorldGeneration();
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
      ) : activeStepIndex >= 2 && storyboard && !isStoryWorldEditorOpen ? (
        <CoreFramesStage
          expansion={expansion}
          isBusy={isExpansionLoading || isClipSubmitting}
          isExpansionLoading={isExpansionLoading}
          isRegeneratingFrame={(frameNumber) => regeneratingFrameKey === `${selectedCoreGroupIndex ?? 0}:${frameNumber}`}
          onBackToStoryWorld={() => navigateToStep(1)}
          onConfirmExpansion={(index) => expandCoreGroup(index, 8)}
          onGenerateClip={prepareClipGeneration}
          onMediaLoadError={refreshSessionMediaUrls}
          onRegenerateFrame={regenerateFrameImage}
          onSelectGroup={selectCoreGroup}
          selectedIndex={selectedCoreGroupIndex ?? 0}
          storyboard={storyboard}
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
          onMediaLoadError={refreshSessionMediaUrls}
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
      <StoryWorldPendingHero isPending={isPending} />

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

function StoryWorldPendingHero({ isPending }: { isPending: boolean }) {
  return (
    <div className="storycam-story-world-hero">
      <div className="storycam-section-kicker">
        <span />
        <p>第二部：故事世界</p>
        <span />
      </div>
      <h1 className="storycam-heading-lg">确认故事世界</h1>
      <p>审查剧本、人物与场景资产，确认后进入核心分镜。</p>
      <span className="rounded-full border border-[#ffcfbe]/80 px-4 py-2 text-sm font-bold text-[#ffcfbe]">
        {isPending ? "生成中" : "需要重试"}
      </span>
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
        <button className="storycam-secondary-button px-4 py-2 text-xs" disabled type="button">
          改剧本
        </button>
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
          <span aria-hidden="true">i</span>
          资产图会在剧本生成后出现。
        </p>
        <button className="storycam-secondary-button px-4 py-2 text-xs" disabled type="button">
          等待剧本生成
        </button>
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
    <div className="storycam-bottom-dock">
      <div className="rounded-full border border-white/10 bg-black/40 px-5 py-3 text-sm font-black text-[#dbfcff]">
        1 组 · 约 15 秒内
      </div>
      {isPending ? (
        <button className="storycam-primary-button" disabled type="button">
          剧本生成中
        </button>
      ) : (
        <div className="flex flex-wrap justify-end gap-3">
          <button className="storycam-secondary-button" onClick={onBackToInput} type="button">
            返回修改
          </button>
          <button className="storycam-primary-button" onClick={onRetry} type="button">
            重试生成
          </button>
        </div>
      )}
    </div>
  );
}

type CurrentStepInput = {
  clipConfirmationSummary: string | null;
  clipJob: GenerationJobSummary | null;
  finalWork: FinalWorkResponse | null;
  storyboard: CreateStoryboardResponse | null;
  storyWorld: CreateStoryWorldResponse | null;
  storyWorldGeneration: StoryWorldGenerationState;
};

function currentStepIndex({
  clipConfirmationSummary,
  clipJob,
  finalWork,
  storyboard,
  storyWorld,
  storyWorldGeneration
}: CurrentStepInput) {
  if (finalWork || clipJob || clipConfirmationSummary) {
    return 3;
  }

  if (storyboard) {
    return 2;
  }

  if (storyWorld || storyWorldGeneration.kind !== "idle") {
    return 1;
  }

  return 0;
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
  const activeSize =
    progressStages.length > 1 ? `${(progressReachedIndex / (progressStages.length - 1)) * 100}%` : "0%";
  const activeStyle = {
    "--storycam-progress": activeSize,
    width: activeSize
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
                <span className="storycam-step-dot">{stepIndex < activeIndex ? "✓" : stepIndex}</span>
                <span className="storycam-step-label">{stage}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
