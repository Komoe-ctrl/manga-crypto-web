"use client";

import { ArrowDownRight, ArrowUpRight, Pencil } from "lucide-react";
import { Sparkline } from "@/components/ui/Sparkline";
import { Ticker } from "@/components/ui/Ticker";
import type { AssetValuationDto, TrendsDto } from "@/lib/api/types.gen";
import { TONE_CLASS, assetBadge, assetHue, formatMoney, formatPercent, formatPrice, formatQuantity, formatSigned, formatWeight, tone } from "@/lib/format";
import { usePrivacy } from "@/lib/privacy";
import { trendOf } from "@/lib/queries/trends";

interface AssetCardsProps {
  assets: readonly AssetValuationDto[];
  currency: string;
  trends?: TrendsDto;
  onEdit?: (symbol: string) => void;
  onOpen?: (symbol: string) => void;
}

/**
 * Les positions sur téléphone : une carte par actif au lieu d'un tableau qui défile horizontalement. Mêmes informations
 * (valeur, résultat, variation 24 h, courbe, quantité, prix, part) et mêmes actions que le tableau, lisibles d'un coup d'œil.
 */
export function AssetCards({ assets, currency, trends, onEdit, onOpen }: AssetCardsProps) {
  const { mask } = usePrivacy();
  return (
    <ul className="flex flex-col gap-3" aria-label="Mes actifs">
      {assets.map((asset) => {
        const trend = trendOf(trends, asset.symbol);
        const change24 = trend?.change24hPct ?? null;
        const week = trend?.change7dPct ?? null;
        const hue = assetHue(asset.symbol);
        const ChangeIcon = change24 && tone(change24) === "loss" ? ArrowDownRight : ArrowUpRight;
        return (
          <li key={asset.symbol} className="flex flex-col gap-3 rounded-2xl border border-line bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold"
                  style={{ color: `hsl(${hue} 60% 72%)`, background: `hsl(${hue} 60% 68% / 0.14)` }}
                >
                  {assetBadge(asset.symbol)}
                </span>
                <div className="flex min-w-0 flex-col">
                  {onOpen ? (
                    <button
                      type="button"
                      onClick={() => onOpen(asset.symbol)}
                      aria-label={`Voir le détail de ${asset.symbol}`}
                      className="self-start text-base font-extrabold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {asset.symbol}
                    </button>
                  ) : (
                    <span className="text-base font-extrabold">{asset.symbol}</span>
                  )}
                  <span className="text-xs tabular-nums text-muted">
                    <Ticker value={asset.currentPrice}>{formatPrice(asset.currentPrice, currency)}</Ticker>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {change24 && (
                  <span className={`inline-flex items-center gap-0.5 text-sm font-bold tabular-nums ${TONE_CLASS[tone(change24)]}`}>
                    <ChangeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatPercent(change24)}
                    <span className="sr-only"> sur 24 h</span>
                  </span>
                )}
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(asset.symbol)}
                    aria-label={`Modifier la position ${asset.symbol}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-end justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xl font-extrabold tabular-nums">
                  <Ticker value={asset.value}>{mask(formatMoney(asset.value, currency))}</Ticker>
                </span>
                <span className={`text-sm font-bold tabular-nums ${TONE_CLASS[tone(asset.pnl)]}`}>
                  {mask(formatSigned(asset.pnl, currency))}
                  <span className="font-normal text-muted">{asset.pnl === null ? "" : ` · ${formatPercent(asset.pnlPct)}`}</span>
                </span>
              </div>
              {trend && trend.sparkline.length > 1 ? (
                <Sparkline
                  values={trend.sparkline}
                  label={week ? `${asset.symbol} sur 7 jours : ${formatPercent(week)}` : `${asset.symbol} depuis son introduction récente`}
                />
              ) : null}
            </div>

            <dl className="flex justify-between gap-3 border-t border-line pt-2.5 text-xs text-muted">
              <div>
                <dt className="sr-only">Quantité</dt>
                <dd className="tabular-nums">{mask(formatQuantity(asset.quantity))} {asset.symbol}</dd>
              </div>
              <div>
                <dt className="sr-only">Part du portefeuille</dt>
                <dd className="tabular-nums">{formatWeight(asset.weightPct)} du portefeuille</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
