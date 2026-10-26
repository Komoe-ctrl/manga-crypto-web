import { useQuery } from "@tanstack/react-query";
import { portfolioControllerGet } from "@/lib/api/sdk.gen";
import { queryKeys } from "@/lib/realtime/query-keys";

/** Portefeuille valorisé : positions, totaux et part de chaque actif. */
export function usePortfolio() {
  return useQuery({
    queryKey: queryKeys.portfolio,
    queryFn: async () => (await portfolioControllerGet({ throwOnError: true })).data,
  });
}
