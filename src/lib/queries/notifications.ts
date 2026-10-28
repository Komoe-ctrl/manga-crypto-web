import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsControllerList, notificationsControllerRead, notificationsControllerReadAll } from "@/lib/api/sdk.gen";
import type { NotificationDto } from "@/lib/api/types.gen";
import { queryKeys } from "@/lib/realtime/query-keys";

/**
 * Boîte de réception, page après page (les plus récentes d'abord). Le temps réel invalide déjà `notifications` : une
 * notification qui arrive s'ajoute toute seule. `unreadCount` vient de la première page : l'API compte **toutes** les
 * non lues, quelle que soit la page lue ou le filtre.
 */
export function useNotifications({ unreadOnly = false, pageSize = 20 }: { unreadOnly?: boolean; pageSize?: number } = {}) {
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.notifications, "list", { unreadOnly, pageSize }],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await notificationsControllerList({
          query: {
            limit: pageSize,
            before: pageParam,
            unread: unreadOnly || undefined,
          },
          throwOnError: true,
        })
      ).data,
    // Une page pleine laisse supposer qu'il en reste : la suivante part de la date de la dernière notification lue.
    getNextPageParam: (last) => (last.items.length === pageSize ? last.items[last.items.length - 1].createdAt : undefined),
  });

  const items: NotificationDto[] = query.data?.pages.flatMap((page) => page.items) ?? [];
  return {
    ...query,
    items,
    unreadCount: query.data?.pages[0]?.unreadCount ?? 0,
  };
}

/** Nombre de notifications non lues (cloche de l'en-tête) : une seule petite requête, indépendante de la page ouverte. */
export function useUnreadNotifications(): number {
  const { data } = useQuery({
    queryKey: [...queryKeys.notifications, "unread-count"],
    queryFn: async () =>
      (
        await notificationsControllerList({
          query: { limit: 1, unread: true },
          throwOnError: true,
        })
      ).data,
  });
  return data?.unreadCount ?? 0;
}

/** Marque une notification comme lue, puis relit la boîte (liste et compteur de la cloche). */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await notificationsControllerRead({ path: { id }, throwOnError: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}

/** Marque tout comme lu. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await notificationsControllerReadAll({ throwOnError: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}
