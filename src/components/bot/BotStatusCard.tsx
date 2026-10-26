"use client";

import { OctagonX, Play, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Glass } from "@/components/ui/glass";
import { CardError, CardLoading } from "@/components/ui/query-state";
import type { TradingStatusDto } from "@/lib/api/types.gen";
import { formatDateTime } from "@/lib/time";
import { useKillSwitch, useTradingStatus } from "@/lib/queries/risk";

const button =
  "min-h-11 rounded-xl px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

/** Ce que dit la carte : l'état du robot en une phrase, d'après `canTrade` et la raison donnée par l'API. */
export function describeStatus(status: TradingStatusDto): { title: string; detail: string; tone: "ok" | "stopped" } {
  if (status.canTrade) {
    return {
      title: "Le robot est actif",
      detail: status.tradingMode === "PAPER" ? "Mode simulation : les ordres sont fictifs, aucun argent réel n'est engagé." : "Mode réel : les ordres engagent de l'argent réel.",
      tone: "ok",
    };
  }
  if (status.blockedReason === "KILL_SWITCH") {
    return {
      title: "Le robot est arrêté",
      detail: status.killSwitchAt ? `Arrêt d'urgence activé le ${formatDateTime(status.killSwitchAt)}. Aucun ordre ne part.` : "Arrêt d'urgence activé. Aucun ordre ne part.",
      tone: "stopped",
    };
  }
  return {
    title: "Le robot est en pause",
    detail: status.botPausedUntil
      ? `Perte journalière maximale atteinte. Reprise automatique le ${formatDateTime(status.botPausedUntil)}.`
      : "Perte journalière maximale atteinte.",
    tone: "stopped",
  };
}

/** État du robot et arrêt d'urgence : l'arrêt est immédiat, la reprise demande une confirmation. */
export function BotStatusCard() {
  const { data: status, error, isPending, refetch, isFetching } = useTradingStatus();
  const killSwitch = useKillSwitch();
  const [confirmResume, setConfirmResume] = useState(false);

  if (isPending) return <CardLoading>Chargement de l’état du robot…</CardLoading>;
  if (error || !status) {
    return (
      <CardError onRetry={() => void refetch()} retrying={isFetching}>
        Impossible de charger l’état du robot.
      </CardError>
    );
  }

  const { title, detail, tone } = describeStatus(status);
  const Icon = tone === "ok" ? ShieldCheck : OctagonX;

  return (
    <Glass aria-labelledby="bot-title" className={`flex flex-col gap-4 p-6 ${tone === "stopped" ? "border-loss/40" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone === "ok" ? "bg-calm/[0.14] text-calm" : "bg-loss/10 text-loss"}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 id="bot-title" className="text-[15px] font-bold">
              {title}
            </h2>
            <p className="text-[13px] text-muted">{detail}</p>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${status.tradingMode === "LIVE" ? "bg-loss/10 text-loss" : "bg-white/[0.08] text-ink-soft"}`}
        >
          {status.tradingMode === "LIVE" ? "Réel" : "Simulation"}
        </span>
      </div>

      {status.killSwitchActive ? (
        confirmResume ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white/[0.04] p-4">
            <p className="text-sm text-ink-soft">Reprendre le trading automatique ? Les ordres pourront de nouveau partir.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={killSwitch.isPending}
                onClick={() => killSwitch.mutate(false, { onSettled: () => setConfirmResume(false) })}
                className={`${button} bg-accent text-accent-ink`}
              >
                Oui, reprendre
              </button>
              <button type="button" onClick={() => setConfirmResume(false)} className={`${button} border border-line text-ink-soft hover:bg-surface`}>
                Rester à l’arrêt
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button type="button" onClick={() => setConfirmResume(true)} className={`${button} inline-flex items-center gap-2 border border-line text-ink hover:bg-surface`}>
              <Play className="h-4 w-4" aria-hidden="true" /> Réactiver le robot
            </button>
          </div>
        )
      ) : (
        <div>
          <button
            type="button"
            disabled={killSwitch.isPending}
            onClick={() => killSwitch.mutate(true)}
            className={`${button} inline-flex items-center gap-2 bg-loss/15 text-loss hover:bg-loss/25`}
          >
            <OctagonX className="h-4 w-4" aria-hidden="true" /> {killSwitch.isPending ? "Arrêt en cours…" : "Arrêt d'urgence"}
          </button>
        </div>
      )}
    </Glass>
  );
}
