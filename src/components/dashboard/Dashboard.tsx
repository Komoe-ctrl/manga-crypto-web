"use client";

import { BotStatusCard } from "@/components/bot/BotStatusCard";
import { PositionDialog } from "@/components/portfolio/PositionDialog";
import { OrdersCard } from "@/components/orders/OrdersCard";
import { useState } from "react";
import { Glass } from "@/components/ui/glass";
import { usePortfolio } from "@/lib/queries/portfolio";
import { marketState, useTrends } from "@/lib/queries/trends";
import { AssetsTable } from "./AssetsTable";
import { WalletHeader } from "./WalletHeader";

/** Tableau de bord : valeur du portefeuille, répartition et positions. */
export function Dashboard() {
  const { data: portfolio, error, isPending, refetch, isFetching } = usePortfolio();
  // Les tendances n'empêchent jamais d'afficher le portefeuille : en cas d'échec, seules les courbes manquent.
  const trends = useTrends();
  // `symbol` absent : nouvelle opération ; présent : correction de cette position.
  const [dialog, setDialog] = useState<{ symbol?: string } | null>(null);

  if (isPending) {
    return (
      <Glass aria-busy="true" className="p-7 text-muted">
        Chargement de votre portefeuille…
      </Glass>
    );
  }

  if (error || !portfolio) {
    return (
      <Glass role="alert" className="flex flex-col items-start gap-4 p-7">
        <p className="text-loss">Impossible de charger votre portefeuille.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold text-ink-soft hover:bg-surface disabled:opacity-60"
        >
          Réessayer
        </button>
      </Glass>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <BotStatusCard />
      <WalletHeader
        portfolio={portfolio}
        market={trends.data ? { state: marketState(trends.data), btcChange24hPct: trends.data.market.btcChange24hPct } : undefined}
      />
      <AssetsTable
        assets={portfolio.assets}
        currency={portfolio.currency}
        trends={trends.data}
        trendsFailed={trends.isError && !trends.data}
        onAdd={() => setDialog({})}
        onEdit={(symbol) => setDialog({ symbol })}
      />
      <OrdersCard />

      {dialog && (
        <PositionDialog
          key={dialog.symbol ?? "nouvelle"}
          holdings={portfolio.assets}
          currency={portfolio.currency}
          symbol={dialog.symbol}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
