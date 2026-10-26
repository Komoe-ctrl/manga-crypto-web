import { useQuery } from "@tanstack/react-query";
import { notificationsControllerPushStatus } from "@/lib/api/sdk.gen";
import { queryKeys } from "@/lib/realtime/query-keys";

/** État du Push côté serveur : clés VAPID présentes, clé publique, nombre d'appareils abonnés. */
export function usePushStatus() {
  return useQuery({
    queryKey: queryKeys.push,
    queryFn: async () => (await notificationsControllerPushStatus({ throwOnError: true })).data,
  });
}
