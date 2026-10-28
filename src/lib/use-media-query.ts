"use client";

import { useSyncExternalStore } from "react";

/**
 * Vrai quand la requête CSS correspond (ex. `(max-width: 767px)`), et se met à jour si la fenêtre change.
 * Côté serveur et à la première peinture avant hydratation : `false` (mise en page large) ; le navigateur corrige ensuite.
 * Sans `matchMedia` (certains tests) : `false`.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches,
    () => false,
  );
}

/** Téléphone en portrait : en dessous du point de rupture `md` de Tailwind (768 px). */
export const NARROW = "(max-width: 767px)";
