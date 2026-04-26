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
    <section className="storycam-panel storycam-neon-panel">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black">
          <div className="storycam-cinematic-frame relative flex aspect-video items-end p-6">
            <div className="relative z-10 w-full">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="storycam-eyebrow">片段生成</p>
                  <h3 className="mt-2 text-3xl font-black text-[#e2e2e2]">{statusLabel(job.status)}</h3>
                </div>
                <span className="max-w-36 truncate rounded-full border border-white/10 bg-black/50 px-3 py-2 text-xs font-bold text-[#b9cacb]">
                  {job.status}
                </span>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#00f0ff] to-[#ff4b89] shadow-[0_0_14px_rgba(0,240,255,0.5)]"
                  style={{ width: progressForStatus(job.status) }}
                />
              </div>
            </div>
          </div>

          <div className="flex min-w-0 items-center justify-between gap-3 border-t border-white/10 px-5 py-4 text-xs text-[#b9cacb]">
            <span className="shrink-0">账号内任务</span>
            <span className="min-w-0 truncate text-right">{job.id}</span>
          </div>
        </div>

        <aside className="flex flex-col justify-between rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
          <div>
            <p className="storycam-eyebrow">导演笔记</p>
            <p className="mt-4 break-words text-sm leading-6 text-[#b9cacb]">
              任务 {job.id}，仅保存账号内预览。{job.redactedError ? ` ${job.redactedError}` : ""}
            </p>
            {isTerminalGenerationJobStatus(job.status) ? <p className="mt-4 text-xs text-[#849495]">当前任务已结束。</p> : null}
          </div>

          <div className="mt-5 grid gap-3">
            <button className="storycam-secondary-button w-full disabled:opacity-50" disabled={!canCancel} onClick={onCancel} type="button">
              取消生成
            </button>
            <button className="storycam-primary-button w-full disabled:opacity-50" disabled={!canRetry} onClick={onRetry} type="button">
              重试
            </button>
          </div>
        </aside>
      </div>
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
