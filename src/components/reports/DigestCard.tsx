"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Glass } from "@/components/ui/glass";
import { Segmented } from "@/components/ui/segmented";
import type { DigestDto } from "@/lib/api/types.gen";
import { useMarkDigestRead } from "@/lib/queries/digests";
import { formatDateTime, formatShortDate } from "@/lib/time";

type Tab = "today" | "yesterday" | "week";

const TABS = [
  ["today", "Ce matin"],
  ["yesterday", "Hier"],
  ["week", "7 jours"],
] as const;

interface Props {
  /** Rapports du matin, du plus récent au plus ancien : le premier est « ce matin », le deuxième « hier ». */
  daily: readonly DigestDto[];
  weekly: readonly DigestDto[];
  timeZone?: string;
  /** Heure du prochain rapport, pour l'état vide (« 08:00 »). */
  nextReportTime: string;
}

function meta(digest: DigestDto, timeZone?: string): string {
  if (digest.period === "WEEK") {
    return `Synthèse hebdomadaire · du ${formatShortDate(digest.periodStart, timeZone)} au ${formatShortDate(digest.periodEnd, timeZone)}`;
  }
  return `Généré le ${formatDateTime(digest.generatedAt, timeZone)}`;
}

/** Rapport automatique : synthèse, points clés, état de lecture. */
export function DigestCard({ daily, weekly, timeZone, nextReportTime }: Props) {
  const [tab, setTab] = useState<Tab>("today");
  const markRead = useMarkDigestRead();
  const digest = tab === "today" ? daily[0] : tab === "yesterday" ? daily[1] : weekly[0];
  const read = digest?.readAt != null;

  return (
    <Glass aria-labelledby="digest-title" className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-calm/[0.14] text-calm">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 id="digest-title" className="text-lg font-bold">
              Rapport automatique
            </h2>
            <span className="text-[13px] text-muted">{digest ? meta(digest, timeZone) : "Aucun rapport pour cette période"}</span>
          </div>
        </div>
        {digest && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${read ? "bg-white/5 text-muted" : "bg-calm/[0.14] text-calm"}`}>
            {read ? "Lu" : "Nouveau"}
          </span>
        )}
      </div>

      <Segmented label="Période du rapport" value={tab} onChange={setTab} options={TABS} />

      {digest ? (
        <>
          <p className="text-base leading-relaxed">{digest.summary}</p>
          {digest.points.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {digest.points.map((point) => (
                <li key={point} className="flex gap-2.5 text-sm leading-normal text-ink-soft">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <span className="text-xs text-muted">
              {digest.queuedAlertsCount > 0
                ? `${digest.queuedAlertsCount} alerte${digest.queuedAlertsCount > 1 ? "s" : ""} non urgente${digest.queuedAlertsCount > 1 ? "s" : ""} regroupée${digest.queuedAlertsCount > 1 ? "s" : ""} · lecture : ~10 secondes`
                : "Lecture : ~10 secondes"}
            </span>
            {!read && (
              <button
                type="button"
                onClick={() => markRead.mutate(digest.id)}
                disabled={markRead.isPending}
                className="h-11 rounded-xl border border-white/[0.12] px-4 text-[13px] font-semibold hover:bg-white/[0.07] disabled:opacity-60"
              >
                Marquer comme lu
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="py-4 text-ink-soft">
          {tab === "week"
            ? "Le rapport des 7 jours arrive chaque lundi."
            : `Aucun rapport pour l'instant. Le prochain arrive à ${nextReportTime}.`}
        </p>
      )}
    </Glass>
  );
}
