"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-error";
import {
  CHANNEL_NAME,
  CONDITION_LABEL,
  CONDITION_SHAPE,
  WINDOW_CHOICES,
  toCreateBody,
  validateDraft,
  type AlertDraft,
  type AlertDraftErrors,
  type Condition,
} from "@/lib/alerts";
import { useCreateAlert } from "@/lib/queries/alerts";

const field =
  "h-12 w-full rounded-xl border border-white/[0.12] bg-field px-3.5 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const INITIAL: AlertDraft = { condition: "PRICE_DROP_PCT", assetSymbol: "", threshold: "", windowMinutes: 1440, channel: "PUSH", isCritical: false };

/** Nouvelle alerte : les champs affichés suivent la condition choisie (actif, fenêtre, pourcentage ou prix). */
export function AlertForm({ symbols }: { symbols: string[] }) {
  const create = useCreateAlert();
  const { notify } = useToast();
  const [draft, setDraft] = useState<AlertDraft>(INITIAL);
  const [errors, setErrors] = useState<AlertDraftErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const shape = CONDITION_SHAPE[draft.condition];

  const set = <K extends keyof AlertDraft>(key: K, value: AlertDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    create.mutate(toCreateBody(draft), {
      onSuccess: () => {
        notify("Alerte créée.");
        // On garde la condition et le canal choisis : on en crée souvent plusieurs d'affilée.
        setDraft((d) => ({ ...INITIAL, condition: d.condition, channel: d.channel }));
      },
      onError: (error) => setServerError(apiErrorMessage(error, "Impossible de créer cette alerte.")),
    });
  };

  return (
    <form onSubmit={submit} noValidate aria-labelledby="alert-form-title" className="flex flex-col gap-4">
      <h2 id="alert-form-title" className="text-[13px] font-semibold uppercase tracking-wider text-muted">
        Nouvelle alerte
      </h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="alert-condition" className="text-[13px] font-semibold text-ink-soft">
          Me prévenir quand
        </label>
        <select id="alert-condition" value={draft.condition} onChange={(e) => { set("condition", e.target.value as Condition); setErrors({}); }} className={field}>
          {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABEL[c]}
            </option>
          ))}
        </select>
      </div>

      {shape.asset && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alert-asset" className="text-[13px] font-semibold text-ink-soft">
            Actif
          </label>
          <input
            id="alert-asset"
            list="alert-symbols"
            value={draft.assetSymbol}
            onChange={(e) => set("assetSymbol", e.target.value)}
            autoComplete="off"
            placeholder="BTC"
            aria-invalid={errors.assetSymbol ? true : undefined}
            aria-describedby={errors.assetSymbol ? "alert-asset-error" : undefined}
            className={field}
          />
          <datalist id="alert-symbols">
            {symbols.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {errors.assetSymbol && (
            <p id="alert-asset-error" role="alert" className="text-sm text-loss">
              {errors.assetSymbol}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="alert-threshold" className="text-[13px] font-semibold text-ink-soft">
          {shape.unit === "pct" ? "Seuil (en %)" : "Prix (en USD)"}
        </label>
        <input
          id="alert-threshold"
          inputMode="decimal"
          value={draft.threshold}
          onChange={(e) => set("threshold", e.target.value)}
          autoComplete="off"
          placeholder={shape.unit === "pct" ? "5" : "70000"}
          aria-invalid={errors.threshold ? true : undefined}
          aria-describedby={errors.threshold ? "alert-threshold-error" : undefined}
          className={`${field} tabular-nums`}
        />
        {errors.threshold && (
          <p id="alert-threshold-error" role="alert" className="text-sm text-loss">
            {errors.threshold}
          </p>
        )}
      </div>

      {shape.window && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alert-window" className="text-[13px] font-semibold text-ink-soft">
            Sur une durée de
          </label>
          <select id="alert-window" value={draft.windowMinutes} onChange={(e) => set("windowMinutes", Number(e.target.value))} className={field}>
            {WINDOW_CHOICES.map((w) => (
              <option key={w.minutes} value={w.minutes}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="alert-channel" className="text-[13px] font-semibold text-ink-soft">
          Canal
        </label>
        <select id="alert-channel" value={draft.channel} onChange={(e) => set("channel", e.target.value as AlertDraft["channel"])} className={field}>
          {(Object.keys(CHANNEL_NAME) as AlertDraft["channel"][]).map((c) => (
            <option key={c} value={c}>
              {CHANNEL_NAME[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/[0.04] p-3.5">
        <div className="flex flex-col gap-0.5">
          <span id="alert-critical-label" className="text-sm font-bold">
            Alerte critique
          </span>
          <span className="text-[13px] text-muted">Passe même en Mode Nuit.</span>
        </div>
        <Switch checked={draft.isCritical} onChange={(next) => set("isCritical", next)} labelledBy="alert-critical-label" />
      </div>

      {serverError && (
        <p role="alert" className="rounded-xl border border-loss/30 bg-loss/10 p-3 text-sm text-loss">
          {serverError}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={create.isPending}
          className="min-h-11 rounded-xl bg-accent px-5 text-sm font-bold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {create.isPending ? "Création…" : "Créer l'alerte"}
        </button>
      </div>
    </form>
  );
}
