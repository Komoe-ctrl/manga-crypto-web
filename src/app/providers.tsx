"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { startInstallCapture } from "@/lib/install";
import { PrivacyProvider } from "@/lib/privacy";
import { RealtimeProvider } from "@/lib/realtime/realtime-provider";

let browserQueryClient: QueryClient | undefined;

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Les données arrivent aussi par le temps réel : inutile de relire à chaque fenêtre ou composant monté.
        staleTime: 30_000,
        // Un 401 est déjà traité par le client (renouvellement du jeton) ; les autres erreurs ne se règlent pas en réessayant.
        retry: 1,
      },
    },
  });
}

/** Un client par rendu côté serveur (requêtes isolées), un seul dans le navigateur (le cache survit aux rendus). */
function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  // Le navigateur n'annonce l'installation possible qu'une fois, souvent avant l'ouverture des Réglages : on l'écoute dès le départ.
  useEffect(() => startInstallCapture(), []);

  return (
    <QueryClientProvider client={getQueryClient()}>
      <AuthProvider>
        <PrivacyProvider>
          <RealtimeProvider>
            <ToastProvider>{children}</ToastProvider>
          </RealtimeProvider>
        </PrivacyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
