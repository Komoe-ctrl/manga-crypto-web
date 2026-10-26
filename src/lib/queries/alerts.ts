import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { alertsControllerCreate, alertsControllerList, alertsControllerRemove, alertsControllerUpdate } from "@/lib/api/sdk.gen";
import type { AlertDto, CreateAlertDto, UpdateAlertDto } from "@/lib/api/types.gen";
import { apiErrorMessage } from "@/lib/api-error";
import { queryKeys } from "@/lib/realtime/query-keys";

export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts,
    queryFn: async () => (await alertsControllerList({ throwOnError: true })).data,
  });
}

/** Création : pas d'optimisme (l'API valide, refuse les doublons et donne l'identifiant). */
export function useCreateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateAlertDto) => (await alertsControllerCreate({ body, throwOnError: true })).data,
    onSuccess: (created) => {
      queryClient.setQueryData<AlertDto[]>(queryKeys.alerts, (list) => (list ? [created, ...list.filter((a) => a.id !== created.id)] : [created]));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts }),
  });
}

/** Activation / désactivation : immédiate, avec retour arrière si l'API refuse. */
export function useUpdateAlert() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateAlertDto }) =>
      (await alertsControllerUpdate({ path: { id }, body: patch, throwOnError: true })).data,
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts });
      const previous = queryClient.getQueryData<AlertDto[]>(queryKeys.alerts);
      if (previous) {
        queryClient.setQueryData<AlertDto[]>(
          queryKeys.alerts,
          previous.map((a) => (a.id === id ? ({ ...a, ...patch } as AlertDto) : a)),
        );
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.alerts, context.previous);
      notify(apiErrorMessage(error, "Impossible de modifier cette alerte."), "error");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts }),
  });
}

export function useRemoveAlert() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      await alertsControllerRemove({ path: { id }, throwOnError: true });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.alerts });
      const previous = queryClient.getQueryData<AlertDto[]>(queryKeys.alerts);
      if (previous) queryClient.setQueryData<AlertDto[]>(queryKeys.alerts, previous.filter((a) => a.id !== id));
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.alerts, context.previous);
      notify(apiErrorMessage(error, "Impossible de supprimer cette alerte."), "error");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts }),
  });
}
