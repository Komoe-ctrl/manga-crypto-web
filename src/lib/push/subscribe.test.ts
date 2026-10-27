import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const add = vi.fn();
const remove = vi.fn();
vi.mock("@/lib/api/sdk.gen", () => ({
  notificationsControllerAddPushSubscription: (...args: unknown[]) => add(...args),
  notificationsControllerRemovePushSubscription: (...args: unknown[]) => remove(...args),
}));

import { fakeSubscription, installPushEnv } from "./push-env";
import { PushError, subscribeThisDevice, unsubscribeThisDevice } from "./subscribe";

const KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 9)]).toString("base64url");
let env: ReturnType<typeof installPushEnv>;

beforeEach(() => {
  add.mockReset().mockResolvedValue({ data: { configured: true, publicKey: KEY, subscriptions: 1 } });
  remove.mockReset().mockResolvedValue({ data: { configured: true, publicKey: KEY, subscriptions: 0 } });
});
afterEach(() => env?.remove());

describe("subscribeThisDevice", () => {
  it("demande la permission, enregistre le service worker, s'abonne avec la clé du serveur et prévient l'API", async () => {
    env = installPushEnv();

    await subscribeThisDevice(KEY);

    expect(env.notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(env.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    const [options] = env.subscribe.mock.calls[0] as unknown as [{ userVisibleOnly: boolean; applicationServerKey: Uint8Array }];
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toHaveLength(65);
    expect(options.applicationServerKey[0]).toBe(4);
    expect(add).toHaveBeenCalledWith({
      body: { endpoint: env.created.endpoint, keys: { p256dh: "cle-p256dh-navigateur", auth: "secret-auth-navigateur" } },
      throwOnError: true,
    });
  });

  it("n'envoie à l'API que l'adresse et les clés (pas la date d'expiration)", async () => {
    env = installPushEnv();
    await subscribeThisDevice(KEY);
    const body = (add.mock.calls[0][0] as { body: object }).body;
    expect(Object.keys(body).sort()).toEqual(["endpoint", "keys"]);
  });

  it("permission déjà accordée : n'importune pas l'utilisateur une seconde fois", async () => {
    env = installPushEnv({ permission: "granted" });
    await subscribeThisDevice(KEY);
    expect(env.notification.requestPermission).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledTimes(1);
  });

  it.each(["denied", "default"] as const)("permission refusée (%s) : « denied », rien n'est installé ni envoyé", async (answer) => {
    env = installPushEnv({ answer });
    await expect(subscribeThisDevice(KEY)).rejects.toMatchObject({ name: "PushError", reason: "denied" });
    expect(env.register).not.toHaveBeenCalled();
    expect(env.subscribe).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it("navigateur sans Push : « unsupported », sans même demander la permission", async () => {
    env = installPushEnv({ pushManager: false });
    await expect(subscribeThisDevice(KEY)).rejects.toEqual(new PushError("unsupported"));
    expect(env.notification.requestPermission).not.toHaveBeenCalled();
  });

  it("le serveur a changé de clés : l'ancien abonnement est écarté puis on réessaie une fois", async () => {
    const old = fakeSubscription("https://fcm.googleapis.com/fcm/send/ancien");
    env = installPushEnv({ existing: old, permission: "granted" });
    env.subscribe.mockRejectedValueOnce(new DOMException("clé différente", "InvalidStateError"));

    await subscribeThisDevice(KEY);

    expect(old.unsubscribe).toHaveBeenCalledTimes(1);
    expect(env.subscribe).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["NotAllowedError", "texte technique en anglais", "browser_refused"],
    // Constaté dans Edge en navigation privée : une AbortError dont le message parle de permission.
    ["AbortError", "Registration failed - permission denied", "browser_refused"],
    ["AbortError", "Registration failed - push service error", "service_unreachable"],
    ["InvalidAccessError", "texte technique en anglais", "failed"],
    ["QuelqueChoseDInconnu", "texte technique en anglais", "failed"],
  ])("erreur du navigateur %s (« %s ») : traduite en cause « %s », sans appel à l'API", async (name, message, reason) => {
    env = installPushEnv({ permission: "granted" });
    env.subscribe.mockRejectedValueOnce(new DOMException(message, name));
    await expect(subscribeThisDevice(KEY)).rejects.toMatchObject({ name: "PushError", reason });
    expect(add).not.toHaveBeenCalled();
  });

  it("une exception qui n'est pas une DOMException (code, réseau) devient aussi une cause lisible", async () => {
    env = installPushEnv({ permission: "granted" });
    env.subscribe.mockRejectedValueOnce(new TypeError("quelque chose"));
    await expect(subscribeThisDevice(KEY)).rejects.toMatchObject({ name: "PushError", reason: "failed" });
  });

  it("l'enregistrement du service worker qui échoue (ex. page ni en https ni en localhost) : cause lisible", async () => {
    env = installPushEnv({ permission: "granted" });
    env.register.mockRejectedValueOnce(new DOMException("non sécurisé", "SecurityError"));
    await expect(subscribeThisDevice(KEY)).rejects.toMatchObject({ name: "PushError", reason: "failed" });
    expect(add).not.toHaveBeenCalled();
  });

  it("abonnement incomplet renvoyé par le navigateur : annulé, rien d'envoyé", async () => {
    env = installPushEnv({ permission: "granted" });
    const incomplete = fakeSubscription();
    incomplete.toJSON = () => ({ endpoint: incomplete.endpoint, expirationTime: null, keys: { p256dh: "x" } }) as never;
    env.subscribe.mockResolvedValueOnce(incomplete);

    await expect(subscribeThisDevice(KEY)).rejects.toEqual(new PushError("incomplete_subscription"));

    expect(incomplete.unsubscribe).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
  });

  it("l'API refuse l'abonnement (service Push inconnu) : l'abonnement local est annulé, l'erreur remonte", async () => {
    env = installPushEnv({ permission: "granted" });
    const refusal = { statusCode: 422, message: "Adresse d'abonnement refusée" };
    add.mockRejectedValueOnce(refusal);

    await expect(subscribeThisDevice(KEY)).rejects.toBe(refusal);

    // Jamais d'appareil abonné d'un côté et ignoré de l'autre.
    expect(env.created.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("unsubscribeThisDevice", () => {
  it("prévient l'API avec l'adresse de l'appareil, puis se désabonne du navigateur", async () => {
    const sub = fakeSubscription("https://fcm.googleapis.com/fcm/send/mon-appareil");
    env = installPushEnv({ existing: sub });

    await unsubscribeThisDevice();

    expect(remove).toHaveBeenCalledWith({ body: { endpoint: "https://fcm.googleapis.com/fcm/send/mon-appareil" }, throwOnError: true });
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("l'API ne répond pas : l'appareil est quand même désabonné du navigateur (il cesse de recevoir), l'erreur remonte", async () => {
    const sub = fakeSubscription();
    env = installPushEnv({ existing: sub });
    remove.mockRejectedValueOnce(new TypeError("réseau coupé"));

    await expect(unsubscribeThisDevice()).rejects.toBeInstanceOf(TypeError);

    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("sans abonnement local : rien à faire, aucun appel", async () => {
    env = installPushEnv({ existing: null });
    await unsubscribeThisDevice();
    expect(remove).not.toHaveBeenCalled();
  });

  it("navigateur sans Push : sans effet, sans erreur", async () => {
    env = installPushEnv({ serviceWorker: false });
    await expect(unsubscribeThisDevice()).resolves.toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
  });
});
