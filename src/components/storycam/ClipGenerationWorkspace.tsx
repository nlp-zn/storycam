import { useState } from "react";
import type { FinalWorkResponse, GenerationJobStatus, GenerationJobSummary } from "@/features/storycam/client/storycamApi";
import { isTerminalGenerationJobStatus } from "@/features/storycam/client/jobPolling";
import { storyCamSeedanceOutputResolutionLabel } from "@/features/storycam/domain/videoSettings";

type ClipGenerationState =
  | { kind: "idle" }
  | { kind: "pending"; request: { durationSeconds: number } }
  | { kind: "error"; message: string; request: { durationSeconds: number } };

type ClipGenerationWorkspaceProps = {
  clipGenerationState?: ClipGenerationState;
  clipJob: GenerationJobSummary | null;
  durationSeconds?: number;
  finalWork: FinalWorkResponse | null;
  isDeletingStory?: boolean;
  isFinalWorkSubmitting: boolean;
  onBackToCoreStoryboard: () => void;
  onCancelClip: () => void;
  onCreateFinalWork: () => Promise<FinalWorkResponse | null>;
  onDeleteStory?: () => void;
  onRetake: () => void;
  title?: string;
  posterImageUrl?: string;
};

const audioWaveHeights = Array.from({ length: 36 }, (_, index) => 8 + ((index * 7) % 24));

export function ClipGenerationWorkspace({
  clipGenerationState = { kind: "idle" },
  clipJob,
  durationSeconds = 15,
  finalWork,
  isDeletingStory = false,
  isFinalWorkSubmitting,
  onBackToCoreStoryboard,
  onCancelClip,
  onCreateFinalWork,
  onDeleteStory,
  onRetake,
  posterImageUrl,
  title = "Clip 01"
}: ClipGenerationWorkspaceProps) {
  const [isExporting, setIsExporting] = useState(false);
  const activePreview = finalWork?.preview ?? clipJob?.outputPreview;
  const finalWorkSignedUrl = finalWork?.preview?.signedUrl;
  const isCreatingClip = clipGenerationState.kind === "pending";
  const isClipCreationError = clipGenerationState.kind === "error";
  const canCancel = clipJob?.status === "queued" || clipJob?.status === "running";
  const canRetry = clipJob?.status === "failed" || clipJob?.status === "canceled" || clipJob?.status === "expired";
  const isClipReady = clipJob?.status === "succeeded";
  const canExport = !isCreatingClip && !isClipCreationError && Boolean(finalWorkSignedUrl || (isClipReady && clipJob?.outputArtifactId));
  const durationLabel = formatDuration(durationSeconds);
  const progress = progressNumberForStatus(clipJob?.status);
  const statusLabel = clipGenerationStatusLabel(clipGenerationState, clipJob?.status, Boolean(finalWork));
  const statusHeading = clipStatusHeading({
    durationLabel,
    isClipReady,
    isSaved: Boolean(finalWork),
    title
  });

  async function exportMp4(): Promise<void> {
    if (isExporting || isFinalWorkSubmitting || (!finalWorkSignedUrl && !clipJob?.outputArtifactId)) {
      return;
    }

    setIsExporting(true);

    try {
      const readyFinalWork = finalWork ?? (await onCreateFinalWork());
      const signedUrl = readyFinalWork?.preview?.signedUrl;

      if (signedUrl) {
        triggerDownload(signedUrl, "storycam-final-work.mp4");
      }
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="storycam-clip-stage">
      <header className="storycam-clip-hero">
        <div className="storycam-section-kicker">
          <span />
          <p>第四部：片段生成</p>
          <span />
        </div>
        <h1 className="storycam-heading-xl">生成片段</h1>
        <p>在同一页完成生成、预览、保存与导出。</p>
        <span className="storycam-clip-hero-pill">{finalWork ? "可预览" : statusLabel}</span>
      </header>

      <div className="storycam-clip-player-card">
        <div className="storycam-clip-player-topbar">
          <div className="storycam-clip-pills">
            <span>Clip 01</span>
            <span>输出 {storyCamSeedanceOutputResolutionLabel}</span>
            <span>{durationLabel}</span>
            <span>含音频</span>
          </div>
          <div className="storycam-clip-pills storycam-clip-pills--status">
            <span>视频 {isClipReady ? "READY" : statusLabel}</span>
            <span>音频 {isClipReady ? "READY" : "待生成"}</span>
            <span>{finalWork ? "已保存" : "待保存"}</span>
          </div>
        </div>

        <div className="storycam-clip-video-frame">
          {isCreatingClip ? (
            <div className="storycam-cinematic-frame storycam-clip-placeholder storycam-clip-placeholder--pending" data-testid="clip-generation-pending-frame">
              <p className="storycam-clip-boundary-copy">
                正在把这组分镜发送给视频生成服务，完成后会在这里继续显示进度。
              </p>
              <span className="storycam-skeleton-line storycam-skeleton-line--wide" />
              <span className="storycam-skeleton-line storycam-skeleton-line--medium" />
              <span className="storycam-skeleton-line storycam-skeleton-line--short" />
            </div>
          ) : isClipCreationError ? (
            <div className="storycam-cinematic-frame storycam-clip-placeholder" role="alert">
              <span>{clipGenerationState.message}</span>
            </div>
          ) : activePreview ? (
            <video className="storycam-clip-video" controls playsInline preload="metadata" src={activePreview.signedUrl} />
          ) : posterImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`${title} 片段封面`} className="storycam-clip-video" src={posterImageUrl} />
          ) : (
            <div className="storycam-cinematic-frame storycam-clip-placeholder">
              <span>{clipJob ? generationMessage(clipJob.status) : "等待确认发送"}</span>
            </div>
          )}

          {!activePreview && !isClipCreationError ? (
            <div className="storycam-clip-progress-orb" aria-hidden="true">
              <span>{isCreatingClip ? "..." : `${progress}%`}</span>
            </div>
          ) : null}
        </div>

        <div className="storycam-clip-audio-strip">
          <span>雨声 / 门铃 / 脚步 / 环境音乐 / 低声对白</span>
          <div aria-hidden="true">
            {audioWaveHeights.map((height, index) => (
              <i key={index} style={{ height: `${height}px` }} />
            ))}
          </div>
        </div>
      </div>

      <h2 className="sr-only">{statusHeading}</h2>
      {clipJob ? <p className="sr-only">任务 {clipJob.id}</p> : null}
      {clipJob?.redactedError ? <p className="storycam-clip-error">{clipJob.redactedError}</p> : null}
      {clipJob?.providerErrorCategory ? <p className="storycam-clip-error">失败类型：{clipJob.providerErrorCategory}</p> : null}

      <div className="storycam-clip-footer-actions">
        {clipJob && !isTerminalGenerationJobStatus(clipJob.status) ? (
          <button className="storycam-secondary-button storycam-danger-button" disabled={!canCancel} onClick={onCancelClip} type="button">
            取消生成
          </button>
        ) : null}
        {onDeleteStory && clipJob ? (
          <button
            className="storycam-secondary-button storycam-danger-button"
            disabled={isDeletingStory}
            onClick={onDeleteStory}
            type="button"
          >
            {isDeletingStory ? "正在删除" : "删除这个故事"}
          </button>
        ) : null}
        {!isCreatingClip && !isClipCreationError && (canRetry || isClipReady) ? (
          <button className="storycam-secondary-button" disabled={!canRetry && !isClipReady} onClick={onRetake} type="button">
            {canRetry ? "重试" : "重拍这个片段"}
          </button>
        ) : null}
        {activePreview ? (
          <a className="storycam-secondary-button" href={activePreview.signedUrl} rel="noreferrer" target="_blank">
            查看
          </a>
        ) : null}
        {isClipReady ? (
          <button className="storycam-secondary-button" disabled={isFinalWorkSubmitting || Boolean(finalWork)} onClick={onCreateFinalWork} type="button">
            {finalWork ? "最终作品已生成" : isFinalWorkSubmitting ? "正在生成最终作品" : "生成最终作品"}
          </button>
        ) : null}
        {finalWork?.preview ? (
          <a className="storycam-secondary-button" href={finalWork.preview.signedUrl} rel="noreferrer" target="_blank">
            打开最终作品
          </a>
        ) : null}
      </div>

      <div className="storycam-bottom-dock storycam-clip-dock">
        <div className="storycam-clip-dock-meta">1 个片段 · {durationLabel}</div>
        <div className="storycam-clip-dock-status">
          <span /> 视频 {isClipReady ? "READY" : statusLabel} · 音频 {isClipReady ? "READY" : "待生成"} · {finalWork ? "已保存" : "待保存"}
        </div>
        <button className="storycam-secondary-button" onClick={onBackToCoreStoryboard} type="button">
          返回核心分镜
        </button>
        {isCreatingClip ? (
          <button className="storycam-primary-button" disabled type="button">
            片段生成中
          </button>
        ) : isClipCreationError ? (
          <button className="storycam-primary-button" onClick={onRetake} type="button">
            重试生成
          </button>
        ) : (
          <button className="storycam-primary-button" disabled={!canExport || isExporting || isFinalWorkSubmitting} onClick={exportMp4} type="button">
            导出 MP4
          </button>
        )}
      </div>
    </section>
  );
}

