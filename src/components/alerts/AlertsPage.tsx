"use client";

import { Bell, BellRing, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageColumn, PageHeader } from "@/components/shell/PageHeader";
import { Glass } from "@/components/ui/glass";
import { CardError, CardLoading } from "@/components/ui/query-state";
import { Switch } from "@/components/ui/switch";
import type { AlertDto } from "@/lib/api/types.gen";
import { CHANNEL_NAME, describeAlert } from "@/lib/alerts";
import { usePortfolio } from "@/lib/queries/portfolio";
import { useAlerts, useRemoveAlert, useUpdateAlert } from "@/lib/queries/alerts";
import { formatDateTime } from "@/lib/time";
import { AlertForm } from "./AlertForm";

const DEFAULT_SYMBOLS = ["BTC", "ETH", "SOL"];

function AlertRow({ alert }: { alert: AlertDto }) {
  const update = useUpdateAlert();
  const remove = useRemoveAlert();
  const [confirming, setConfirming] = useState(false);
  const sentence = describeAlert(alert);

  return (
    <li className="flex flex-col gap-2 border-t border-line py-4 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span id={`alert-${alert.id}`} className="font-bold">
            {sentence}
          </span>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted">
            <span>{CHANNEL_NAME[alert.channel]}</span>
            {alert.isCritical && <span className="font-bold text-loss">Critique</span>}
            {!alert.isActive ? (
              <span>En pause</span>
            ) : alert.isTriggered ? (
              <span className="font-bold text-calm">Déclenchée{alert.lastTriggeredAt ? ` le ${formatDateTime(alert.lastTriggeredAt)}` : ""}</span>
            ) : (
              <span>Armée</span>
            )}
          </div>
        </div>
        <Switch checked={alert.isActive} onChange={(next) => update.mutate({ id: alert.id, patch: { isActive: next } })} labelledBy={`alert-${alert.id}`} />
      </div>

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-soft">Supprimer cette alerte ?</span>
          <button
            type="button"
            onClick={() => remove.mutate(alert.id)}
            disabled={remove.isPending}
            className="min-h-10 rounded-lg bg-loss/15 px-3 font-bold text-loss hover:bg-loss/25"
          >
            Oui, supprimer
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="min-h-10 rounded-lg border border-line px-3 font-bold text-ink-soft hover:bg-surface">
            Garder
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Supprimer l'alerte : ${sentence}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-muted hover:text-loss focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer
          </button>
        </div>
      )}
    </li>
  );
}

/** Alertes de prix et de portefeuille : liste (armée / déclenchée / en pause) et création. */
export function AlertsPage() {
  return (
    <PageColumn width="lg">
      <PageHeader icon={Bell} title="Alertes" description="Soyez prévenu sans surveiller les marchés." />
      <AlertsContent />
    </PageColumn>
  );
}

function AlertsContent() {
  const alerts = useAlerts();
  const portfolio = usePortfolio();

  if (alerts.isPending) return <CardLoading>Chargement de vos alertes…</CardLoading>;
  if (alerts.error || !alerts.data) {
    return (
      <CardError onRetry={() => void alerts.refetch()} retrying={alerts.isFetching}>
        Impossible de charger vos alertes.
      </CardError>
    );
  }

  const held = (portfolio.data?.assets ?? []).map((a) => a.symbol).filter((s) => s !== "USDT");
  const symbols = [...new Set([...held, ...DEFAULT_SYMBOLS])];

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,22rem)]">
      <Glass aria-labelledby="alerts-title" className="flex flex-col gap-2 p-6">
        <h2 id="alerts-title" className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Vos alertes
        </h2>
        {alerts.data.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-4 text-sm text-muted">
            <BellRing className="h-6 w-6 text-calm" aria-hidden="true" />
            <p>Aucune alerte. Créez-en une : vous serez prévenu sans avoir à surveiller les marchés.</p>
          </div>
        ) : (
          <ul>
            {alerts.data.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </Glass>
      <Glass className="p-6">
        <AlertForm symbols={symbols} />
      </Glass>
    </div>
  );
}
