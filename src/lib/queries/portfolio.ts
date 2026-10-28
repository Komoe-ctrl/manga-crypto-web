import { useQuery } from "@tanstack/react-query";
import { portfolioControllerGet } from "@/lib/api/sdk.gen";
import { queryKeys } from "@/lib/realtime/query-keys";

/** Les prix bougent en continu : l'API met la lecture en cache 15 s, on la relit toutes les 30 s (onglet visible seulement). */
const REFRESH_MS = 30_000;

/** Portefeuille valorisé : positions, totaux et part de chaque actif. Se rafraîchit seul pour suivre les prix. */
export function usePortfolio() {
  return useQuery({
    queryKey: queryKeys.portfolio,
    queryFn: async () => (await portfolioControllerGet({ throwOnError: true })).data,
    refetchInterval: REFRESH_MS,
  });
}
