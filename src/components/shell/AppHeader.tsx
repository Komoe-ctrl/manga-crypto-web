"use client";

import { Eye, EyeOff, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-provider";
import { usePrivacy } from "@/lib/privacy";
import { AppNav } from "./AppNav";
import { useRealtimeStatus } from "@/lib/realtime/realtime-provider";

const LIVE_LABEL = { open: "En direct", connecting: "Connexion…", reconnecting: "Reconnexion…", idle: "" } as const;

/** En-tête : identité, état du direct, masquage des montants et déconnexion. */
export function AppHeader() {
  const { state, logout } = useAuth();
  const { hidden, toggle } = usePrivacy();
  const status = useRealtimeStatus();

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-accent">
          <Eye className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-extrabold tracking-tight">Veille</span>
          <span className="text-xs text-muted">Votre portefeuille veille pour vous</span>
        </div>
      </div>

      <AppNav />

      <div className="flex items-center gap-2.5">
        {status !== "idle" && (
          <span role="status" className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${status === "open" ? "bg-accent" : "bg-muted"}`} aria-hidden="true" />
            {LIVE_LABEL[status]}
          </span>
        )}
        {state.status === "authenticated" && <span className="hidden text-sm text-muted sm:inline">{state.user.email}</span>}
        <button
          type="button"
          onClick={toggle}
          aria-label={hidden ? "Afficher les montants" : "Masquer les montants"}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink-soft hover:bg-white/[0.07]"
        >
          {hidden ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-bold text-ink-soft hover:bg-white/[0.07]"
        >
          <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          Se déconnecter
        </button>
      </div>
    </header>
  );
}
