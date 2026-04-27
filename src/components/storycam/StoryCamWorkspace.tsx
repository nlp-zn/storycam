"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
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
  type CreateStoryboardResponse,
  type CreateStoryWorldResponse,
  type FinalWorkResponse,
  type GenerationJobSummary,
  type ExpandStoryboardGroupResponse
} from "@/features/storycam/client/storycamApi";
import { shouldPollGenerationJob } from "@/features/storycam/client/jobPolling";
import { workflowStages } from "@/features/storycam/domain/shellContent";

const stepPaths = [
  "/storycam/input",
  "/storycam/story-world",
  "/storycam/core-storyboard",
  "/storycam/expansion",
  "/storycam/clip-generation",
  "/storycam/clip-review",
  "/storycam/export"
] as const;

export function StoryCamWorkspace() {
  const [storyWorld, setStoryWorld] = useState<CreateStoryWorldResponse | null>(null);
  const [storyWorldConfirmed, setStoryWorldConfirmed] = useState(false);
  const [storyboard, setStoryboard] = useState<CreateStoryboardResponse | null>(null);
  const [selectedCoreGroupIndex, setSelectedCoreGroupIndex] = useState<number | null>(null);
  const [expansion, setExpansion] = useState<ExpandStoryboardGroupResponse | null>(null);
  const [isExpansionLoading, setIsExpansionLoading] = useState(false);
  const [clipConfirmationSummary, setClipConfirmationSummary] = useState<string | null>(null);
  const [clipJob, setClipJob] = useState<GenerationJobSummary | null>(null);
  const [isClipSubmitting, setIsClipSubmitting] = useState(false);
  const [finalWork, setFinalWork] = useState<FinalWorkResponse | null>(null);
  const [isFinalWorkSubmitting, setIsFinalWorkSubmitting] = useState(false);
  const [isDeletingStory, setIsDeletingStory] = useState(false);
  const [isStoryWorldEditorOpen, setIsStoryWorldEditorOpen] = useState(false);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [storyboardStatus, setStoryboardStatus] = useState<StoryboardStatus>("idle");
  const [storyboardMessage, setStoryboardMessage] = useState("确认故事世界后才能生成核心分镜。");
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(() =>
    typeof window === "undefined" ? null : stepIndexFromPath(window.location.pathname)
  );
  const [inputDraft, setInputDraft] = useState({ idea: "我想把暗恋拍成韩剧雨夜", selectedChoices: ["像私人回忆"] });

  useEffect(() => {
    if (window.location.pathname === "/" || window.location.pathname === "/storycam") {
      window.history.replaceState(null, "", stepPaths[0]);
    }
  }, []);

  useEffect(() => {
    if (!clipJob || !shouldPollGenerationJob(clipJob.status)) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await getGenerationJob(clipJob.id);
        setClipJob((current) => (current?.id === clipJob.id ? response.job : current));
      } catch {
        setClipJob((current) =>
          current?.id === clipJob.id ? { ...current, redactedError: "状态更新失败。", status: "failed" } : current
        );
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [clipJob]);

  function handleStoryWorldCreated(nextStoryWorld: CreateStoryWorldResponse, draft: { idea: string; selectedChoices: string[] }) {
    setInputDraft(draft);
    setWorkspaceNotice(null);
    setStoryWorld(nextStoryWorld);
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

  async function confirmStoryWorld() {
    if (!storyWorld || storyboardStatus === "generating") {
      return;
    }

    setStoryWorldConfirmed(true);
    setIsStoryWorldEditorOpen(false);
    await generateStoryboardFromStoryWorld(storyWorld);
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

  async function generateStoryboardFromStoryWorld(currentStoryWorld: CreateStoryWorldResponse) {
    if (storyboardStatus === "generating") {
      return;
    }

    try {
      setStoryboardStatus("generating");
      setStoryboardMessage("正在生成核心分镜。");
      const storyboard = await createStoryboard({
        confirmedArtifactVersions: confirmedArtifactVersionsFromStoryWorld(currentStoryWorld),
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
      setStoryboardMessage(`分镜已准备好：${storyboard.durationPlan.coreGroupTargetCount} 个核心分镜组。`);
      syncStepPath(2);
    } catch {
      setStoryboardStatus("error");
      setStoryboardMessage("核心分镜生成失败，请重新确认后再试。");
    }
  }

  async function expandCoreGroup(index: number, targetCount = 3) {
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
      setClipConfirmationSummary(null);
      setClipJob(null);
      setFinalWork(null);
      setSelectedStepIndex(null);
      setStoryboardMessage(`已生成 ${nextExpansion.expansionCards.length} 张扩展卡。`);
      syncStepPath(3);
    } catch {
      setStoryboardMessage("扩展卡生成失败，可以跳过扩展直接生成片段。");
    } finally {
      setIsExpansionLoading(false);
    }
  }

  function selectCoreGroup(index: number) {
    if (clipJob || finalWork || isClipSubmitting) {
      return;
    }

    setSelectedCoreGroupIndex(index);
    setExpansion(null);
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
    setClipConfirmationSummary(
      `用「${group.title}」生成一个约 ${group.estimatedClipDurationSeconds.toFixed(1).replace(".0", "")} 秒的私人片段。`
    );
    setStoryboardMessage("请确认是否发送这一组生成片段。");
    syncStepPath(4);
  }

  async function confirmClipGeneration() {
    if (!storyboard || selectedCoreGroupIndex === null) {
      return;
    }

    const coreArtifact = storyboard.artifacts.coreStoryboardGroups[selectedCoreGroupIndex];

    if (!coreArtifact) {
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
        providerKind: "video",
        providerName: "mock",
        sessionId: storyboard.sessionId,
        status: response.status,
        type: "video_clip"
      });
      setSelectedStepIndex(null);
      setStoryboardMessage("片段生成任务已创建。");
      syncStepPath(4);
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
      syncStepPath(6);
    } catch {
      setStoryboardMessage("最终作品生成失败，请稍后再试。");
    } finally {
      setIsFinalWorkSubmitting(false);
    }
  }

  const selectedGroup =
    storyboard && selectedCoreGroupIndex !== null ? storyboard.storyboard.coreStoryboardGroups[selectedCoreGroupIndex] : undefined;
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
  const generationPanel = activeStepIndex >= 5 && clipJob?.status === "succeeded" && clipJob.outputArtifactId ? (
    <ClipReview
      clipArtifactId={clipJob.outputArtifactId}
      isSubmittingFinalWork={isFinalWorkSubmitting}
      onCreateFinalWork={createFinalWorkFromAcceptedClip}
      onRetake={retryClipGeneration}
    />
  ) : activeStepIndex >= 4 && clipJob ? (
    <ClipGenerationStatus
      isDeletingStory={isDeletingStory}
      job={clipJob}
      onCancel={cancelClipJob}
      onDeleteStory={deleteCurrentStory}
      onRetry={retryClipGeneration}
    />
  ) : activeStepIndex >= 4 && clipConfirmationSummary ? (
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

  const mainSurface = storyWorld && activeStepIndex === 0 ? (
    <div className="flex w-full flex-col gap-6">
      <IdeaInputPanel
        initialChoices={inputDraft.selectedChoices}
        initialIdea={inputDraft.idea}
        onStoryWorldCreated={handleStoryWorldCreated}
      />
    </div>
  ) : storyWorld ? (
    <div>
      {activeStepIndex >= 6 && finalWork ? (
        <FinalWorkPanel finalWork={finalWork} />
      ) : generationPanel ? (
        generationPanel
      ) : activeStepIndex >= 3 && storyboard && selectedGroup && !isStoryWorldEditorOpen && (expansion || isExpansionLoading) ? (
        <ExpansionCanvas
          expansion={expansion}
          isLoading={isExpansionLoading}
          onGenerateMore={() => expandCoreGroup(selectedCoreGroupIndex ?? 0, 8)}
          onSkipExpansion={() => prepareClipGeneration(selectedCoreGroupIndex ?? 0)}
          selectedGroup={selectedGroup}
          selectedIndex={selectedCoreGroupIndex ?? 0}
        />
      ) : activeStepIndex >= 2 && storyboard && !isStoryWorldEditorOpen ? (
        <CoreFramesStage
          generationPanel={generationPanel}
          isBusy={isExpansionLoading || isClipSubmitting}
          onExpandGroup={(index) => expandCoreGroup(index)}
          onGenerateClip={prepareClipGeneration}
          onSelectGroup={selectCoreGroup}
          selectedIndex={selectedCoreGroupIndex ?? 0}
          storyboard={storyboard}
        />
      ) : (
        <StoryWorldReview
          initiallyEditing={isStoryWorldEditorOpen}
          isDeleting={isDeletingStory}
          isConfirmed={storyWorldConfirmed}
          key={storyWorld.artifacts.script.id}
          onConfirm={confirmStoryWorld}
          onDeleteStory={deleteCurrentStory}
          onEditSaved={handleStoryWorldEdit}
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
        onStoryWorldCreated={handleStoryWorldCreated}
      />
    </div>
  );
  const isInputStep = activeStepIndex === 0;

  return (
    <main className="storycam-page">
      <StoryCamTopBar />
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
    return 6;
  }

  if (clipJob?.status === "succeeded") {
    return 5;
  }

  if (clipJob) {
    return 4;
  }

  if (clipConfirmationSummary) {
    return 4;
  }

  if (expansion) {
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

function StoryCamTopBar() {
  return (
    <header className="storycam-topbar">
      <div className="storycam-brand">StoryCam 导演工作台</div>
      <div className="flex items-center gap-4 text-[#00f0ff]">
        <span className="flex size-10 items-center justify-center rounded-full border border-[#3b494b] bg-[#1f1f1f]">●</span>
        <span className="flex size-10 items-center justify-center rounded-full border border-[#3b494b] bg-[#1f1f1f]">人</span>
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
  const activeHeight = workflowStages.length > 1 ? `${(reachedIndex / (workflowStages.length - 1)) * 100}%` : "0%";
  const activeStyle = {
    "--storycam-mobile-progress": activeHeight,
    height: activeHeight
  } as CSSProperties;

  return (
    <nav aria-label="StoryCam steps" className="storycam-stepper">
      <div className="storycam-stepper-line" />
      <div className="storycam-stepper-line-active" style={activeStyle} />
      <ol className="storycam-stepper-items">
        {workflowStages.map((stage, index) => {
          const isReachable = index <= reachedIndex;

          return (
            <li
              className={`storycam-step ${index === activeIndex ? "is-active" : ""} ${isReachable ? "is-reachable" : "is-disabled"}`}
              key={stage}
            >
              <button
                aria-current={index === activeIndex ? "step" : undefined}
                aria-label={`转到${stage}`}
                className="storycam-step-button"
                disabled={!isReachable}
                onClick={() => onSelectStep(index)}
                type="button"
              >
                <span className="storycam-step-dot">{index + 1}</span>
                <span>{stage}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
