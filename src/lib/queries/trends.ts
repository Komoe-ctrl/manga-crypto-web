import { useQuery } from "@tanstack/react-query";
import { portfolioControllerGetTrends } from "@/lib/api/sdk.gen";
import type { AssetTrendDto, MarketDto, TrendsDto } from "@/lib/api/types.gen";
import { queryKeys } from "@/lib/realtime/query-keys";

/** L'API met ces données en cache 5 minutes : relire plus souvent ne servirait à rien. */
const REFRESH_MS = 5 * 60_000;

/**
 * Variations, courbes de 7 jours et état du marché. La clé commence par celle du portefeuille : tout ce qui relit le
 * portefeuille (reconnexion du direct, ordre exécuté) relit donc aussi les tendances. Elles ne bloquent jamais
 * l'affichage du portefeuille : un échec n'enlève que les courbes.
 */
export function useTrends() {
  return useQuery({
    queryKey: [...queryKeys.portfolio, "trends"],
    queryFn: async () => (await portfolioControllerGetTrends({ throwOnError: true })).data,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
  });
}

/** Tendance d'un actif, ou `undefined` (stablecoin, tendances pas encore chargées ou absentes). */
export function trendOf(trends: TrendsDto | undefined, symbol: string): AssetTrendDto | undefined {
  return trends?.assets.find((a) => a.symbol === symbol);
}

/**
 * L'API renvoie `state: null` quand le BTC est injoignable, mais le schéma généré le donne comme non nul : on le
 * relit ici pour que l'écran ne suppose pas une valeur qui peut manquer.
 */
export function marketState(trends: TrendsDto | undefined): MarketDto["state"] | null {
  const state = (trends?.market as { state?: MarketDto["state"] | null } | undefined)?.state;
  return state === "UP" || state === "DOWN" || state === "CALM" ? state : null;
}
