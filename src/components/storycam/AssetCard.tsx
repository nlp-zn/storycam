type AssetCardProps = {
  eyebrow: string;
  imageUrl?: string;
  layout?: "standard" | "wide";
  lines: string[];
  meta?: string;
  onOpen?: () => void;
  status?: "empty" | "generating" | "ready" | "error";
  tone?: "character" | "scene";
  title: string;
};

export function AssetCard({
  eyebrow,
  imageUrl,
  layout = "standard",
  lines,
  meta,
  onOpen,
  status = "empty",
  title,
  tone = "character"
}: AssetCardProps) {
  const isScene = tone === "scene";
  const previewLines = lines.slice(0, isScene ? 3 : 2);
  const Tag = onOpen ? "button" : "article";

  return (
    <Tag
      className={`storycam-glass storycam-asset-card ${isScene ? "storycam-asset-card--scene" : "storycam-asset-card--character"} ${layout === "wide" ? "storycam-asset-card--wide" : ""} group overflow-hidden p-2 text-left transition hover:border-[#00f0ff]/50 focus-visible:border-[#00f0ff] focus-visible:outline-none`}
      data-testid={`story-world-${tone}-asset-card`}
      onClick={onOpen}
      type={onOpen ? "button" : undefined}
    >
      <div
        className={`storycam-cinematic-frame storycam-asset-frame ${isScene ? "aspect-video" : "aspect-[3/4]"} transition duration-500 group-hover:scale-[1.02]`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={`${title} 资产图`} className="absolute inset-0 size-full object-cover" src={imageUrl} />
        ) : null}
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          <span className="rounded-full border border-white/15 bg-black/50 px-3 py-1 text-xs font-black text-[#dbfcff] backdrop-blur">
            {eyebrow}
          </span>
          {meta ? (
            <span className="rounded-full bg-[#00f0ff] px-3 py-1 text-xs font-black text-black">
              {meta}
            </span>
          ) : null}
        </div>
        <div className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#dbfcff] opacity-0 backdrop-blur transition group-hover:opacity-100">
          {statusLabel(status)}
        </div>
      </div>
      <div className="px-3 pb-3">
        <h3 className="text-base font-extrabold text-[#e2e2e2]">{title}</h3>
        <div className="mt-2 space-y-2">
        {previewLines.map((line) => (
          <p className="storycam-asset-line text-sm leading-6 text-[#b9cacb]" key={line}>
            {line}
          </p>
        ))}
        </div>
      </div>
    </Tag>
  );
}

function statusLabel(status: NonNullable<AssetCardProps["status"]>) {
  switch (status) {
    case "generating":
      return "生成中";
    case "ready":
      return "查看";
    case "error":
      return "重试";
    case "empty":
      return "生成";
  }
}
