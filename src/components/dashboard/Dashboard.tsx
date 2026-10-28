"use client";

import { BotStatusCard } from "@/components/bot/BotStatusCard";
import { AssetDialog } from "@/components/portfolio/AssetDialog";
import { OperationsCard } from "@/components/portfolio/OperationsCard";
import { PositionDialog } from "@/components/portfolio/PositionDialog";
import { OrdersCard } from "@/components/orders/OrdersCard";
import { useState } from "react";
import { Glass } from "@/components/ui/glass";
import { CardLoading } from "@/components/ui/query-state";
import { usePortfolio } from "@/lib/queries/portfolio";
import type { PositionMode } from "@/lib/positions";
import { marketState, trendOf, useTrends } from "@/lib/queries/trends";
import { AssetsTable } from "./AssetsTable";
import { PortfolioChart } from "./PortfolioChart";
import { WalletHeader } from "./WalletHeader";

/** Tableau de bord : valeur du portefeuille, répartition et positions. */
export function Dashboard() {
  const { data: portfolio, error, isPending, refetch, isFetching } = usePortfolio();
  // Les tendances n'empêchent jamais d'afficher le portefeuille : en cas d'échec, seules les courbes manquent.
  const trends = useTrends();
  // `symbol` absent : nouvelle opération ; présent : correction de cette position.
  const [dialog, setDialog] = useState<{ symbol?: string; mode?: PositionMode } | null>(null);
  // Fiche d'un actif ouverte (son symbole), sinon `null`.
  const [detail, setDetail] = useState<string | null>(null);

  // Seulement tant qu'on n'a AUCUNE donnée : une relecture en arrière-plan qui échoue ne remplace jamais un portefeuille déjà là.
  if (isPending && !portfolio) return <CardLoading>Chargement de votre portefeuille…</CardLoading>;

  if (!portfolio) {
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

  // Une position retirée ou corrigée pendant que sa fiche est ouverte : si l'actif n'existe plus, la fiche disparaît.
  const detailAsset = detail ? portfolio.assets.find((a) => a.symbol === detail) : undefined;

  const trendStatus = trends.data ? "ready" : trends.isError ? "unavailable" : "loading";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <BotStatusCard />
      {error && (
        // Les prix se relisent seuls toutes les 30 s : si une lecture échoue, on garde les derniers chiffres et on le dit.
        <p role="status" className="text-sm text-muted">
          Actualisation impossible pour le moment : les chiffres affichés datent de la dernière lecture réussie.
        </p>
      )}
      <WalletHeader
        portfolio={portfolio}
        market={trends.data ? { state: marketState(trends.data), btcChange24hPct: trends.data.market.btcChange24hPct } : undefined}
        chart={<PortfolioChart assets={portfolio.assets} trends={trends.data} status={trendStatus} currency={portfolio.currency} />}
      />
      <AssetsTable
        assets={portfolio.assets}
        currency={portfolio.currency}
        trends={trends.data}
        trendsFailed={trends.isError && !trends.data}
        onAdd={() => setDialog({})}
        onEdit={(symbol) => setDialog({ symbol })}
        onOpen={setDetail}
      />
      <OrdersCard />
      <OperationsCard currency={portfolio.currency} />

      {detailAsset && (
        <AssetDialog
          key={detailAsset.symbol}
          asset={detailAsset}
          trend={trendOf(trends.data, detailAsset.symbol)}
          currency={portfolio.currency}
          onClose={() => setDetail(null)}
          // La fiche cède la place à la fenêtre de déclaration : une seule fenêtre à la fois.
          onAction={(mode) => {
            setDetail(null);
            setDialog({ symbol: detailAsset.symbol, mode });
          }}
        />
      )}

      {dialog && (
        <PositionDialog
          key={`${dialog.symbol ?? "nouvelle"}-${dialog.mode ?? "auto"}`}
          mode={dialog.mode}
          holdings={portfolio.assets}
          currency={portfolio.currency}
          symbol={dialog.symbol}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
