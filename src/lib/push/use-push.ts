"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-error";
import { usePushStatus } from "@/lib/queries/push";
import { queryKeys } from "@/lib/realtime/query-keys";
import { readLocalPushState, pushSupport, type PushSupport } from "./push-support";
import { PushError, subscribeThisDevice, unsubscribeThisDevice } from "./subscribe";

/**
 * - `loading` : on vérifie ;
 * - `unsupported` : ce navigateur ne peut pas (voir `support`) ;
 * - `server_unconfigured` : le serveur n'a pas de clés Push ;
 * - `blocked` : l'utilisateur a refusé les notifications dans le navigateur ;
 * - `off` : possible, pas encore activé sur cet appareil ;
 * - `stale` : cet appareil est abonné mais le serveur ne le connaît plus (abonnement révoqué) : à réactiver ;
 * - `on` : activé sur cet appareil.
 */
export type PushViewState = "loading" | "unsupported" | "server_unconfigured" | "blocked" | "off" | "stale" | "on";

const LOCAL_KEY = [...queryKeys.push, "local"] as const;

const ERRORS: Record<string, string> = {
  denied: "Notifications refusées. Autorisez-les dans les réglages du navigateur, puis réessayez.",
  unsupported: "Ce navigateur ne gère pas les notifications Push.",
  incomplete_subscription: "Le navigateur a renvoyé un abonnement incomplet. Réessayez.",
  browser_refused:
    "Le navigateur a refusé l'abonnement. En navigation privée, le Push n'est pas disponible ; sinon, vérifiez les autorisations du site dans les réglages du navigateur.",
  service_unreachable: "Le service de notifications du navigateur est injoignable. Vérifiez votre connexion (ou un pare-feu), puis réessayez.",
  failed: "Le navigateur n'a pas pu activer les notifications. Réessayez, ou essayez un autre navigateur.",
};

export interface PushView {
  state: PushViewState;
  support: PushSupport;
  /** Appareils que le serveur connaît (5 au plus). */
  devices: number;
  busy: boolean;
  enable: () => void;
  disable: () => void;
}

/** État du Push sur cet appareil, croisé avec celui du serveur, et les deux actions. */
export function usePush(): PushView {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const server = usePushStatus();
  const local = useQuery({ queryKey: LOCAL_KEY, queryFn: readLocalPushState, staleTime: 0 });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: LOCAL_KEY }),
      queryClient.invalidateQueries({ queryKey: queryKeys.push }),
    ]);
  };

  const enable = useMutation({
    mutationFn: async () => {
      const key = server.data?.publicKey;
      if (!key) throw new PushError("unsupported");
      await subscribeThisDevice(key);
    },
    onSuccess: () => notify("Notifications Push activées sur cet appareil"),
    onError: (error) =>
      notify(error instanceof PushError ? ERRORS[error.reason] : apiErrorMessage(error, "Impossible d'activer les notifications."), "error"),
    onSettled: refresh,
  });

  const disable = useMutation({
    mutationFn: unsubscribeThisDevice,
    onSuccess: () => notify("Notifications Push désactivées sur cet appareil"),
    onError: (error) => notify(apiErrorMessage(error, "Impossible de désactiver les notifications."), "error"),
    onSettled: refresh,
  });

  return {
    state: derive(server.data, local.data, server.isPending || local.isPending),
    support: pushSupport(),
    devices: server.data?.subscriptions ?? 0,
    busy: enable.isPending || disable.isPending,
    enable: () => enable.mutate(),
    disable: () => disable.mutate(),
  };
}

function derive(
  server: { configured: boolean; subscriptions: number } | undefined,
  local: "unsupported" | "blocked" | "off" | "on" | undefined,
  pending: boolean,
): PushViewState {
  if (pending || !server || !local) return "loading";
  if (local === "unsupported") return "unsupported";
  if (!server.configured) return "server_unconfigured";
  if (local === "blocked") return "blocked";
  if (local === "on") return server.subscriptions > 0 ? "on" : "stale";
  return "off";
}
