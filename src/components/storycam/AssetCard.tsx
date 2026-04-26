type AssetCardProps = {
  eyebrow: string;
  lines: string[];
  title: string;
};

export function AssetCard({ eyebrow, lines, title }: AssetCardProps) {
  return (
    <article className="storycam-glass rounded-[1.5rem] p-4 transition hover:border-[#00f0ff]/50">
      <div className="storycam-cinematic-frame mb-4 aspect-video rounded-[1.25rem]" />
      <p className="storycam-eyebrow">{eyebrow}</p>
      <h3 className="mt-2 text-base font-extrabold text-[#e2e2e2]">{title}</h3>
      <div className="mt-3 space-y-2">
        {lines.map((line) => (
          <p className="text-sm leading-6 text-[#b9cacb]" key={line}>
            {line}
          </p>
        ))}
      </div>
    </article>
  );
}
