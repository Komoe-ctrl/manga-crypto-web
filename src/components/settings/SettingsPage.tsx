"use client";

import { Glass } from "@/components/ui/glass";
import { useAuth } from "@/lib/auth/auth-provider";
import { useSettings } from "@/lib/queries/settings";
import { ChannelsCard } from "./ChannelsCard";
import { NightModeCard } from "./NightModeCard";

/** Réglages : Mode Nuit, rapport du matin et canaux de notification. */
export function SettingsPage() {
  const { state } = useAuth();
  const { data: settings, error, isPending, refetch, isFetching } = useSettings();

  if (isPending) {
    return (
      <Glass aria-busy="true" className="p-7 text-muted">
        Chargement de vos réglages…
      </Glass>
    );
  }
  if (error || !settings) {
    return (
      <Glass role="alert" className="flex flex-col items-start gap-4 p-7">
        <p className="text-loss">Impossible de charger vos réglages.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold text-ink-soft hover:bg-surface disabled:opacity-60"
        >
          Réessayer
        </button>
      </Glass>
    );
  }

  const accountEmail = state.status === "authenticated" ? state.user.email : "";
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <NightModeCard settings={settings} />
      <ChannelsCard settings={settings} accountEmail={accountEmail} />
    </div>
  );
}
