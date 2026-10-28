import type { AssetValuationDto } from "@/lib/api/types.gen";
import { assetHue, formatWeight, toNumber } from "@/lib/format";
import { donutSegments } from "@/lib/portfolio-series";
import { sortByValue } from "./asset-sort";

const swatch = (symbol: string) => `hsl(${assetHue(symbol)} 60% 68%)`;
const SIZE = 132;
const STROKE = 16;
const R = (SIZE - STROKE) / 2;

/**
 * Répartition du portefeuille : un anneau (un arc par actif, proportionnel à sa part) et sa légende. Rien si aucune
 * position n'est valorisée. Le texte de la légende porte les pourcentages : la couleur ne porte pas seule l'information.
 */
export function AllocationDonut({ assets }: { assets: readonly AssetValuationDto[] }) {
  const weighted = sortByValue(assets).filter((asset) => (toNumber(asset.weightPct) ?? 0) > 0);
  if (weighted.length === 0) return null;

  const segments = donutSegments(
    weighted.map((a) => ({ symbol: a.symbol, pct: toNumber(a.weightPct) ?? 0 })),
    R,
  );
  const circumference = 2 * Math.PI * R;
  const summary = weighted.map((a) => `${a.symbol} ${formatWeight(a.weightPct)}`).join(", ");

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center lg:flex-col lg:items-center">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Répartition du portefeuille : ${summary}`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="currentColor" strokeOpacity="0.07" strokeWidth={STROKE} />
          {segments.map((segment) => (
            <circle
              key={segment.symbol}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={swatch(segment.symbol)}
              strokeWidth={STROKE}
              strokeDasharray={`${segment.length} ${circumference - segment.length}`}
              strokeDashoffset={segment.offset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
          <span className="text-2xl font-extrabold tabular-nums">{weighted.length}</span>
          <span className="text-[11px] text-muted">actif{weighted.length > 1 ? "s" : ""}</span>
        </div>
      </div>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 sm:flex-col sm:gap-y-1 lg:flex-row lg:gap-y-1.5">
        {weighted.map((asset) => (
          <li key={asset.symbol} className="flex items-center gap-2 text-[13px] text-ink-soft">
            <span className="h-2 w-2 rounded-[3px]" style={{ background: swatch(asset.symbol) }} aria-hidden="true" />
            {asset.symbol} <span className="tabular-nums text-muted">{formatWeight(asset.weightPct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
