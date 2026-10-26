"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Glass } from "@/components/ui/glass";
import { CardError, CardLoading } from "@/components/ui/query-state";
import type { RiskSettingsDto, UpdateRiskSettingsDto } from "@/lib/api/types.gen";
import { useRiskSettings, useUpdateRiskSettings } from "@/lib/queries/risk";

const field =
  "h-12 w-full rounded-xl border border-white/[0.12] bg-field px-3.5 text-[15px] tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

interface Guard {
  key: keyof RiskSettingsDto;
  label: string;
  hint: string;
  max: number;
}

const GUARDS: Guard[] = [
  { key: "maxExposurePct", label: "Exposition maximale par position (%)", hint: "Part maximale de votre capital engagée sur un seul actif.", max: 100 },
  { key: "maxDailyLossPct", label: "Perte journalière maximale (%)", hint: "Au-delà, le robot se met en pause jusqu'au lendemain.", max: 100 },
  { key: "defaultStopLossPct", label: "Stop-loss par défaut (%)", hint: "Vente automatique si le prix baisse de ce pourcentage après un achat.", max: 100 },
  { key: "defaultTakeProfitPct", label: "Take-profit par défaut (%)", hint: "Vente automatique si le prix monte de ce pourcentage après un achat.", max: 1000 },
];

/** Pourcentage saisi → nombre, ou message. L'API valide aussi (0,01 à 100, 1000 pour le take-profit). */
function parsePercent(raw: string, max: number): { value: number } | { error: string } {
  const text = raw.trim().replace(",", ".");
  if (text === "" || !/^\d+(?:\.\d+)?$/.test(text)) return { error: "Saisissez un nombre positif." };
  const value = Number(text);
  if (value < 0.01) return { error: "Au moins 0,01 %." };
  if (value > max) return { error: `Au plus ${max} %.` };
  return { value };
}

function GuardField({ guard, saved, onCommit, busy }: { guard: Guard; saved: number; onCommit: (patch: UpdateRiskSettingsDto) => void; busy: boolean }) {
  const [value, setValue] = useState(String(saved).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const id = `risk-${guard.key}`;

  const commit = () => {
    const parsed = parsePercent(value, guard.max);
    if ("error" in parsed) return setError(parsed.error);
    setError(null);
    if (parsed.value !== saved) onCommit({ [guard.key]: parsed.value });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-soft">
        {guard.label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={`${id}-help`}
        className={field}
      />
      <span id={`${id}-help`} className={`text-xs ${error ? "text-loss" : "text-muted"}`} role={error ? "alert" : undefined}>
        {error ?? guard.hint}
      </span>
    </div>
  );
}

/** Garde-fous du robot : ce que l'API vérifie avant chaque ordre. */
export function RiskCard() {
  const { data, error, isPending, refetch, isFetching } = useRiskSettings();
  const update = useUpdateRiskSettings();

  if (isPending) return <CardLoading>Chargement des garde-fous…</CardLoading>;
  if (error || !data) {
    return (
      <CardError onRetry={() => void refetch()} retrying={isFetching}>
        Impossible de charger les garde-fous.
      </CardError>
    );
  }

  return (
    <Glass aria-labelledby="risk-title" className="flex flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-calm/[0.14] text-calm">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 id="risk-title" className="text-[15px] font-bold">
            Garde-fous du robot
          </h2>
          <span className="text-[13px] text-muted">Vérifiés par le serveur avant chaque ordre.</span>
        </div>
      </div>
      {GUARDS.map((guard) => (
        // La clé suit la valeur enregistrée : après une sauvegarde, le champ reprend ce que l'API a retenu.
        <GuardField key={`${guard.key}:${data[guard.key]}`} guard={guard} saved={data[guard.key]} busy={update.isPending} onCommit={(patch) => update.mutate(patch)} />
      ))}
    </Glass>
  );
}
