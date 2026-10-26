import { vi } from "vitest";

/**
 * Faux navigateur pour les tests du Push : service worker, gestionnaire de Push, permission de notification.
 * (jsdom n'en a aucun.) `install()` pose les fausses interfaces ; `remove()` les retire.
 */
export function fakeSubscription(endpoint = "https://fcm.googleapis.com/fcm/send/appareil-1") {
  return {
    endpoint,
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "cle-p256dh-navigateur", auth: "secret-auth-navigateur" } }),
    unsubscribe: vi.fn(async () => true),
  };
}
export type FakeSubscription = ReturnType<typeof fakeSubscription>;

interface Options {
  /** Permission au départ. */
  permission?: NotificationPermission;
  /** Réponse du navigateur quand on demande la permission. */
  answer?: NotificationPermission;
  /** Abonnement déjà présent dans le navigateur. */
  existing?: FakeSubscription | null;
  secure?: boolean;
  serviceWorker?: boolean;
  pushManager?: boolean;
  notifications?: boolean;
}

export function installPushEnv(options: Options = {}) {
  const { permission = "default", answer = "granted", existing = null, secure = true, serviceWorker = true, pushManager = true, notifications = true } = options;

  let current: FakeSubscription | null = existing;
  /** Comme un vrai navigateur : se désabonner vide l'abonnement courant. */
  const clearOnUnsubscribe = (sub: FakeSubscription) => {
    sub.unsubscribe = vi.fn(async () => {
      if (current === sub) current = null;
      return true;
    });
    return sub;
  };
  if (existing) clearOnUnsubscribe(existing);
  const created = clearOnUnsubscribe(fakeSubscription());
  const subscribe = vi.fn(async (): Promise<FakeSubscription> => {
    current = created;
    return created;
  });
  const registration = {
    pushManager: { subscribe, getSubscription: vi.fn(async () => current) },
  };
  let hasRegistration = existing !== null;
  const register = vi.fn(async () => {
    hasRegistration = true;
    return registration;
  });
  const getRegistration = vi.fn(async () => (hasRegistration ? registration : undefined));

  class FakeNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = answer;
      return answer;
    });
  }

  Object.defineProperty(window, "isSecureContext", { configurable: true, value: secure });
  if (serviceWorker) {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register, getRegistration, ready: Promise.resolve(registration) },
    });
  }
  if (pushManager) vi.stubGlobal("PushManager", class {});
  if (notifications) vi.stubGlobal("Notification", FakeNotification);

  return {
    registration,
    subscribe,
    register,
    getRegistration,
    created,
    notification: FakeNotification,
    /** Abonnement actuellement dans le navigateur. */
    current: () => current,
    remove() {
      Reflect.deleteProperty(navigator, "serviceWorker");
      Reflect.deleteProperty(window, "isSecureContext");
      vi.unstubAllGlobals();
    },
  };
}
