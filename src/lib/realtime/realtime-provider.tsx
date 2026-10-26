"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { sessionManager, tokenStore } from "@/lib/auth";
import { useAuth } from "@/lib/auth/auth-provider";
import { WS_URL } from "@/lib/config";
import { ALL_KEYS, keysToInvalidate } from "./query-keys";
import { RealtimeConnection, browserSocket, type RealtimeStatus } from "./realtime-connection";

const RealtimeContext = createContext<RealtimeStatus>("idle");

/**
 * Une connexion par onglet, créée à la demande. Construire l'objet ne touche pas au réseau : `WebSocket` n'est appelé
 * qu'à l'ouverture, dans le navigateur, jamais pendant le rendu côté serveur.
 */
let connection: RealtimeConnection | null = null;
function getConnection(): RealtimeConnection {
  connection ??= new RealtimeConnection({
    url: WS_URL,
    store: tokenStore,
    manager: sessionManager,
    createSocket: browserSocket,
  });
  return connection;
}

const subscribeStatus = (onChange: () => void) => getConnection().subscribe({ onStatus: onChange });
const getStatus = (): RealtimeStatus => getConnection().status;
const getServerStatus = (): RealtimeStatus => "idle";

/**
 * Branche le temps réel sur l'application : tant qu'un utilisateur est connecté, la connexion est ouverte et chaque
 * événement du serveur invalide les données concernées. À chaque (re)connexion, tout est relu : le serveur ne rejoue
 * pas les événements émis pendant une coupure.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { state } = useAuth();
  const authenticated = state.status === "authenticated";
  const status = useSyncExternalStore(subscribeStatus, getStatus, getServerStatus);

  useEffect(() => {
    if (!authenticated) return;
    const realtime = getConnection();
    const unsubscribe = realtime.subscribe({
      onStatus: (next) => {
        if (next === "open") {
          for (const key of ALL_KEYS) void queryClient.invalidateQueries({ queryKey: key });
        }
      },
      onMessage: (message) => {
        for (const key of keysToInvalidate(message)) void queryClient.invalidateQueries({ queryKey: key });
      },
    });
    realtime.start();
    return () => {
      unsubscribe();
      realtime.stop();
    };
  }, [authenticated, queryClient]);

  return <RealtimeContext.Provider value={status}>{children}</RealtimeContext.Provider>;
}

export const useRealtimeStatus = () => useContext(RealtimeContext);
