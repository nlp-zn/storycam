import type { GenerationJobSummary, GenerationJobStatus } from "@/features/storycam/client/storycamApi";
import { isTerminalGenerationJobStatus } from "@/features/storycam/client/jobPolling";

type ClipGenerationStatusProps = {
  job: GenerationJobSummary;
  onCancel: () => void;
  onRetry: () => void;
};

export function ClipGenerationStatus({ job, onCancel, onRetry }: ClipGenerationStatusProps) {
  const canCancel = job.status === "queued" || job.status === "running";
  const canRetry = job.status === "failed" || job.status === "canceled" || job.status === "expired";

  return (
    <section className="rounded-3xl border border-[#3b494b] bg-[#0a0a0a]/95 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-[#00f0ff]">片段生成</p>
          <h3 className="mt-2 text-lg font-extrabold text-[#e2e2e2]">{statusLabel(job.status)}</h3>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-[#b9cacb]">{job.status}</span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-[#00f0ff] to-[#ff4b89]" style={{ width: progressForStatus(job.status) }} />
      </div>

      <p className="mt-3 text-sm leading-6 text-[#b9cacb]">任务 {job.id}，仅保存账号内预览。{job.redactedError ? ` ${job.redactedError}` : ""}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          className="rounded-full border border-[#3b494b] px-4 py-3 text-sm font-bold text-[#b9cacb] transition hover:border-[#ffb1c3] hover:text-[#ffb1c3] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canCancel}
          onClick={onCancel}
          type="button"
        >
          取消生成
        </button>
        <button
          className="rounded-full border border-[#00f0ff]/40 px-4 py-3 text-sm font-bold text-[#dbfcff] transition hover:bg-[#00f0ff]/10 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canRetry}
          onClick={onRetry}
          type="button"
        >
          重试
        </button>
      </div>

      {isTerminalGenerationJobStatus(job.status) ? <p className="mt-3 text-xs text-[#849495]">当前任务已结束。</p> : null}
    </section>
  );
}

function statusLabel(status: GenerationJobStatus) {
  const labels: Record<GenerationJobStatus, string> = {
    cancel_requested: "正在取消",
    canceled: "已取消",
    expired: "任务超时",
    failed: "生成失败",
    queued: "已排队",
    running: "生成中",
    succeeded: "片段已生成"
  };

  return labels[status];
}

function progressForStatus(status: GenerationJobStatus) {
  const values: Record<GenerationJobStatus, string> = {
    cancel_requested: "35%",
    canceled: "100%",
    expired: "100%",
    failed: "100%",
    queued: "18%",
    running: "65%",
    succeeded: "100%"
  };

  return values[status];
}
