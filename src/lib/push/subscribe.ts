import { notificationsControllerAddPushSubscription, notificationsControllerRemovePushSubscription } from "@/lib/api/sdk.gen";
import { SW_URL, pushSupport, urlBase64ToUint8Array } from "./push-support";

export type PushFailure = "denied" | "unsupported" | "incomplete_subscription";

export class PushError extends Error {
  constructor(readonly reason: PushFailure) {
    super(reason);
    this.name = "PushError";
  }
}

async function requestPermission(): Promise<void> {
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new PushError("denied");
}

async function subscribeWithKey(registration: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) };
  try {
    return await registration.pushManager.subscribe(options);
  } catch (error) {
    // Un abonnement existant a été créé avec une autre clé (le serveur a changé de clés VAPID) : on l'écarte et on réessaie.
    if (error instanceof DOMException && error.name === "InvalidStateError") {
      await (await registration.pushManager.getSubscription())?.unsubscribe();
      return registration.pushManager.subscribe(options);
    }
    throw error;
  }
}

/**
 * Abonne **cet appareil** : permission, service worker, abonnement auprès du navigateur, puis enregistrement auprès de
 * l'API. Si l'API refuse l'abonnement (service Push inconnu, par exemple), l'abonnement local est annulé : on ne laisse
 * pas un appareil abonné d'un côté et ignoré de l'autre.
 */
export async function subscribeThisDevice(publicKey: string): Promise<void> {
  if (pushSupport() !== "supported") throw new PushError("unsupported");
  await requestPermission();

  const registration = await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  const subscription = await subscribeWithKey(registration, publicKey);

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    await subscription.unsubscribe();
    throw new PushError("incomplete_subscription");
  }
  try {
    await notificationsControllerAddPushSubscription({
      body: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
      throwOnError: true,
    });
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
}

/** Désabonne cet appareil : d'abord l'API (il faut l'adresse), puis le navigateur. Sans abonnement local, rien à faire. */
export async function unsubscribeThisDevice(): Promise<void> {
  if (pushSupport() !== "supported") return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await notificationsControllerRemovePushSubscription({ body: { endpoint: subscription.endpoint }, throwOnError: true });
  } finally {
    // Même si l'API ne répond pas, l'appareil cesse de recevoir : l'abonnement navigateur est supprimé dans tous les cas.
    await subscription.unsubscribe();
  }
}
