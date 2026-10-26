import type { AssetValuationDto } from "@/lib/api/types.gen";
import { toNumber, tone } from "@/lib/format";

export type AssetFilter = "all" | "gain" | "loss";

/** Les plus grosses positions d'abord ; une position non valorisée (prix indisponible) va en dernier. */
export function sortByValue(assets: readonly AssetValuationDto[]): AssetValuationDto[] {
  return [...assets].sort((a, b) => {
    const va = toNumber(a.value);
    const vb = toNumber(b.value);
    if (va === null && vb === null) return a.symbol.localeCompare(b.symbol);
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va || a.symbol.localeCompare(b.symbol);
  });
}

/** « En gain » et « En perte » ignorent les positions à l'équilibre (moins d'un centime) et les non valorisées. */
export function filterAssets(assets: readonly AssetValuationDto[], filter: AssetFilter): AssetValuationDto[] {
  if (filter === "all") return [...assets];
  const wanted = filter === "gain" ? "gain" : "loss";
  return assets.filter((asset) => tone(asset.pnl) === wanted);
}
