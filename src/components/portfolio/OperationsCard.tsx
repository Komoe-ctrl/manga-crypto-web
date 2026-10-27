"use client";

import Link from "next/link";
import { Glass } from "@/components/ui/glass";
import { CardError, CardLoading } from "@/components/ui/query-state";
import { useOperations } from "@/lib/queries/operations";
import { OperationsList, RealizedTotal } from "./OperationsList";

const RECENT = 8;

/** Dernières opérations sur le tableau de bord, avec le résultat réalisé cumulé et le lien vers tout l'historique. */
export function OperationsCard({ currency }: { currency: string }) {
  const { items, realizedTotal, isPending, error, refetch, isFetching } = useOperations({ pageSize: RECENT });

  if (isPending) return <CardLoading>Chargement de l’historique…</CardLoading>;
  if (error || realizedTotal === null) {
    return (
      <CardError onRetry={() => void refetch()} retrying={isFetching}>
        Impossible de charger l’historique des opérations.
      </CardError>
    );
  }

  return (
    <Glass aria-labelledby="operations-title" className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="operations-title" className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Dernières opérations
        </h2>
        <Link
          href="/historique"
          className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-bold text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Tout l’historique
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">
          Aucune opération enregistrée pour l’instant. Vos achats, ventes, corrections et ordres apparaîtront ici ; l’historique
          commence à la mise en service, les positions déclarées avant n’y figurent pas.
        </p>
      ) : (
        <>
          <RealizedTotal value={realizedTotal} currency={currency} />
          <OperationsList items={items} currency={currency} label="Dernières opérations" />
        </>
      )}
    </Glass>
  );
}
