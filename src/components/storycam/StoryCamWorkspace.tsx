"use client";

import { useEffect, useState } from "react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { ClipGenerationStatus } from "@/components/storycam/ClipGenerationStatus";
import { ClipReview } from "@/components/storycam/ClipReview";
import { CoreFramesStage } from "@/components/storycam/CoreFramesStage";
import { CoreStoryboardGroups } from "@/components/storycam/CoreStoryboardGroups";
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

  function handleStoryWorldCreated(nextStoryWorld: CreateStoryWorldResponse) {
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
    setStoryboardStatus("idle");
    setStoryboardMessage("故事雏形已准备好，请先确认剧本、人物和地点。");
  }

  function confirmStoryWorld() {
    setStoryWorldConfirmed(true);
    setIsStoryWorldEditorOpen(false);
    setStoryboardMessage("故事世界已确认，可以生成核心分镜。");
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
      setStoryboardStatus("idle");
      setStoryboardMessage("这个故事已删除，可以重新开始。");
      setWorkspaceNotice("这个故事已删除，可以重新开始。");
    } catch {
      setStoryboardMessage("删除失败，请稍后再试。");
    } finally {
      setIsDeletingStory(false);
    }
  }

  async function generateStoryboard() {
    if (!storyWorld || !storyWorldConfirmed || storyboardStatus === "generating") {
      return;
    }

    try {
      setStoryboardStatus("generating");
      setStoryboardMessage("正在生成核心分镜。");
      const storyboard = await createStoryboard({
        confirmedArtifactVersions: confirmedArtifactVersionsFromStoryWorld(storyWorld),
        sessionId: storyWorld.sessionId
      });

      setStoryboard(storyboard);
      setSelectedCoreGroupIndex(0);
      setExpansion(null);
      setClipConfirmationSummary(null);
      setClipJob(null);
      setFinalWork(null);
      setIsStoryWorldEditorOpen(false);
      setStoryboardStatus("ready");
      setStoryboardMessage(`分镜已准备好：${storyboard.durationPlan.coreGroupTargetCount} 个核心分镜组。`);
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
      setStoryboardMessage(`已生成 ${nextExpansion.expansionCards.length} 张扩展卡。`);
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
    setClipConfirmationSummary(
      `用「${group.title}」生成一个约 ${group.estimatedClipDurationSeconds.toFixed(1).replace(".0", "")} 秒的私人片段。`
    );
    setStoryboardMessage("请确认是否发送这一组生成片段。");
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
      setStoryboardMessage("片段生成任务已创建。");
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
      setStoryboardMessage("最终作品已生成，并保存到账号内预览。");
    } catch {
      setStoryboardMessage("最终作品生成失败，请稍后再试。");
    } finally {
      setIsFinalWorkSubmitting(false);
    }
  }

  const selectedGroup =
    storyboard && selectedCoreGroupIndex !== null ? storyboard.storyboard.coreStoryboardGroups[selectedCoreGroupIndex] : undefined;
  const activeStepIndex = currentStepIndex({ clipJob, expansion, finalWork, storyboard, storyWorld });
  const generationPanel = finalWork ? (
    <FinalWorkPanel finalWork={finalWork} />
  ) : clipJob?.status === "succeeded" && clipJob.outputArtifactId ? (
    <ClipReview
      clipArtifactId={clipJob.outputArtifactId}
      isSubmittingFinalWork={isFinalWorkSubmitting}
      onCreateFinalWork={createFinalWorkFromAcceptedClip}
      onRetake={retryClipGeneration}
    />
  ) : clipJob ? (
    <ClipGenerationStatus job={clipJob} onCancel={cancelClipJob} onRetry={retryClipGeneration} />
  ) : clipConfirmationSummary ? (
    <ProviderSendConfirm
      confirmationSummary={clipConfirmationSummary}
      isSubmitting={isClipSubmitting}
      onCancel={() => setClipConfirmationSummary(null)}
      onConfirm={confirmClipGeneration}
    />
  ) : null;
  const mainSurface = storyWorld ? (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      {storyboard && selectedGroup && !isStoryWorldEditorOpen && (expansion || isExpansionLoading) ? (
        <ExpansionCanvas
          expansion={expansion}
          generationPanel={generationPanel}
          isLoading={isExpansionLoading}
          onGenerateMore={() => expandCoreGroup(selectedCoreGroupIndex ?? 0, 8)}
          onSkipExpansion={() => prepareClipGeneration(selectedCoreGroupIndex ?? 0)}
          selectedGroup={selectedGroup}
          selectedIndex={selectedCoreGroupIndex ?? 0}
        />
      ) : storyboard && !isStoryWorldEditorOpen ? (
        <CoreFramesStage
          generationPanel={generationPanel}
          isBusy={isExpansionLoading || isClipSubmitting}
          onExpandGroup={(index) => expandCoreGroup(index)}
          onGenerateClip={prepareClipGeneration}
          onOpenStoryWorldEditor={() => setIsStoryWorldEditorOpen(true)}
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

      <StoryCamSidebar
        activeStepIndex={activeStepIndex}
        generateStoryboard={generateStoryboard}
        isDeletingStory={isDeletingStory}
        deleteCurrentStory={deleteCurrentStory}
        selectedCoreGroupIndex={selectedCoreGroupIndex}
        selectCoreGroup={selectCoreGroup}
        storyboard={storyboard}
        storyboardMessage={storyboardMessage}
        storyboardStatus={storyboardStatus}
        storyWorld={storyWorld}
        storyWorldConfirmed={storyWorldConfirmed}
        expandCoreGroup={expandCoreGroup}
      />
    </div>
  ) : (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {workspaceNotice ? (
        <p className="rounded-[1.5rem] border border-[#00f0ff]/40 bg-[#00f0ff]/10 px-5 py-4 text-sm font-bold text-[#dbfcff]" role="status">
          {workspaceNotice}
        </p>
      ) : null}
      <IdeaInputPanel onStoryWorldCreated={handleStoryWorldCreated} />
      <div className="mx-auto w-full max-w-md">
        <GoogleSignInButton />
      </div>
    </div>
  );

  return (
    <main className="storycam-page">
      <StoryCamTopBar />
      <div className="storycam-shell">
        <StoryCamProgress activeIndex={activeStepIndex} />
        {mainSurface}
      </div>
    </main>
  );
}

type StoryCamSidebarProps = {
  activeStepIndex: number;
  deleteCurrentStory: () => void;
  expandCoreGroup: (index: number) => void;
  generateStoryboard: () => void;
  isDeletingStory: boolean;
  selectedCoreGroupIndex: number | null;
  selectCoreGroup: (index: number) => void;
  storyboard: CreateStoryboardResponse | null;
  storyboardMessage: string;
  storyboardStatus: StoryboardStatus;
  storyWorld: CreateStoryWorldResponse;
  storyWorldConfirmed: boolean;
};

function StoryCamSidebar({
  activeStepIndex,
  deleteCurrentStory,
  expandCoreGroup,
  generateStoryboard,
  isDeletingStory,
  selectedCoreGroupIndex,
  selectCoreGroup,
  storyboard,
  storyboardMessage,
  storyboardStatus,
  storyWorld,
  storyWorldConfirmed
}: StoryCamSidebarProps) {
  return (
    <aside className="space-y-5">
      <GoogleSignInButton />

      <section className="storycam-panel p-5">
        <h2 className="text-lg font-extrabold text-[#e2e2e2]">当前流程</h2>
        <ol className="mt-4 space-y-2">
          {workflowStages.map((stage, index) => (
            <li className="flex items-center gap-3 text-sm text-[#b9cacb]" key={stage}>
              <span
                className={`flex size-7 items-center justify-center rounded-full border text-xs font-bold ${
                  index === activeStepIndex
                    ? "border-[#00f0ff] text-[#00f0ff] shadow-[0_0_16px_rgba(0,240,255,0.25)]"
                    : "border-[#3b494b] text-[#849495]"
                }`}
              >
                {index + 1}
              </span>
              <span>{stage}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="storycam-panel p-5">
        <h2 className="text-lg font-extrabold text-[#e2e2e2]">故事世界</h2>
        <p
          className={`mt-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${
            storyboardStatus === "stale" ? "border-[#ffcfbe]/80 text-[#ffcfbe]" : "border-[#3b494b] text-[#b9cacb]"
          }`}
          role="status"
        >
          {storyboardMessage}
        </p>
        <button
          className="storycam-primary-button mt-4 w-full disabled:border-[#353535] disabled:bg-[#353535] disabled:text-[#849495] disabled:shadow-none"
          disabled={!storyWorld || !storyWorldConfirmed || storyboardStatus === "generating" || isDeletingStory}
          onClick={generateStoryboard}
          type="button"
        >
          {storyboardStatus === "generating" ? "正在生成核心分镜" : "生成核心分镜"}
        </button>
        <button
          className="storycam-secondary-button storycam-danger-button mt-2 w-full disabled:opacity-50"
          disabled={isDeletingStory}
          onClick={deleteCurrentStory}
          type="button"
        >
          {isDeletingStory ? "正在删除" : "删除这个故事"}
        </button>
      </section>

      <section className="storycam-panel p-5">
        <h2 className="text-lg font-extrabold text-[#e2e2e2]">片段时间线</h2>
        <CoreStoryboardGroups
          isCompact
          onExpandGroup={(index) => expandCoreGroup(index)}
          onSelectGroup={selectCoreGroup}
          selectedIndex={selectedCoreGroupIndex}
          storyboard={storyboard}
        />
        <button className="mt-4 w-full rounded-full bg-[#353535] px-4 py-3 text-sm font-bold text-[#849495]" disabled type="button">
          生成最终作品
        </button>
      </section>
    </aside>
  );
}

type CurrentStepInput = {
  clipJob: GenerationJobSummary | null;
  expansion: ExpandStoryboardGroupResponse | null;
  finalWork: FinalWorkResponse | null;
  storyboard: CreateStoryboardResponse | null;
  storyWorld: CreateStoryWorldResponse | null;
};

function currentStepIndex({ clipJob, expansion, finalWork, storyboard, storyWorld }: CurrentStepInput) {
  if (finalWork) {
    return 6;
  }

  if (clipJob?.status === "succeeded") {
    return 5;
  }

  if (clipJob) {
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

function StoryCamProgress({ activeIndex }: { activeIndex: number }) {
  const activeWidth = workflowStages.length > 1 ? `${(activeIndex / (workflowStages.length - 1)) * 100}%` : "0%";

  return (
    <nav aria-label="StoryCam steps" className="storycam-stepper">
      <div className="storycam-stepper-line" />
      <div className="storycam-stepper-line-active" style={{ width: activeWidth }} />
      <ol className="storycam-stepper-items">
        {workflowStages.map((stage, index) => (
          <li className={`storycam-step ${index === activeIndex ? "is-active" : ""}`} key={stage}>
            <span className="storycam-step-dot">{index + 1}</span>
            <span>{stage}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
