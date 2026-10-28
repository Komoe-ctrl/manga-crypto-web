"use client";

import { History } from "lucide-react";
import { useState } from "react";
import { OperationsList, RealizedTotal } from "@/components/portfolio/OperationsList";
import { PageColumn, PageHeader } from "@/components/shell/PageHeader";
import { Glass } from "@/components/ui/glass";
import { CardError, CardLoading } from "@/components/ui/query-state";
import { useOperations } from "@/lib/queries/operations";
import { usePortfolio } from "@/lib/queries/portfolio";

const field =
  "h-12 w-full rounded-xl border border-white/[0.12] bg-field px-3.5 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-64";

/**
 * Tout l'historique : achats, ventes, corrections, retraits et ordres exécutés, du plus récent au plus ancien, avec le
 * résultat réalisé cumulé (de tout le journal, ou de l'actif choisi : il ne dépend pas du nombre de pages chargées).
 */
export function HistoryPage() {
  const [symbol, setSymbol] = useState("");
  const portfolio = usePortfolio();
  const { items, realizedTotal, isPending, error, refetch, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage } = useOperations({
    symbol: symbol || undefined,
  });
  const currency = portfolio.data?.currency ?? "USD";

  // Les actifs proposés : ceux du portefeuille, et ceux déjà vus dans l'historique (un actif retiré y reste consultable).
  const symbols = [...new Set([...(portfolio.data?.assets ?? []).map((a) => a.symbol), ...items.map((i) => i.symbol), ...(symbol ? [symbol] : [])])].sort();

  return (
    <PageColumn>
      <PageHeader icon={History} title="Historique" description="Tout ce qui a bougé dans votre portefeuille." />
      <Glass aria-labelledby="history-title" className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="history-title" className="text-lg font-bold">
              Historique des opérations
            </h2>
            <p className="text-[13px] text-muted">Achats, ventes, corrections, retraits et ordres exécutés.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="history-symbol" className="text-[13px] font-semibold text-ink-soft">
              Actif
            </label>
            <select id="history-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} className={field}>
              <option value="">Tous les actifs</option>
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isPending ? (
          <CardLoading>Chargement de l’historique…</CardLoading>
        ) : error || realizedTotal === null ? (
          <CardError onRetry={() => void refetch()} retrying={isFetching}>
            Impossible de charger l’historique des opérations.
          </CardError>
        ) : (
          <>
            <RealizedTotal value={realizedTotal} currency={currency} label={symbol ? `Résultat réalisé sur ${symbol}` : undefined} />
            {items.length === 0 ? (
              <p className="text-sm text-muted">
                {symbol
                  ? `Aucune opération sur ${symbol}.`
                  : "Aucune opération enregistrée pour l’instant. L’historique commence à la mise en service : les positions déclarées avant n’y figurent pas."}
              </p>
            ) : (
              <OperationsList items={items} currency={currency} label="Opérations" />
            )}
            {hasNextPage && (
              <div>
                <button
                  type="button"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="min-h-11 rounded-xl border border-line px-5 text-sm font-bold text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
                >
                  {isFetchingNextPage ? "Chargement…" : "Voir plus"}
                </button>
              </div>
            )}
          </>
        )}
      </Glass>
    </PageColumn>
  );
}
