type ProviderSendConfirmProps = {
  confirmationSummary: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ProviderSendConfirm({ confirmationSummary, isSubmitting, onCancel, onConfirm }: ProviderSendConfirmProps) {
  return (
    <section className="storycam-send-confirm rounded-[2rem] border border-[#00f0ff]/35 bg-[#0e0e0e]/95 p-6 shadow-[0_0_24px_rgba(0,240,255,0.12)]">
      <p className="text-xs font-bold uppercase text-[#00f0ff]">生成前确认</p>
      <h1 className="storycam-heading-lg mt-2">准备发送这一组</h1>
      <p className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 text-base leading-7 text-[#dbfcff]">{confirmationSummary}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
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
