type ProviderSendConfirmProps = {
  confirmationSummary: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ProviderSendConfirm({ confirmationSummary, isSubmitting, onCancel, onConfirm }: ProviderSendConfirmProps) {
  return (
    <section className="rounded-3xl border border-[#00f0ff]/35 bg-[#0e0e0e]/95 p-4 shadow-[0_0_24px_rgba(0,240,255,0.12)]">
      <p className="text-xs font-bold uppercase text-[#00f0ff]">生成前确认</p>
      <h3 className="mt-2 text-lg font-extrabold text-[#e2e2e2]">准备发送这一组</h3>
      <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-[#dbfcff]">{confirmationSummary}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          className="rounded-full border border-[#3b494b] px-4 py-3 text-sm font-bold text-[#b9cacb] transition hover:border-[#ffb1c3] hover:text-[#ffb1c3]"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          先不发送
        </button>
        <button
          className="rounded-full bg-gradient-to-r from-[#00f0ff] to-[#ff4b89] px-4 py-3 text-sm font-extrabold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          onClick={onConfirm}
          type="button"
        >
          {isSubmitting ? "正在创建任务" : "确认发送生成片段"}
        </button>
      </div>
    </section>
  );
}
