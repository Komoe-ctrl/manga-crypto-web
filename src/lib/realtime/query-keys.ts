import type { RealtimeEventMessage } from "./realtime-connection";

/**
 * Clés de cache TanStack Query, regroupées ici pour que les données et le temps réel parlent des mêmes clés.
 * Chaque événement du serveur invalide les données qu'il rend périmées : on **relit par l'API** plutôt que de
 * reconstruire l'état à partir de l'événement (l'API reste la seule source de vérité).
 */
export const queryKeys = {
  portfolio: ["portfolio"] as const,
  orders: ["orders"] as const,
  risk: ["risk"] as const,
  notifications: ["notifications"] as const,
  settings: ["settings"] as const,
  digests: ["digests"] as const,
  push: ["push"] as const,
};

/** Données à relire quand ce message arrive. */
export function keysToInvalidate(message: RealtimeEventMessage): readonly (readonly string[])[] {
  switch (message.event) {
    case "order":
      // Un ordre exécuté change le portefeuille (quantités, USDT) : l'événement part après la mise à jour de celui-ci.
      return [queryKeys.orders, queryKeys.portfolio];
    case "risk":
      return [queryKeys.risk];
    case "notification":
      // Le rapport du matin est annoncé par une notification : on relit aussi les rapports (et leur pastille « Nouveau »).
      return [queryKeys.notifications, queryKeys.digests];
  }
}

/** Tout ce que le serveur peut avoir changé : à relire à chaque (re)connexion, car aucun événement n'est rejoué. */
export const ALL_KEYS: readonly (readonly string[])[] = Object.values(queryKeys);
