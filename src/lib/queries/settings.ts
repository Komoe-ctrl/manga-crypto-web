import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { notificationsControllerGetSettings, notificationsControllerTest, notificationsControllerUpdateSettings } from "@/lib/api/sdk.gen";
import type { NotificationSettingsDto, UpdateNotificationSettingsDto } from "@/lib/api/types.gen";
import { apiErrorMessage } from "@/lib/api-error";
import { queryKeys } from "@/lib/realtime/query-keys";

/** Réglages de notification : Mode Nuit, heure du rapport, canaux. */
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: async () => (await notificationsControllerGetSettings({ throwOnError: true })).data,
  });
}

/**
 * Modifie un ou plusieurs réglages. L'interface réagit **tout de suite** (optimiste) ; si l'API refuse (plage de Mode
 * Nuit vide, Telegram sans identifiant…), l'ancienne valeur est rétablie et le message de l'API est affiché tel quel.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  return useMutation({
    mutationFn: async (patch: UpdateNotificationSettingsDto) =>
      (await notificationsControllerUpdateSettings({ body: patch, throwOnError: true })).data,
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings });
      const previous = queryClient.getQueryData<NotificationSettingsDto>(queryKeys.settings);
      if (previous) queryClient.setQueryData<NotificationSettingsDto>(queryKeys.settings, { ...previous, ...patch });
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.settings, context.previous);
      notify(apiErrorMessage(error, "Impossible d'enregistrer ce réglage."), "error");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.settings, saved);
    },
  });
}

/** Envoie un message de test immédiat sur les canaux activés ; le résultat dit ce qui a marché, canal par canal. */
export function useSendTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await notificationsControllerTest({ throwOnError: true })).data,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}
