"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Glass } from "@/components/ui/glass";
import { Ticker } from "@/components/ui/Ticker";
import type { PortfolioDto } from "@/lib/api/types.gen";
import { TONE_CLASS, formatMoney, formatPercent, formatSigned, tone } from "@/lib/format";
import { usePrivacy } from "@/lib/privacy";
import { AllocationDonut } from "./AllocationDonut";

const MARKET_TEXT = {
  UP: { label: "Marché en hausse", cls: "bg-gain/15 text-gain ring-1 ring-gain/25" },
  DOWN: { label: "Marché en baisse", cls: "bg-loss/15 text-loss ring-1 ring-loss/25" },
  CALM: { label: "Marché calme", cls: "bg-calm/10 text-calm ring-1 ring-calm/20" },
} as const;

interface WalletHeaderProps {
  portfolio: PortfolioDto;
  market?: { state: keyof typeof MARKET_TEXT | null; btcChange24hPct: string | null };
  /** La courbe de valeur sur 7 jours, placée sous le montant (elle dépend des tendances, qui arrivent à part). */
  chart?: ReactNode;
}

/** Carte principale : valeur totale, résultat depuis l'achat, état du marché, courbe de valeur et répartition. */
export function WalletHeader({ portfolio, market, chart }: WalletHeaderProps) {
  const { mask } = usePrivacy();
  const { currency } = portfolio;
  const pnlTone = TONE_CLASS[tone(portfolio.totalPnl)];
  const pillTone = tone(portfolio.totalPnl);
  const pill =
    pillTone === "gain"
      ? "bg-gain/15 text-gain ring-1 ring-gain/25"
      : pillTone === "loss"
        ? "bg-loss/15 text-loss ring-1 ring-loss/25"
        : "bg-white/[0.06] text-ink-soft ring-1 ring-white/10";
  const Arrow = pillTone === "loss" ? ArrowDownRight : ArrowUpRight;

  return (
    <Glass aria-labelledby="wallet-title" className="flex flex-col gap-6 p-6 sm:p-7">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 id="wallet-title" className="text-[13px] font-semibold uppercase tracking-wider text-muted">
            Valeur totale du portefeuille
          </h2>
          <div className="text-4xl font-extrabold leading-tight tracking-tight tabular-nums sm:text-5xl" data-testid="wallet-total">
            <Ticker value={portfolio.totalValue}>{mask(formatMoney(portfolio.totalValue, currency))}</Ticker>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 text-sm">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold tabular-nums ${pill}`}>
              {pillTone !== "neutral" && <Arrow className="h-3.5 w-3.5" aria-hidden="true" />}
              {formatPercent(portfolio.totalPnlPct)} · {mask(formatSigned(portfolio.totalPnl, currency))}
            </span>
            <span className="text-muted">depuis l’achat</span>
            {market?.state && (
              // Descriptif seulement : le BTC sur 24 h, pas un conseil d'achat ou de vente.
              <span
                title="Indicateur descriptif d'après le BTC sur 24 h. Ce n'est pas un conseil d'achat ou de vente."
                className={`rounded-full px-2.5 py-1 text-[13px] font-bold sm:ml-auto ${MARKET_TEXT[market.state].cls}`}
              >
                {MARKET_TEXT[market.state].label}
                {market.btcChange24hPct !== null && <span className="font-semibold tabular-nums"> · BTC {formatPercent(market.btcChange24hPct)} sur 24 h</span>}
              </span>
            )}
          </div>
          {!portfolio.complete && (
            <p role="status" className="text-sm text-loss">
              Le prix d’au moins un actif est indisponible : les totaux sont partiels.
            </p>
          )}
          {chart && <div className="mt-3">{chart}</div>}
        </div>

        <AllocationDonut assets={portfolio.assets} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="P&L total">
          <span className={pnlTone}>{mask(formatSigned(portfolio.totalPnl, currency, 0))}</span>
        </Tile>
        <Tile label="Coût d’achat">{mask(formatMoney(portfolio.totalCost, currency, 0))}</Tile>
        <Tile label="Actifs">{portfolio.assets.length}</Tile>
      </div>
    </Glass>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-lg font-bold tabular-nums">{children}</span>
    </div>
  );
}
