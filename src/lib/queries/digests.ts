import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { digestsControllerList, digestsControllerRead } from "@/lib/api/sdk.gen";
import { queryKeys } from "@/lib/realtime/query-keys";

/** Les rapports du matin, du plus récent au plus ancien : le premier est « ce matin », le deuxième « hier ». */
export function useDailyDigests(limit = 14) {
  return useQuery({
    queryKey: [...queryKeys.digests, "TODAY", limit] as const,
    queryFn: async () => (await digestsControllerList({ query: { period: "TODAY", limit }, throwOnError: true })).data,
  });
}

/** Les rapports hebdomadaires (le lundi). */
export function useWeeklyDigests(limit = 4) {
  return useQuery({
    queryKey: [...queryKeys.digests, "WEEK", limit] as const,
    queryFn: async () => (await digestsControllerList({ query: { period: "WEEK", limit }, throwOnError: true })).data,
  });
}

/**
 * Nombre de rapports non lus (pastille de la navigation). L'API compte **tous** les rapports non lus, quelle que soit
 * la période demandée : la liste quotidienne suffit, inutile d'en interroger une seconde.
 */
export function useUnreadDigests(): number {
  return useDailyDigests().data?.unreadCount ?? 0;
}

/** Marque un rapport comme lu, puis relit les listes (badge « Nouveau », pastille de la navigation). */
export function useMarkDigestRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await digestsControllerRead({ path: { id }, throwOnError: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.digests }),
  });
}
