"use client";

import { useEffect, useState } from "react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { ClipGenerationStatus } from "@/components/storycam/ClipGenerationStatus";
import { CoreStoryboardGroups } from "@/components/storycam/CoreStoryboardGroups";
import { ExpansionCanvas } from "@/components/storycam/ExpansionCanvas";
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
  createStoryboard,
  expandStoryboardGroup,
  generateClipJob,
  getGenerationJob,
  type CreateStoryboardResponse,
  type CreateStoryWorldResponse,
  type GenerationJobSummary,
  type ExpandStoryboardGroupResponse
} from "@/features/storycam/client/storycamApi";
import { shouldPollGenerationJob } from "@/features/storycam/client/jobPolling";
import { expansionCards, workflowStages } from "@/features/storycam/domain/shellContent";

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
  const [storyboardStatus, setStoryboardStatus] = useState<StoryboardStatus>("idle");
  const [storyboardMessage, setStoryboardMessage] = useState("确认故事世界后才能生成核心分镜。");

  useEffect(() => {
    if (!clipJob || !shouldPollGenerationJob(clipJob.status)) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await getGenerationJob(clipJob.id);
        setClipJob(response.job);
      } catch {
        setClipJob((current) => (current ? { ...current, redactedError: "状态更新失败。", status: "failed" } : current));
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [clipJob]);

  function handleStoryWorldCreated(nextStoryWorld: CreateStoryWorldResponse) {
    setStoryWorld(nextStoryWorld);
    setStoryWorldConfirmed(false);
    setStoryboard(null);
    setSelectedCoreGroupIndex(null);
    setExpansion(null);
    setClipConfirmationSummary(null);
    setClipJob(null);
    setStoryboardStatus("idle");
    setStoryboardMessage("故事雏形已准备好，请先确认剧本、人物和地点。");
  }

  function confirmStoryWorld() {
    setStoryWorldConfirmed(true);
    setStoryboardMessage("故事世界已确认，可以生成核心分镜。");
  }

  function handleStoryWorldEdit() {
    setStoryWorldConfirmed(false);
    setStoryboard(null);
    setSelectedCoreGroupIndex(null);
    setExpansion(null);
    setClipConfirmationSummary(null);
    setClipJob(null);
    setStoryboardStatus((current) => staleStoryboardAfterStoryWorldEdit(current));
    setStoryboardMessage("分镜已过期，需要重新确认故事世界。");
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
      setStoryboardMessage(`已生成 ${nextExpansion.expansionCards.length} 张扩展卡。`);
    } catch {
      setStoryboardMessage("扩展卡生成失败，可以跳过扩展直接生成片段。");
    } finally {
      setIsExpansionLoading(false);
    }
  }

  function prepareClipGeneration() {
    if (!selectedGroup) {
      return;
    }

    setClipJob(null);
    setClipConfirmationSummary(
      `用「${selectedGroup.title}」生成一个约 ${selectedGroup.estimatedClipDurationSeconds.toFixed(1).replace(".0", "")} 秒的私人片段。`
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
    void confirmClipGeneration();
  }

  const selectedGroup =
    storyboard && selectedCoreGroupIndex !== null ? storyboard.storyboard.coreStoryboardGroups[selectedCoreGroupIndex] : undefined;

  return (
    <main className="min-h-screen px-5 py-5 text-stone-100 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[310px_minmax(0,1fr)_330px]">
        <IdeaInputPanel onStoryWorldCreated={handleStoryWorldCreated} />

        {storyboard && selectedGroup && (expansion || isExpansionLoading) ? (
          <ExpansionCanvas
            expansion={expansion}
            generationPanel={
              clipJob ? (
                <ClipGenerationStatus job={clipJob} onCancel={cancelClipJob} onRetry={retryClipGeneration} />
              ) : clipConfirmationSummary ? (
                <ProviderSendConfirm
                  confirmationSummary={clipConfirmationSummary}
                  isSubmitting={isClipSubmitting}
                  onCancel={() => setClipConfirmationSummary(null)}
                  onConfirm={confirmClipGeneration}
                />
              ) : null
            }
            isLoading={isExpansionLoading}
            onGenerateMore={() => expandCoreGroup(selectedCoreGroupIndex ?? 0, 8)}
            onSkipExpansion={prepareClipGeneration}
            selectedGroup={selectedGroup}
            selectedIndex={selectedCoreGroupIndex ?? 0}
          />
        ) : storyWorld ? (
          <StoryWorldReview
            isConfirmed={storyWorldConfirmed}
            key={storyWorld.artifacts.script.id}
            onConfirm={confirmStoryWorld}
            onEditSaved={handleStoryWorldEdit}
            storyWorld={storyWorld}
          />
        ) : (
          <EmptyStoryWorldStage />
        )}

        <aside className="space-y-5">
          <GoogleSignInButton />

          <section className="rounded-lg border border-stone-700/70 bg-stone-950/70 p-4">
            <h2 className="text-lg font-semibold text-stone-50">当前流程</h2>
            <ol className="mt-4 space-y-2">
              {workflowStages.map((stage, index) => (
                <li className="flex items-center gap-3 text-sm text-stone-300" key={stage}>
                  <span className="flex size-6 items-center justify-center rounded-full border border-stone-700 text-xs text-amber-200">
                    {index + 1}
                  </span>
                  <span>{stage}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-lg border border-stone-700/70 bg-stone-950/70 p-4">
            <h2 className="text-lg font-semibold text-stone-50">故事世界</h2>
            <p
              className={`mt-3 rounded-md border px-3 py-2 text-sm leading-6 ${
                storyboardStatus === "stale" ? "border-amber-500/80 text-amber-100" : "border-stone-700 text-stone-300"
              }`}
              role="status"
            >
              {storyboardMessage}
            </p>
            <button
              className="mt-4 w-full rounded-md bg-teal-500 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
              disabled={!storyWorld || !storyWorldConfirmed || storyboardStatus === "generating"}
              onClick={generateStoryboard}
              type="button"
            >
              {storyboardStatus === "generating" ? "正在生成核心分镜" : "生成核心分镜"}
            </button>
          </section>

          <section className="rounded-lg border border-stone-700/70 bg-stone-950/70 p-4">
            <h2 className="text-lg font-semibold text-stone-50">片段时间线</h2>
            <CoreStoryboardGroups
              onExpandGroup={(index) => expandCoreGroup(index)}
              onSelectGroup={setSelectedCoreGroupIndex}
              selectedIndex={selectedCoreGroupIndex}
              storyboard={storyboard}
            />
            <button
              className="mt-4 w-full rounded-md bg-stone-800 px-4 py-2 text-sm font-semibold text-stone-400"
              disabled
              type="button"
            >
              生成最终作品
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}

function EmptyStoryWorldStage() {
  return (
    <section className="rounded-lg border border-stone-700/70 bg-[#201d18]/85 p-4 shadow-2xl shadow-black/20">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-teal-200">等待故事雏形</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-50">先写下这一幕</h2>
        </div>
        <p className="rounded-md border border-stone-700 px-3 py-2 text-sm text-stone-400">未确认</p>
      </div>

      <div className="grid min-h-[520px] gap-3 md:grid-cols-3 md:grid-rows-3">
        {expansionCards.map((card, index) => (
          <div
            className="flex min-h-32 flex-col justify-between rounded-lg border border-stone-700 bg-stone-900/70 p-3 opacity-75"
            key={card}
          >
            <span className="text-xs text-stone-500">稍后扩展 {index + 1}</span>
            <p className="text-lg font-medium text-stone-300">{card}</p>
            <div className="h-16 rounded-md bg-[linear-gradient(135deg,#534438,#12485a_54%,#853d3a)] opacity-60" />
          </div>
        ))}

        <div className="order-first flex min-h-56 flex-col justify-between rounded-lg border border-amber-300/70 bg-[#2c2419] p-4 shadow-lg shadow-amber-950/40 md:order-none md:col-start-2 md:row-start-2">
          <div>
            <p className="text-xs text-amber-200">下一步</p>
            <h3 className="mt-2 text-xl font-semibold text-stone-50">确认我的剧本</h3>
          </div>
          <p className="text-sm leading-6 text-stone-300">生成后会先看到短剧本、人物和地点。确认像你的故事，再进入核心分镜。</p>
        </div>
      </div>
    </section>
  );
}
