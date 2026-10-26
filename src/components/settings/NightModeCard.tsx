"use client";

import { Moon, Sparkles } from "lucide-react";
import { useState } from "react";
import { Glass } from "@/components/ui/glass";
import { Switch } from "@/components/ui/switch";
import type { NotificationSettingsDto } from "@/lib/api/types.gen";
import { useUpdateSettings } from "@/lib/queries/settings";
import { minutesToTime, timeToMinutes } from "@/lib/time";

const timeField =
  "h-12 w-full rounded-xl border border-white/[0.12] bg-field px-3.5 text-[15px] tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Mode Nuit et rapport du matin : les deux règles qui décident de ce qui peut vous réveiller. */
export function NightModeCard({ settings }: { settings: NotificationSettingsDto }) {
  const update = useUpdateSettings();
  const [rangeError, setRangeError] = useState<string | null>(null);

  const start = minutesToTime(settings.nightStartMinute);
  const end = minutesToTime(settings.nightEndMinute);
  const digest = minutesToTime(settings.digestMinute);

  /** Début ou fin de la nuit : l'API refuse une plage sans durée, on le dit avant d'envoyer. */
  const changeRange = (field: "nightStartMinute" | "nightEndMinute", value: string) => {
    const minutes = timeToMinutes(value);
    if (minutes === null) return; // champ vidé en cours de saisie : on attend une heure complète
    const other = field === "nightStartMinute" ? settings.nightEndMinute : settings.nightStartMinute;
    if (minutes === other) {
      setRangeError("Le début et la fin de la nuit doivent être différents.");
      return;
    }
    setRangeError(null);
    update.mutate({ [field]: minutes });
  };

  return (
    <Glass aria-labelledby="night-title" className="flex flex-col gap-5 p-6">
      <div className={`flex flex-col gap-3 rounded-[18px] border p-4 transition-colors ${settings.nightModeEnabled ? "border-calm/30 bg-calm/[0.08]" : "border-line bg-surface"}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-calm/[0.14] text-calm">
              <Moon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-0.5">
              <h2 id="night-title" className="text-[15px] font-bold">
                Mode Nuit / Tranquillité
              </h2>
              <span className="text-[13px] tabular-nums text-muted">
                {start} → {end} · rapport unique à {digest}
              </span>
            </div>
          </div>
          <Switch
            checked={settings.nightModeEnabled}
            onChange={(next) => update.mutate({ nightModeEnabled: next })}
            labelledBy="night-title"
          />
        </div>
        <p className="text-[13px] leading-relaxed text-ink-soft">
          {settings.nightModeEnabled
            ? `Entre ${start} et ${end}, les alertes non urgentes sont regroupées en un seul rapport à ${digest}. Les alertes critiques continuent de vous réveiller.`
            : "Toutes les alertes actives sont envoyées immédiatement, y compris la nuit."}
        </p>
      </div>

      {settings.nightModeEnabled && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-soft" htmlFor="night-start">
            Début de la nuit
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-soft" htmlFor="night-end">
            Fin de la nuit
          </label>
          <input id="night-start" type="time" value={start} onChange={(e) => changeRange("nightStartMinute", e.target.value)} className={timeField} />
          <input id="night-end" type="time" value={end} onChange={(e) => changeRange("nightEndMinute", e.target.value)} className={timeField} />
          {rangeError && (
            <p role="alert" className="col-span-2 text-sm text-loss">
              {rangeError}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-calm/[0.14] text-calm">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span id="digest-switch-label" className="text-[15px] font-bold">
                Rapport du matin
              </span>
              <span className="text-[13px] text-muted">Une synthèse de la nuit, lisible en dix secondes.</span>
            </div>
          </div>
          <Switch
            checked={settings.digestEnabled}
            onChange={(next) => update.mutate({ digestEnabled: next })}
            labelledBy="digest-switch-label"
          />
        </div>
        {settings.digestEnabled && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="digest-time" className="text-[13px] font-semibold text-ink-soft">
              Heure du rapport
            </label>
            <input
              id="digest-time"
              type="time"
              value={digest}
              onChange={(e) => {
                const minutes = timeToMinutes(e.target.value);
                if (minutes !== null) update.mutate({ digestMinute: minutes });
              }}
              className={timeField}
            />
          </div>
        )}
      </div>
    </Glass>
  );
}
