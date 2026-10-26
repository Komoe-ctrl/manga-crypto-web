"use client";

import { Glass } from "@/components/ui/glass";
import { useAuth } from "@/lib/auth/auth-provider";
import { useDailyDigests, useWeeklyDigests } from "@/lib/queries/digests";
import { useSettings } from "@/lib/queries/settings";
import { minutesToTime } from "@/lib/time";
import { DigestCard } from "./DigestCard";
import { DigestHistory } from "./DigestHistory";

/** Rapports : celui du matin, d'hier, des 7 jours, et l'historique. */
export function ReportsPage() {
  const { state } = useAuth();
  const daily = useDailyDigests();
  const weekly = useWeeklyDigests();
  const settings = useSettings();
  const timeZone = state.status === "authenticated" ? state.user.timezone : undefined;

  if (daily.isPending || weekly.isPending) {
    return (
      <Glass aria-busy="true" className="p-7 text-muted">
        Chargement de vos rapports…
      </Glass>
    );
  }
  if (daily.error || weekly.error || !daily.data || !weekly.data) {
    return (
      <Glass role="alert" className="flex flex-col items-start gap-4 p-7">
        <p className="text-loss">Impossible de charger vos rapports.</p>
        <button
          type="button"
          onClick={() => {
            void daily.refetch();
            void weekly.refetch();
          }}
          className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold text-ink-soft hover:bg-surface"
        >
          Réessayer
        </button>
      </Glass>
    );
  }

  const nextReportTime = minutesToTime(settings.data?.digestMinute ?? 480);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <DigestCard daily={daily.data.items} weekly={weekly.data.items} timeZone={timeZone} nextReportTime={nextReportTime} />
      <DigestHistory digests={daily.data.items} timeZone={timeZone} />
    </div>
  );
}
