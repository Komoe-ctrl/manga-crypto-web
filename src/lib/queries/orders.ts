import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ordersControllerCreate, ordersControllerList } from "@/lib/api/sdk.gen";
import type { CreateOrderDto } from "@/lib/api/types.gen";
import { queryKeys } from "@/lib/realtime/query-keys";

export const ORDERS_PAGE = 15;

/** Derniers ordres (les plus récents d'abord). */
export function useOrders(limit = ORDERS_PAGE) {
  return useQuery({
    queryKey: [...queryKeys.orders, { limit }],
    queryFn: async () => (await ordersControllerList({ query: { limit }, throwOnError: true })).data,
  });
}

/**
 * Passe un ordre manuel (PAPER seulement : l'API refuse le reste). Un ordre refusé par un garde-fou répond 422 mais
 * est **enregistré** : on relit donc la liste et le portefeuille dans tous les cas.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateOrderDto) => (await ordersControllerCreate({ body, throwOnError: true })).data,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio });
    },
  });
}
