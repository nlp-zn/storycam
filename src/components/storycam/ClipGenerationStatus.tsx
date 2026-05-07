import type { GenerationJobSummary, GenerationJobStatus } from "@/features/storycam/client/storycamApi";
import { isTerminalGenerationJobStatus } from "@/features/storycam/client/jobPolling";

type ClipGenerationStatusProps = {
  isDeletingStory?: boolean;
  job: GenerationJobSummary;
  onCancel: () => void;
  onDeleteStory?: () => void;
  onRetry: () => void;
};

export function ClipGenerationStatus({ isDeletingStory = false, job, onCancel, onDeleteStory, onRetry }: ClipGenerationStatusProps) {
  const canCancel = job.status === "queued" || job.status === "running";
  const canRetry = job.status === "failed" || job.status === "canceled" || job.status === "expired";
  const progress = progressNumberForStatus(job.status);

  return (
    <section className="storycam-generation-stage">
      <div className="storycam-generation-grid">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h1 className="storycam-heading-lg">片段生成</h1>
            <span className="rounded-full border border-[#00f0ff]/30 bg-[#2a2a2a] px-4 py-2 text-sm font-bold text-[#00f0ff]">
              {statusLabel(job.status)}
            </span>
          </div>

          <div className="storycam-generation-viewer storycam-cinematic-frame relative flex aspect-video items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
            <div className="relative z-10 flex flex-col items-center gap-4 text-center">
              <div className="relative size-36">
                <svg className="size-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" fill="none" r="44" stroke="rgba(255,255,255,0.14)" strokeWidth="4" />
                  <circle
                    cx="50"
                    cy="50"
                    fill="none"
                    r="44"
                    stroke="#00f0ff"
                    strokeDasharray="276"
                    strokeDashoffset={276 - (276 * progress) / 100}
                    strokeLinecap="round"
                    strokeWidth="4"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-3xl font-black text-[#dbfcff]">{progress}%</div>
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#00f0ff]">Seedance 2.0</p>
                <p className="mt-2 text-lg font-black text-[#e2e2e2]">{generationMessage(job.status)}</p>
              </div>
            </div>

            <div className="absolute bottom-6 left-6 right-6 z-20 flex items-center gap-4 rounded-[1.25rem] border border-[#00f0ff]/20 bg-[#1f1f1f]/90 p-4 backdrop-blur">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#00f0ff] text-sm font-black text-black">▶</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#00dbe9] to-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.5)]"
                  style={{ width: progressForStatus(job.status) }}
                />
              </div>
              <span className="text-xs font-bold text-[#b9cacb]">00:14 / 00:22</span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-4">
            <button className="storycam-secondary-button disabled:opacity-50" disabled type="button">
              暂停渲染
            </button>
            <button className="storycam-secondary-button storycam-danger-button disabled:opacity-50" disabled={!canCancel} onClick={onCancel} type="button">
              取消生成
            </button>
            <button className="storycam-primary-button disabled:opacity-50" disabled={!canRetry} onClick={onRetry} type="button">
              重试
            </button>
          </div>
        </div>

        <aside className="storycam-generation-notes">
          <div>
            <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-4">
              <span className="flex size-10 items-center justify-center rounded-[0.9rem] border border-[#00f0ff]/30 bg-[#00f0ff]/10 text-[#00f0ff]">⌁</span>
              <div>
                <p className="storycam-eyebrow">导演笔记</p>
                <p className="mt-1 text-xs text-[#849495]">任务 {job.id}</p>
              </div>
            </div>
            <div className="grid gap-3">
              {generationLogs(job).map((entry) => (
                <p className="rounded-[1rem] border border-white/10 bg-[#1f1f1f] p-3 text-sm leading-6 text-[#b9cacb]" key={entry}>
                  {entry}
                </p>
              ))}
            </div>
            {isTerminalGenerationJobStatus(job.status) ? <p className="mt-4 text-xs text-[#849495]">当前任务已结束。</p> : null}
          </div>

          <div className="mt-5 grid gap-3">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-bold text-[#b9cacb]">
                <span>内存使用</span>
                <span>84%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-[84%] rounded-full bg-gradient-to-r from-[#ff4b89] to-[#ffb1c3]" />
              </div>
            </div>
            {onDeleteStory ? (
              <button
                className="storycam-secondary-button storycam-danger-button w-full disabled:opacity-50"
                disabled={isDeletingStory}
                onClick={onDeleteStory}
                type="button"
              >
                {isDeletingStory ? "正在删除" : "删除这个故事"}
              </button>
            ) : null}
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

function generationMessage(status: GenerationJobStatus) {
  if (status === "queued") {
    return "正在排队准备渲染";
  }

  if (status === "running") {
    return "正在处理神经权重";
  }

  if (status === "succeeded") {
    return "渲染完成";
  }

  if (status === "canceled" || status === "cancel_requested") {
    return "生成已取消";
  }

  return "生成需要重试";
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

function progressNumberForStatus(status: GenerationJobStatus) {
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

function generationLogs(job: GenerationJobSummary) {
  return [
    `已接收片段作业 ${job.id}`,
    `模型通道：${job.providerName}`,
    ...(job.providerErrorCategory ? [`失败类型：${job.providerErrorCategory}`] : []),
    ...(job.providerHttpStatus !== undefined ? [`Provider HTTP：${job.providerHttpStatus}`] : []),
    job.redactedError ? job.redactedError : "正在同步画面、动作与镜头节奏。",
    "输出将只保存到账号内预览。"
  ];
}
