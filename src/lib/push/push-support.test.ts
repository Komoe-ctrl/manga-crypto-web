import { afterEach, describe, expect, it } from "vitest";
import { installPushEnv } from "./push-env";
import { pushSupport, readLocalPushState, urlBase64ToUint8Array } from "./push-support";

let env: ReturnType<typeof installPushEnv> | undefined;
afterEach(() => env?.remove());

describe("urlBase64ToUint8Array", () => {
  it("décode le base64url en octets", () => {
    expect([...urlBase64ToUint8Array("AQID")]).toEqual([1, 2, 3]);
  });

  it("gère l'alphabet « url » (- et _) et le remplissage manquant", () => {
    expect([...urlBase64ToUint8Array("-_8")]).toEqual([0xfb, 0xff]); // sans « = » final
    expect([...urlBase64ToUint8Array("-_8=")]).toEqual([0xfb, 0xff]);
  });

  it("donne les 65 octets d'une clé VAPID (point P-256 non compressé)", () => {
    const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");
    expect(key).toHaveLength(87);
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
    expect(bytes[64]).toBe(7);
  });

  it("est l'inverse de l'encodage du serveur sur des clés quelconques", () => {
    for (const size of [1, 2, 3, 16, 32, 65]) {
      const original = Uint8Array.from({ length: size }, (_, i) => (i * 37 + 11) % 256);
      expect([...urlBase64ToUint8Array(Buffer.from(original).toString("base64url"))]).toEqual([...original]);
    }
  });
});

describe("pushSupport", () => {
  it("pris en charge quand tout est là", () => {
    env = installPushEnv();
    expect(pushSupport()).toBe("supported");
  });

  it("http hors localhost : contexte non sécurisé (le service worker serait refusé)", () => {
    env = installPushEnv({ secure: false });
    expect(pushSupport()).toBe("insecure_context");
  });

  it("sans service worker", () => {
    env = installPushEnv({ serviceWorker: false });
    expect(pushSupport()).toBe("no_service_worker");
  });

  it("sans gestionnaire de Push (certains navigateurs)", () => {
    env = installPushEnv({ pushManager: false });
    expect(pushSupport()).toBe("no_push");
  });

  it("sans notifications", () => {
    env = installPushEnv({ notifications: false });
    expect(pushSupport()).toBe("no_notifications");
  });
});

describe("readLocalPushState", () => {
  it("« unsupported » quand le navigateur ne sait pas", async () => {
    env = installPushEnv({ serviceWorker: false });
    await expect(readLocalPushState()).resolves.toBe("unsupported");
  });

  it("« blocked » quand l'utilisateur a refusé les notifications", async () => {
    env = installPushEnv({ permission: "denied" });
    await expect(readLocalPushState()).resolves.toBe("blocked");
  });

  it("« off » sans service worker enregistré (rien n'est enregistré avant la première activation)", async () => {
    env = installPushEnv();
    await expect(readLocalPushState()).resolves.toBe("off");
    expect(env.register).not.toHaveBeenCalled(); // lire l'état ne doit rien installer
  });

  it("« off » avec un service worker mais sans abonnement", async () => {
    env = installPushEnv();
    await env.register();
    await expect(readLocalPushState()).resolves.toBe("off");
  });

  it("« on » avec un abonnement", async () => {
    const { fakeSubscription } = await import("./push-env");
    env = installPushEnv({ existing: fakeSubscription() });
    await expect(readLocalPushState()).resolves.toBe("on");
  });
});
