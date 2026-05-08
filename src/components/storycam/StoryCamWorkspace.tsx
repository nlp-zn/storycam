"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipGenerationStatus } from "@/components/storycam/ClipGenerationStatus";
import { ClipReview } from "@/components/storycam/ClipReview";
import { CoreFramesStage } from "@/components/storycam/CoreFramesStage";
import { ExpansionCanvas } from "@/components/storycam/ExpansionCanvas";
import { FinalWorkPanel } from "@/components/storycam/FinalWorkPanel";
import { IdeaInputPanel } from "@/components/storycam/IdeaInputPanel";
import { ProviderSendConfirm } from "@/components/storycam/ProviderSendConfirm";
import { StoryWorldReview } from "@/components/storycam/StoryWorldReview";
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
  createStoryboard,
  deleteStoryCamSession,
  expandStoryboardGroup,
  generateClipJob,
  getGenerationJob,
  regenerateStoryboardFrameImage,
  restoreCurrentStoryCamSession,
  restoreStoryCamSession,
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
  "/storycam/clip-generation",
  "/storycam/clip-review",
  "/storycam/export"
] as const;

type StoryWorldAssetImage = NonNullable<GenerateStoryWorldAssetImageResponse["media"]>;
const requiredExpandedFrameCount = 8;

