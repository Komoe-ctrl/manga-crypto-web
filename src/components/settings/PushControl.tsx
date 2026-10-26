"use client";

import { usePush, type PushViewState } from "@/lib/push/use-push";
import type { PushSupport } from "@/lib/push/push-support";

const button =
  "min-h-11 rounded-xl border border-white/[0.12] px-4 text-sm font-bold text-ink-soft hover:bg-white/[0.07] disabled:opacity-60";
const primary = "min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-accent-ink hover:brightness-110 disabled:opacity-60";

function unsupportedText(support: PushSupport): string {
  if (support === "insecure_context") return "Les notifications exigent une connexion sécurisée (https).";
  return "Ce navigateur ne gère pas les notifications Push. Sur iPhone, installez d'abord Veille sur l'écran d'accueil.";
}

const TEXT: Record<Exclude<PushViewState, "unsupported">, string> = {
  loading: "Vérification…",
  server_unconfigured: "Le serveur n'est pas encore configuré pour le Push (clés VAPID).",
  blocked: "Notifications bloquées dans ce navigateur. Autorisez-les dans ses réglages, puis rechargez la page.",
  off: "Pas encore activé sur cet appareil.",
  stale: "Cet appareil n'est plus connu du serveur (abonnement révoqué par le navigateur). Réactivez-le.",
  on: "Activé sur cet appareil.",
};

/** Abonnement de l'appareil courant au Push : l'état, ce qu'il faut faire, et le bouton qui le fait. */
export function PushControl() {
  const { state, support, devices, busy, enable, disable } = usePush();
  const text = state === "unsupported" ? unsupportedText(support) : TEXT[state];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-ink-soft" aria-live="polite">
        {text}
        {state === "on" && devices > 1 && ` ${devices} appareils sont abonnés.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {(state === "off" || state === "stale") && (
          <button type="button" onClick={enable} disabled={busy} className={primary}>
            {state === "stale" ? "Réactiver sur cet appareil" : "Activer sur cet appareil"}
          </button>
        )}
        {state === "on" && (
          <button type="button" onClick={disable} disabled={busy} className={button}>
            Désactiver sur cet appareil
          </button>
        )}
      </div>
    </div>
  );
}
