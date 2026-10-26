"use client";

import { Check, X } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { CHANNEL_LABEL, describeFailure } from "@/lib/delivery";
import { useSendTest } from "@/lib/queries/settings";

/** Envoie un message de test sur les canaux activés et dit, canal par canal, ce qui a marché et ce qui manque. */
export function TestMessage() {
  const test = useSendTest();
  const deliveries = test.data?.deliveries;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted">Vérifiez que vos canaux fonctionnent.</span>
        <button
          type="button"
          onClick={() => test.mutate()}
          disabled={test.isPending}
          className="min-h-11 rounded-xl border border-white/[0.12] px-4 text-sm font-bold text-ink-soft hover:bg-white/[0.07] disabled:opacity-60"
        >
          {test.isPending ? "Envoi…" : "Envoyer un message de test"}
        </button>
      </div>

      {test.isError && (
        <p role="alert" className="text-sm text-loss">
          {apiErrorMessage(test.error, "Le message de test n'a pas pu être envoyé.")}
        </p>
      )}

      {deliveries && (
        <ul aria-label="Résultat du message de test" className="flex flex-col gap-2">
          {deliveries.length === 0 && <li className="text-sm text-ink-soft">Aucun canal activé : activez-en un ci-dessus.</li>}
          {deliveries.map((delivery) => (
            <li key={delivery.channel} className="flex items-start gap-2.5 text-sm">
              {delivery.status === "SENT" ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-gain" aria-hidden="true" />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-loss" aria-hidden="true" />
              )}
              <span>
                <span className="font-bold">{CHANNEL_LABEL[delivery.channel]}</span>{" "}
                <span className={delivery.status === "SENT" ? "text-ink-soft" : "text-loss"}>
                  {delivery.status === "SENT" ? "envoyé" : describeFailure(delivery.reason)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
