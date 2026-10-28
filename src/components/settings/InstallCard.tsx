"use client";

import { Check, Smartphone } from "lucide-react";
import { Glass } from "@/components/ui/glass";
import { useToast } from "@/components/ui/toast";
import { useInstall, type Platform } from "@/lib/install";

const HELP: Record<Platform, string> = {
  ios: "Dans Safari : touchez Partager, puis « Sur l’écran d’accueil ». Sur iPhone, c’est aussi ce qui permet de recevoir les alertes (iOS 16.4 ou plus récent).",
  android: "Dans Chrome : ouvrez le menu (⋮), puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».",
  desktop: "Dans Chrome ou Edge : cliquez sur l’icône d’installation, à droite de la barre d’adresse.",
};

/**
 * Installer Veille sur l'écran d'accueil : elle s'ouvre alors comme une application, sans barre d'adresse. Sur iPhone,
 * c'est aussi la condition pour recevoir les alertes (notifications Push). Chrome et Edge proposent un bouton
 * d'installation ; Safari n'en a pas : on explique le geste.
 */
export function InstallCard() {
  const { standalone, canPrompt, platform, prompt } = useInstall();
  const { notify } = useToast();

  return (
    <Glass aria-labelledby="install-title" className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/[0.14] text-accent">
          {standalone ? <Check className="h-5 w-5" aria-hidden="true" /> : <Smartphone className="h-5 w-5" aria-hidden="true" />}
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 id="install-title" className="text-[15px] font-bold">
            Application sur téléphone
          </h2>
          <span className="text-[13px] text-muted">Ouvrez Veille comme une application, depuis votre écran d’accueil.</span>
        </div>
      </div>

      {standalone ? (
        <p className="text-[13px] leading-relaxed text-ink-soft">Veille est installée sur cet appareil.</p>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-ink-soft">{HELP[platform]}</p>
          {canPrompt && (
            <div>
              <button
                type="button"
                onClick={async () => {
                  const outcome = await prompt();
                  if (outcome === "accepted") notify("Veille est en cours d’installation.");
                }}
                className="min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-accent-ink hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Installer l’application
              </button>
            </div>
          )}
        </>
      )}
    </Glass>
  );
}
