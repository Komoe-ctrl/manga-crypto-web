"use client";

import { useSyncExternalStore } from "react";

/** Événement non standard de Chrome et Edge : le navigateur propose d'installer l'application, on peut déclencher l'invite. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type Platform = "ios" | "android" | "desktop";

/**
 * Plateforme d'après le navigateur. Un iPad récent se présente comme un Mac : on le reconnaît à son écran tactile.
 * Détection par l'agent utilisateur, donc approximative : elle ne sert qu'à choisir le texte d'aide.
 */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "desktop";
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * À appeler une fois au démarrage de l'application : le navigateur n'envoie `beforeinstallprompt` qu'une fois, souvent
 * avant que l'utilisateur n'ouvre les Réglages ; il faut donc l'écouter dès le départ et garder l'événement.
 * Renvoie la fonction qui arrête l'écoute.
 */
export function startInstallCapture(): () => void {
  const onPrompt = (event: Event) => {
    event.preventDefault(); // on garde l'invite pour la montrer à notre façon, dans les Réglages
    deferred = event as BeforeInstallPromptEvent;
    notify();
  };
  const onInstalled = () => {
    deferred = null;
    notify();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

/** Pour les tests : oublie l'invite gardée. */
export function resetInstallForTests(): void {
  deferred = null;
  listeners.clear();
}

/** Lancée depuis un écran de l'application (déjà « installée » : ouverte sans barre d'adresse). */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true; // Safari sur iPhone
  return ios || (!!window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}

export interface InstallState {
  /** L'application est déjà ouverte comme une application installée. */
  standalone: boolean;
  /** Le navigateur propose l'installation en un clic (Chrome, Edge) : le bouton peut s'afficher. */
  canPrompt: boolean;
  platform: Platform;
  /** Ouvre l'invite d'installation du navigateur ; `null` s'il n'y en a pas. */
  prompt: () => Promise<"accepted" | "dismissed" | null>;
}

export function useInstall(): InstallState {
  const standalone = useSyncExternalStore(subscribe, isStandalone, () => false);
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const platform = useSyncExternalStore(
    subscribe,
    () => detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
    () => "desktop" as Platform,
  );

  return {
    standalone,
    canPrompt,
    platform,
    prompt: async () => {
      const event = deferred;
      if (!event) return null;
      await event.prompt();
      const { outcome } = await event.userChoice;
      deferred = null; // l'invite ne peut servir qu'une fois
      notify();
      return outcome;
    },
  };
}
