import { useMutation, useQueryClient } from "@tanstack/react-query";
import { portfolioControllerRecord, portfolioControllerRemove, portfolioControllerSet } from "@/lib/api/sdk.gen";
import type { RecordTransactionDto, SetAssetDto } from "@/lib/api/types.gen";
import { queryKeys } from "@/lib/realtime/query-keys";

/**
 * Déclarer, corriger ou retirer une position. Aucun optimisme : ces écritures changent le capital de référence (prix
 * d'achat moyen, gains), on affiche ce que l'API a réellement retenu. La clé du portefeuille couvre aussi les tendances
 * (même préfixe) : un nouvel actif reçoit sa courbe sans autre action.
 */
function useRefreshPortfolio() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.portfolio });
}

/** Achat ou vente déclaré : recalcule la quantité et le prix moyen ; une vente renvoie le résultat réalisé. */
export function useRecordTransaction() {
  const refresh = useRefreshPortfolio();
  return useMutation({
    mutationFn: async (body: RecordTransactionDto) => (await portfolioControllerRecord({ body, throwOnError: true })).data,
    onSuccess: refresh,
  });
}

/** Définit une position telle quelle (import initial ou correction). */
export function useSetPosition() {
  const refresh = useRefreshPortfolio();
  return useMutation({
    mutationFn: async ({ symbol, ...body }: SetAssetDto & { symbol: string }) =>
      (await portfolioControllerSet({ path: { symbol }, body, throwOnError: true })).data,
    onSuccess: refresh,
  });
}

export function useRemovePosition() {
  const refresh = useRefreshPortfolio();
  return useMutation({
    mutationFn: async (symbol: string) => {
      await portfolioControllerRemove({ path: { symbol }, throwOnError: true });
    },
    onSuccess: refresh,
  });
}
