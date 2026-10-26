/**
 * Ce que le navigateur sait faire pour le Web Push. Le service worker et les notifications exigent un contexte sûr :
 * https, ou `localhost` en développement. Sur iPhone, Safari ne les propose qu'à un site installé sur l'écran d'accueil.
 */
export type PushSupport = "supported" | "no_service_worker" | "no_push" | "no_notifications" | "insecure_context";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "no_service_worker";
  if (!window.isSecureContext) return "insecure_context";
  if (!("serviceWorker" in navigator)) return "no_service_worker";
  if (!("PushManager" in window)) return "no_push";
  if (!("Notification" in window)) return "no_notifications";
  return "supported";
}

/**
 * La clé publique VAPID arrive en base64url ; `PushManager.subscribe` veut des octets. Sans ceci, l'abonnement est
 * refusé avec une erreur peu parlante.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export const SW_URL = "/sw.js";

/** État de cet appareil, déduit du navigateur (et non stocké : le navigateur est la source de vérité). */
export type LocalPushState = "unsupported" | "blocked" | "off" | "on";

export async function readLocalPushState(): Promise<LocalPushState> {
  if (pushSupport() !== "supported") return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return "off";
  return (await registration.pushManager.getSubscription()) ? "on" : "off";
}
