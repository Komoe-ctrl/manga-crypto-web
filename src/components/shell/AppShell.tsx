"use client";

import type { ReactNode } from "react";
import { NARROW, useMediaQuery } from "@/lib/use-media-query";
import { AppHeader } from "./AppHeader";
import { AppNav } from "./AppNav";

/**
 * Coque des pages connectées : en-tête fixé en haut, contenu, pied de page, et sur téléphone la barre de navigation
 * fixée en bas. La barre du bas est hors de l'en-tête : un parent avec un flou (`backdrop-filter`) servirait de repère
 * à un élément `fixed` et l'enfermerait (le piège déjà rencontré avec les fenêtres).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const narrow = useMediaQuery(NARROW);
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[1280px] px-4 pb-8 pt-6 sm:px-6">{children}</main>
      <footer className={`px-6 text-center text-xs text-muted ${narrow ? "pb-24" : "pb-10"}`}>
        Veille suit votre portefeuille et vous prévient. Elle ne donne pas de conseil financier.
      </footer>
      {narrow && <AppNav variant="bottom" />}
    </>
  );
}
