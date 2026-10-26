import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import {
  riskControllerActivateKillSwitch,
  riskControllerDeactivateKillSwitch,
  riskControllerGetSettings,
  riskControllerStatus,
  riskControllerUpdateSettings,
} from "@/lib/api/sdk.gen";
import type { RiskSettingsDto, TradingStatusDto, UpdateRiskSettingsDto } from "@/lib/api/types.gen";
import { apiErrorMessage } from "@/lib/api-error";
import { queryKeys } from "@/lib/realtime/query-keys";

// Les deux clés partagent la racine `["risk"]` : l'événement `risk` du temps réel relit l'état ET les réglages.
const statusKey = [...queryKeys.risk, "status"] as const;
const settingsKey = [...queryKeys.risk, "settings"] as const;

/** État du robot : mode, kill switch, pause. C'est l'API qui dit si un ordre peut partir (`canTrade`). */
export function useTradingStatus() {
  return useQuery({
    queryKey: statusKey,
    queryFn: async () => (await riskControllerStatus({ throwOnError: true })).data,
  });
}

export function useRiskSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: async () => (await riskControllerGetSettings({ throwOnError: true })).data,
  });
}

/** Réglages de risque : pas d'optimisme, ce sont des garde-fous — on affiche la valeur que l'API a réellement retenue. */
export function useUpdateRiskSettings() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: async (patch: UpdateRiskSettingsDto) => (await riskControllerUpdateSettings({ body: patch, throwOnError: true })).data,
    onSuccess: (saved: RiskSettingsDto) => {
      queryClient.setQueryData(settingsKey, saved);
      notify("Garde-fous enregistrés.");
    },
    onError: (error) => notify(apiErrorMessage(error, "Impossible d'enregistrer ces garde-fous."), "error"),
  });
}

/**
 * Kill switch. Jamais optimiste : l'écran ne doit afficher « robot arrêté » que si l'API l'a confirmé, car c'est
 * précisément le moment où l'on a besoin de savoir la vérité.
 */
export function useKillSwitch() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: async (activate: boolean) =>
      (activate ? await riskControllerActivateKillSwitch({ throwOnError: true }) : await riskControllerDeactivateKillSwitch({ throwOnError: true })).data,
    onSuccess: (status: TradingStatusDto, activate) => {
      queryClient.setQueryData(statusKey, status);
      notify(activate ? "Robot arrêté. Aucun ordre ne partira." : "Robot réactivé.");
    },
    onError: (error, activate) =>
      notify(apiErrorMessage(error, activate ? "L'arrêt d'urgence n'a pas pu être confirmé : réessayez." : "Impossible de réactiver le robot."), "error"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.risk }),
  });
}