export function StoryCamWorkspace() {
  const [storyWorld, setStoryWorld] = useState<CreateStoryWorldResponse | null>(null);
  const [storyWorldConfirmed, setStoryWorldConfirmed] = useState(false);
  const [storyboard, setStoryboard] = useState<CreateStoryboardResponse | null>(null);
  const [selectedCoreGroupIndex, setSelectedCoreGroupIndex] = useState<number | null>(null);
  const [expansionModalIndex, setExpansionModalIndex] = useState<number | null>(null);
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
  const [coreGroupTargetCount, setCoreGroupTargetCount] = useState<1 | 2 | 3>(1);
  const imagePollAttemptsRef = useRef<Record<string, number>>({});
  const videoPollAttemptsRef = useRef<Record<string, number>>({});
  const mediaRefreshInFlightRef = useRef(false);

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
    setExpansionModalIndex(null);
    setClipConfirmationSummary(null);
    setClipJob(restored.clipJob ?? null);
    setFinalWork(restored.finalWork ?? null);
    setIsStoryWorldEditorOpen(false);
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
          ? refreshExpansionMediaFromStoryboard(current, restored.storyboard, expansionModalIndex ?? selectedCoreGroupIndex ?? 0)
          : current
      );
      setClipJob((current) => (current && restored.clipJob ? restored.clipJob : current));
      setFinalWork((current) => (current && restored.finalWork ? restored.finalWork : current));
    } catch {
      setWorkspaceNotice("图片预览链接刷新失败，可以稍后刷新页面重试。");
    } finally {
      mediaRefreshInFlightRef.current = false;
    }
  }, [expansion, expansionModalIndex, selectedCoreGroupIndex, storyboard, storyWorld?.sessionId]);

  useEffect(() => {
    if (window.location.pathname === "/" || window.location.pathname === "/storycam") {
      window.history.replaceState(null, "", stepPaths[0]);
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
  }, [clipJob?.id, clipJob?.outputArtifactId, clipJob?.outputPreview, clipJob?.status]);

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

  function handleStoryWorldCreated(nextStoryWorld: CreateStoryWorldResponse, draft: { idea: string; selectedChoices: string[] }) {
    setInputDraft(draft);
    setWorkspaceNotice(null);
    setStoryWorld(nextStoryWorld);
    setStoryWorldConfirmed(false);
    setStoryboard(null);
    setSelectedCoreGroupIndex(null);
    setExpansionModalIndex(null);
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
    setExpansionModalIndex(null);
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
      setExpansionModalIndex(null);
      setExpansion(null);
      setClipConfirmationSummary(null);
      setClipJob(null);
      setFinalWork(null);
      setIsStoryWorldEditorOpen(false);
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
      setExpansionModalIndex(index);
      setClipConfirmationSummary(null);
      setStoryboardMessage(`需要先补齐 8 张扩展分镜图。当前已完成 ${readyCount} / 8。`);

      if (!isExpansionLoading) {
        void expandCoreGroup(index, requiredExpandedFrameCount);
      }

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
      setExpansionModalIndex(selectedCoreGroupIndex);
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
      return;
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
      syncStepPath(5);
    } catch {
      setStoryboardMessage("最终作品生成失败，请稍后再试。");
    } finally {
      setIsFinalWorkSubmitting(false);
    }
  }

  const selectedGroup =
    storyboard && selectedCoreGroupIndex !== null ? storyboard.storyboard.coreStoryboardGroups[selectedCoreGroupIndex] : undefined;
  const expansionModalGroup =
    storyboard && expansionModalIndex !== null ? storyboard.storyboard.coreStoryboardGroups[expansionModalIndex] : undefined;
  const reachedStepIndex = currentStepIndex({ clipConfirmationSummary, clipJob, expansion, finalWork, storyboard, storyWorld });
  const activeStepIndex = selectedStepIndex !== null && selectedStepIndex <= reachedStepIndex ? selectedStepIndex : reachedStepIndex;

  useEffect(() => {
    function handlePopState() {
      const stepIndex = stepIndexFromPath(window.location.pathname);

      setSelectedStepIndex(stepIndex !== null && stepIndex <= reachedStepIndex ? stepIndex : null);
    }

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [reachedStepIndex]);
  const generationPanel = activeStepIndex >= 4 && clipJob?.status === "succeeded" && clipJob.outputArtifactId ? (
    <ClipReview
      clipArtifactId={clipJob.outputArtifactId}
      durationSeconds={clipJob.outputPreview?.durationSeconds ?? selectedGroup?.estimatedClipDurationSeconds ?? 15}
      isSubmittingFinalWork={isFinalWorkSubmitting}
      onCreateFinalWork={createFinalWorkFromAcceptedClip}
      onRetake={retryClipGeneration}
      preview={clipJob.outputPreview}
      title={selectedGroup?.title}
    />
  ) : activeStepIndex >= 3 && clipJob ? (
    <ClipGenerationStatus
      isDeletingStory={isDeletingStory}
      job={clipJob}
      onCancel={cancelClipJob}
      onDeleteStory={deleteCurrentStory}
      onRetry={retryClipGeneration}
    />
  ) : activeStepIndex >= 3 && clipConfirmationSummary ? (
    <ProviderSendConfirm
      confirmationSummary={clipConfirmationSummary}
      isSubmitting={isClipSubmitting}
      onCancel={() => setClipConfirmationSummary(null)}
      onConfirm={confirmClipGeneration}
    />
  ) : null;
  function navigateToStep(index: number) {
    if (index > reachedStepIndex) {
      return;
    }

    setSelectedStepIndex(index);
    syncStepPath(index);

    if (index !== 1) {
      setIsStoryWorldEditorOpen(false);
    }
  }

  function goHome() {
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
        onStoryWorldCreated={handleStoryWorldCreated}
      />
    </div>
  ) : storyWorld ? (
    <div>
      {activeStepIndex >= 5 && finalWork ? (
        <FinalWorkPanel finalWork={finalWork} />
      ) : generationPanel ? (
        generationPanel
      ) : activeStepIndex >= 2 && storyboard && !isStoryWorldEditorOpen ? (
        <>
          <CoreFramesStage
            generationPanel={generationPanel}
            isBusy={isExpansionLoading || isClipSubmitting}
            onExpandGroup={(index) => {
              setSelectedCoreGroupIndex(index);
              setExpansionModalIndex(index);
            }}
            onGenerateClip={prepareClipGeneration}
            onMediaLoadError={refreshSessionMediaUrls}
            onSelectGroup={selectCoreGroup}
            selectedIndex={selectedCoreGroupIndex ?? 0}
            storyboard={storyboard}
          />
          {expansionModalIndex !== null && expansionModalGroup ? (
            <ExpansionCanvas
              expansion={expansion}
              isLoading={isExpansionLoading}
              isRegeneratingFrame={(frameNumber) => regeneratingFrameKey === `${expansionModalIndex}:${frameNumber}`}
              onClose={() => setExpansionModalIndex(null)}
              onConfirmExpansion={() => expandCoreGroup(expansionModalIndex, 8)}
              onGenerateClip={() => prepareClipGeneration(expansionModalIndex)}
              onMediaLoadError={refreshSessionMediaUrls}
              onRegenerateFrame={(frameNumber) => regenerateFrameImage(expansionModalIndex, frameNumber)}
              selectedGroup={expansionModalGroup}
              selectedIndex={expansionModalIndex}
              selectedScript={storyboard.storyboard.storyboardScripts?.[expansionModalIndex] ?? storyboard.storyboard.storyboardScript}
            />
          ) : null}
        </>
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
        onStoryWorldCreated={handleStoryWorldCreated}
      />
    </div>
  );
  const isInputStep = activeStepIndex === 0;

  return (
    <main className="storycam-page">
      <StoryCamTopBar onHome={goHome} />
      <div className={`storycam-shell ${isInputStep ? "storycam-shell--centered" : ""}`}>
        {isInputStep ? null : (
          <StoryCamProgress activeIndex={activeStepIndex} onSelectStep={navigateToStep} reachedIndex={reachedStepIndex} />
        )}
        <div className="storycam-workspace-surface">{mainSurface}</div>
      </div>
    </main>
  );
}

type CurrentStepInput = {
  clipConfirmationSummary: string | null;
  clipJob: GenerationJobSummary | null;
  expansion: ExpandStoryboardGroupResponse | null;
  finalWork: FinalWorkResponse | null;
  storyboard: CreateStoryboardResponse | null;
  storyWorld: CreateStoryWorldResponse | null;
};

function currentStepIndex({ clipConfirmationSummary, clipJob, expansion, finalWork, storyboard, storyWorld }: CurrentStepInput) {
  if (finalWork) {
    return 5;
  }

  if (clipJob?.status === "succeeded") {
    return 4;
  }

  if (clipJob) {
    return 3;
  }

  if (clipConfirmationSummary) {
    return 3;
  }

  if (storyboard) {
    return 2;
  }

  if (storyWorld) {
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

  return index >= 0 ? index : null;
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
      return 4;
    case "export":
      return 5;
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

function StoryCamTopBar({ onHome }: { onHome: () => void }) {
  return (
    <header className="storycam-topbar">
      <button aria-label="返回首页" className="storycam-brand" onClick={onHome} type="button">
        StoryCam 导演工作台
      </button>
      <div className="storycam-topbar-actions">
        <span className="storycam-topbar-status">
          <span aria-hidden="true">●</span>
          <span>在线</span>
        </span>
        <span className="storycam-topbar-status">
          <span aria-hidden="true">N</span>
          <span>账号</span>
        </span>
      </div>
    </header>
  );
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
                <span className="storycam-step-dot">{stepIndex}</span>
                <span className="storycam-step-label">{stage}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
