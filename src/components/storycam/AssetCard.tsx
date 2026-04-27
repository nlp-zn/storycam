type AssetCardProps = {
  eyebrow: string;
  lines: string[];
  meta?: string;
  tone?: "character" | "scene";
  title: string;
};

export function AssetCard({ eyebrow, lines, meta, title, tone = "character" }: AssetCardProps) {
  const isScene = tone === "scene";
  const previewLines = lines.slice(0, 2);

  return (
    <article
      className={`storycam-glass storycam-asset-card ${isScene ? "storycam-asset-card--scene" : "storycam-asset-card--character"} group overflow-hidden p-2 transition hover:border-[#00f0ff]/50`}
      data-testid={`story-world-${tone}-asset-card`}
    >
      <div className={`storycam-cinematic-frame storycam-asset-frame ${isScene ? "aspect-video" : "aspect-[3/4]"} transition duration-500 group-hover:scale-[1.02]`}>
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
    </article>
  );
}
