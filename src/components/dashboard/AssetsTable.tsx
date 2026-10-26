"use client";

import { useState } from "react";
import { Glass } from "@/components/ui/glass";
import { Segmented } from "@/components/ui/segmented";
import { Sparkline } from "@/components/ui/Sparkline";
import type { AssetValuationDto, TrendsDto } from "@/lib/api/types.gen";
import {
  TONE_CLASS,
  assetBadge,
  assetHue,
  formatMoney,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatSigned,
  formatWeight,
  tone,
} from "@/lib/format";
import { usePrivacy } from "@/lib/privacy";
import { trendOf } from "@/lib/queries/trends";
import { filterAssets, sortByValue, type AssetFilter } from "./asset-sort";

const FILTERS = [
  ["all", "Tous"],
  ["gain", "En gain"],
  ["loss", "En perte"],
] as const;

interface AssetsTableProps {
  assets: readonly AssetValuationDto[];
  currency: string;
  /** Variations et courbes ; absent tant qu'elles ne sont pas chargées. Le tableau fonctionne sans. */
  trends?: TrendsDto;
  /** Les tendances n'ont pas pu être lues : on le dit, sans empêcher d'afficher le portefeuille. */
  trendsFailed?: boolean;
}

/** Les positions du portefeuille, triées par valeur. */
export function AssetsTable({ assets, currency, trends, trendsFailed = false }: AssetsTableProps) {
  const { mask } = usePrivacy();
  const [filter, setFilter] = useState<AssetFilter>("all");
  const visible = filterAssets(sortByValue(assets), filter);

  return (
    <Glass aria-labelledby="assets-title" className="flex flex-col gap-[18px] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="assets-title" className="text-lg font-bold">
            Mes actifs
          </h2>
          <span className="text-[13px] text-muted">
            {visible.length} actif{visible.length > 1 ? "s" : ""} · triés par valeur
          </span>
        </div>
        <Segmented label="Filtrer les actifs" value={filter} onChange={setFilter} options={FILTERS} />
      </div>

      {assets.length === 0 ? (
        <p className="py-6 text-center text-muted">
          Aucune position pour l’instant. Les actifs que vous déclarerez apparaîtront ici.
        </p>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-muted">Aucun actif ne correspond à ce filtre.</p>
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="text-right text-xs text-muted">
                <th scope="col" className="px-3 py-2 text-left font-semibold">
                  Actif
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Quantité
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Prix
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  24 h
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  7 jours
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Valeur
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  P&amp;L
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Part
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((asset) => (
                <tr key={asset.symbol} className="border-t border-line hover:bg-surface">
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 items-center justify-center rounded-[11px] text-xs font-extrabold"
                        style={{
                          color: `hsl(${assetHue(asset.symbol)} 60% 72%)`,
                          background: `hsl(${assetHue(asset.symbol)} 60% 68% / 0.14)`,
                        }}
                      >
                        {assetBadge(asset.symbol)}
                      </span>
                      <span className="font-bold">{asset.symbol}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-ink-soft">{mask(formatQuantity(asset.quantity))}</td>
                  <td className="px-3 py-3.5 text-right font-semibold tabular-nums">
                    {formatPrice(asset.currentPrice, currency)}
                  </td>
                  <TrendCells symbol={asset.symbol} trends={trends} />
                  <td className="px-3 py-3.5 text-right font-bold tabular-nums">{mask(formatMoney(asset.value, currency))}</td>
                  <td className="px-3 py-3.5 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span className={`font-bold ${TONE_CLASS[tone(asset.pnl)]}`}>{mask(formatSigned(asset.pnl, currency))}</span>
                      <span className="text-xs text-muted">{asset.pnl === null ? "—" : formatPercent(asset.pnlPct)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-ink-soft">{formatWeight(asset.weightPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assets.length > 0 && (trendsFailed || (trends && !trends.complete)) && (
        <p role="status" className="text-[13px] text-muted">
          {trendsFailed
            ? "Les variations et courbes sont indisponibles pour le moment."
            : "Certaines courbes sont indisponibles pour le moment."}
        </p>
      )}
    </Glass>
  );
}

/** Variation sur 24 h et courbe de 7 jours d'un actif ; « — » sans donnée (stablecoin, actif récent, source en panne). */
function TrendCells({ symbol, trends }: { symbol: string; trends?: TrendsDto }) {
  const trend = trendOf(trends, symbol);
  const week = trend?.change7dPct ?? null;
  return (
    <>
      <td className={`px-3 py-3.5 text-right font-semibold tabular-nums ${trend?.change24hPct ? TONE_CLASS[tone(trend.change24hPct)] : "text-muted"}`}>
        {trend?.change24hPct ? formatPercent(trend.change24hPct) : "—"}
      </td>
      <td className="px-3 py-3.5 text-right">
        {trend && trend.sparkline.length > 1 ? (
          <Sparkline
            values={trend.sparkline}
            // Sans variation sur 7 jours, l'actif est coté depuis moins d'une semaine : on ne prétend pas le contraire.
            label={week ? `${symbol} sur 7 jours : ${formatPercent(week)}` : `${symbol} depuis son introduction récente`}
          />
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </>
  );
}
