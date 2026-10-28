"use client";

import { Eye, EyeOff, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-provider";
import { usePrivacy } from "@/lib/privacy";
import { useRealtimeStatus } from "@/lib/realtime/realtime-provider";
import { NARROW, useMediaQuery } from "@/lib/use-media-query";
import { AppNav } from "./AppNav";

const LIVE_LABEL = { open: "En direct", connecting: "Connexion…", reconnecting: "Reconnexion…", idle: "" } as const;

const iconButton =
  "flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-ink-soft transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * En-tête **fixé en haut** (il reste visible quand on fait défiler) : marque, navigation sur ordinateur, état du direct,
 * masquage des montants et déconnexion. Translucide, avec un flou : le contenu passe dessous sans le gêner. Sur
 * téléphone il est léger (la navigation passe dans la barre du bas, voir `MobileNav`).
 */
export function AppHeader() {
  const { state, logout } = useAuth();
  const { hidden, toggle } = usePrivacy();
  const status = useRealtimeStatus();
  const narrow = useMediaQuery(NARROW);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-canvas/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-accent shadow-[0_0_24px_-6px_var(--color-accent)]">
            <Eye className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-lg font-extrabold tracking-tight">Veille</span>
            <span className="hidden text-xs text-muted sm:block">Votre portefeuille veille pour vous</span>
          </div>
        </div>

        {!narrow && <AppNav variant="top" />}

        <div className="flex items-center gap-2">
          {status !== "idle" && (
            <span role="status" className="flex items-center gap-1.5 text-xs text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${status === "open" ? "breathe bg-accent" : "bg-muted"}`} aria-hidden="true" />
              {LIVE_LABEL[status]}
            </span>
          )}
          {state.status === "authenticated" && <span className="hidden text-sm text-muted xl:inline">{state.user.email}</span>}
          <button
            type="button"
            onClick={toggle}
            aria-label={hidden ? "Afficher les montants" : "Masquer les montants"}
            className={`${iconButton} w-10`}
          >
            {hidden ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => void logout()} aria-label="Se déconnecter" className={`${iconButton} w-10 md:w-auto md:px-4 md:text-sm md:font-bold`}>
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="hidden md:inline" aria-hidden="true">
              Se déconnecter
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
