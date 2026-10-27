import { useInfiniteQuery } from "@tanstack/react-query";
import { portfolioControllerOperations } from "@/lib/api/sdk.gen";
import type { OperationDto } from "@/lib/api/types.gen";
import { queryKeys } from "@/lib/realtime/query-keys";

interface Options {
  /** Un seul actif ; absent : toutes les opérations. */
  symbol?: string;
  /** Taille d'une page (1 à 100). */
  pageSize?: number;
}

/**
 * Historique des opérations, page après page (les plus récentes d'abord). La clé commence par celle du portefeuille :
 * une déclaration, un ordre exécuté ou une reconnexion du direct relisent donc aussi l'historique, sans autre câblage.
 * Le cumul du résultat réalisé vient de la première page : l'API le calcule sur tout le journal, il ne dépend pas de la
 * page lue.
 */
export function useOperations({ symbol, pageSize = 20 }: Options = {}) {
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.portfolio, "operations", { symbol: symbol ?? null, pageSize }],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await portfolioControllerOperations({ query: { symbol, limit: pageSize, before: pageParam }, throwOnError: true })).data,
    // Une page pleine laisse supposer qu'il en reste : la page suivante part de la date de la dernière opération lue.
    getNextPageParam: (last) => (last.items.length === pageSize ? last.items[last.items.length - 1].createdAt : undefined),
  });

  const items: OperationDto[] = query.data?.pages.flatMap((page) => page.items) ?? [];
  return {
    ...query,
    items,
    realizedTotal: query.data?.pages[0]?.realizedTotal ?? null,
  };
}
