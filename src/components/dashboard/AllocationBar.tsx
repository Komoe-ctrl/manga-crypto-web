import type { AssetValuationDto } from "@/lib/api/types.gen";
import { assetHue, formatWeight, toNumber } from "@/lib/format";
import { sortByValue } from "./asset-sort";

const swatch = (symbol: string) => `hsl(${assetHue(symbol)} 60% 68%)`;

/** Répartition du portefeuille : une barre proportionnelle et sa légende. Rien si aucune position n'est valorisée. */
export function AllocationBar({ assets }: { assets: readonly AssetValuationDto[] }) {
  const weighted = sortByValue(assets).filter((asset) => (toNumber(asset.weightPct) ?? 0) > 0);
  if (weighted.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Répartition du portefeuille par actif">
        {weighted.map((asset) => (
          <div key={asset.symbol} style={{ width: `${toNumber(asset.weightPct)}%`, background: swatch(asset.symbol) }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
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
