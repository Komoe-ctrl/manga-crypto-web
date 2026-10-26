"use client";

import { Glass } from "@/components/ui/glass";
import type { PortfolioDto } from "@/lib/api/types.gen";
import { TONE_CLASS, formatMoney, formatPercent, formatSigned, tone } from "@/lib/format";
import { usePrivacy } from "@/lib/privacy";
import { AllocationBar } from "./AllocationBar";

const MARKET_TEXT = {
  UP: { label: "Marché en hausse", cls: "bg-gain/10 text-gain" },
  DOWN: { label: "Marché en baisse", cls: "bg-loss/10 text-loss" },
  CALM: { label: "Marché calme", cls: "bg-calm/10 text-calm" },
} as const;

/** Carte principale : valeur totale, résultat depuis l'achat, état du marché et répartition. */
export function WalletHeader({ portfolio, market }: { portfolio: PortfolioDto; market?: { state: keyof typeof MARKET_TEXT | null; btcChange24hPct: string | null } }) {
  const { mask } = usePrivacy();
  const { currency } = portfolio;
  const pnlTone = TONE_CLASS[tone(portfolio.totalPnl)];
  const pillTone = tone(portfolio.totalPnl);
  const pill =
    pillTone === "gain" ? "bg-gain/10 text-gain" : pillTone === "loss" ? "bg-loss/10 text-loss" : "bg-white/[0.06] text-ink-soft";

  return (
    <Glass aria-labelledby="wallet-title" className="flex flex-col gap-6 p-7">
      <div className="flex flex-col gap-2">
        <h2 id="wallet-title" className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Valeur totale du portefeuille
        </h2>
        <div className="text-5xl font-extrabold leading-tight tracking-tight tabular-nums" data-testid="wallet-total">
          {mask(formatMoney(portfolio.totalValue, currency))}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          <span className={`rounded-full px-2.5 py-1 font-bold tabular-nums ${pill}`}>
            {formatPercent(portfolio.totalPnlPct)} · {mask(formatSigned(portfolio.totalPnl, currency))}
          </span>
          <span className="text-muted">depuis l’achat</span>
          {market?.state && (
            // Descriptif seulement : le BTC sur 24 h, pas un conseil d'achat ou de vente.
            <span
              title="Indicateur descriptif d'après le BTC sur 24 h. Ce n'est pas un conseil d'achat ou de vente."
              className={`ml-auto rounded-full px-2.5 py-1 text-[13px] font-bold ${MARKET_TEXT[market.state].cls}`}
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
      </div>

      <AllocationBar assets={portfolio.assets} />

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

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-lg font-bold tabular-nums">{children}</span>
    </div>
  );
}
