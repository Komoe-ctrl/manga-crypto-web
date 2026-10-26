"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { MASK } from "./format";

const STORAGE_KEY = "veille.hideAmounts";

/**
 * Préférence de masquage des montants (l'œil de la maquette), utile quand on consulte l'écran en public. Gardée dans le
 * navigateur : ce n'est qu'une préférence d'affichage, pas une donnée sensible. Le stockage peut être indisponible
 * (navigation privée, données bloquées) : la préférence vit alors en mémoire pour la durée de la page.
 */
const listeners = new Set<() => void>();
let memory: boolean | null = null;

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const getSnapshot = (): boolean => memory ?? readStored();
/** Côté serveur, rien n'est masqué : la page rendue et celle du navigateur ne divergent donc pas (React réconcilie). */
const getServerSnapshot = (): boolean => false;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Une autre fenêtre change la préférence : on la suit.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      memory = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function setHidden(next: boolean): void {
  memory = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* préférence non mémorisée au-delà de la page, sans conséquence */
  }
  for (const listener of listeners) listener();
}

interface PrivacyValue {
  hidden: boolean;
  toggle: () => void;
  /** Remplace un montant par des points quand l'affichage est masqué. */
  mask: (text: string) => string;
}

const PrivacyContext = createContext<PrivacyValue>({ hidden: false, toggle: () => undefined, mask: (text) => text });

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => setHidden(!getSnapshot()), []);
  const value = useMemo<PrivacyValue>(() => ({ hidden, toggle, mask: (text) => (hidden ? MASK : text) }), [hidden, toggle]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export const usePrivacy = () => useContext(PrivacyContext);

/** Réservé aux tests : remet la préférence à son état initial. */
export function resetPrivacyForTests(): void {
  memory = null;
}