function clipGenerationStatusLabel(clipGenerationState: ClipGenerationState, status: GenerationJobStatus | undefined, isSaved: boolean): string {
  if (clipGenerationState.kind === "pending") {
    return "创建任务中";
  }

  if (clipGenerationState.kind === "error") {
    return "创建失败";
  }

  return clipStatusLabel(status, isSaved);
}

function clipStatusLabel(status: GenerationJobStatus | undefined, isSaved: boolean): string {
  if (isSaved) {
    return "已保存";
  }

  if (!status) {
    return "待确认";
  }

  const labels: Record<GenerationJobStatus, string> = {
    cancel_requested: "正在取消",
    canceled: "已取消",
    expired: "任务超时",
    failed: "生成失败",
    queued: "已排队",
    running: "生成中",
    succeeded: "READY"
  };

  return labels[status];
}

function clipStatusHeading({
  durationLabel,
  isClipReady,
  isSaved,
  title
}: {
  durationLabel: string;
  isClipReady: boolean;
  isSaved: boolean;
  title: string;
}): string {
  if (isSaved) {
    return "账号内预览已保存";
  }

  if (isClipReady) {
    return "片段已生成";
  }

  return `Clip 01 · ${title} · ${durationLabel}`;
}

function generationMessage(status: GenerationJobStatus): string {
  if (status === "queued") {
    return "正在排队准备渲染";
  }

  if (status === "running") {
    return "正在生成片段";
  }

  if (status === "cancel_requested" || status === "canceled") {
    return "生成已取消";
  }

  if (status === "failed" || status === "expired") {
    return "生成需要重试";
  }

  return "片段已生成";
}

function progressNumberForStatus(status: GenerationJobStatus | undefined): number {
  if (!status) {
    return 0;
  }

  const values: Record<GenerationJobStatus, number> = {
    cancel_requested: 35,
    canceled: 100,
    expired: 100,
    failed: 100,
    queued: 18,
    running: 65,
    succeeded: 100
  };

  return values[status];
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function triggerDownload(signedUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = signedUrl;
  anchor.download = filename;
  anchor.rel = "noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
