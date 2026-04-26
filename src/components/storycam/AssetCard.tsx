type AssetCardProps = {
  eyebrow: string;
  lines: string[];
  title: string;
};

export function AssetCard({ eyebrow, lines, title }: AssetCardProps) {
  return (
    <article className="rounded-md border border-stone-700 bg-stone-900/80 p-3">
      <p className="text-xs font-semibold text-amber-200">{eyebrow}</p>
      <h3 className="mt-2 text-sm font-semibold text-stone-50">{title}</h3>
      <div className="mt-3 space-y-2">
        {lines.map((line) => (
          <p className="text-sm leading-6 text-stone-400" key={line}>
            {line}
          </p>
        ))}
      </div>
    </article>
  );
}
