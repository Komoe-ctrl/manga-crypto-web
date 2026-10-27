import { renderHook, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 9)]).toString("base64url");
let server: { configured: boolean; publicKey: string | null; subscriptions: number };
const status = vi.fn();
const add = vi.fn();
const remove = vi.fn();
vi.mock("@/lib/api/sdk.gen", () => ({
  notificationsControllerPushStatus: (...a: unknown[]) => status(...a),
  notificationsControllerAddPushSubscription: (...a: unknown[]) => add(...a),
  notificationsControllerRemovePushSubscription: (...a: unknown[]) => remove(...a),
}));

import { wrapper } from "@/test-utils";
import { fakeSubscription, installPushEnv } from "./push-env";
import { usePush } from "./use-push";

let env: ReturnType<typeof installPushEnv> | undefined;

beforeEach(() => {
  server = { configured: true, publicKey: KEY, subscriptions: 0 };
  status.mockReset().mockImplementation(async () => ({ data: { ...server } }));
  add.mockReset().mockImplementation(async () => {
    server.subscriptions = 1;
    return { data: { ...server } };
  });
  remove.mockReset().mockImplementation(async () => {
    server.subscriptions = 0;
    return { data: { ...server } };
  });
});
afterEach(() => env?.remove());

async function settled() {
  const hook = renderHook(() => usePush(), { wrapper: wrapper() });
  await waitFor(() => expect(hook.result.current.state).not.toBe("loading"));
  return hook;
}

describe("usePush : état de l'appareil", () => {
  it("« loading » le temps de vérifier le serveur et le navigateur", async () => {
    env = installPushEnv();
    const hook = renderHook(() => usePush(), { wrapper: wrapper() });
    expect(hook.result.current.state).toBe("loading");
    await waitFor(() => expect(hook.result.current.state).toBe("off"));
  });

  it("« unsupported » quand le navigateur ne sait pas, même si le serveur est prêt", async () => {
    // aucun faux navigateur installé : jsdom n'a ni service worker ni Push
    const { result } = await settled();
    expect(result.current.state).toBe("unsupported");
  });

  it("« server_unconfigured » quand le serveur n'a pas de clés Push", async () => {
    env = installPushEnv();
    server.configured = false;
    server.publicKey = null;
    expect((await settled()).result.current.state).toBe("server_unconfigured");
  });

  it("« blocked » quand les notifications sont refusées dans le navigateur", async () => {
    env = installPushEnv({ permission: "denied" });
    expect((await settled()).result.current.state).toBe("blocked");
  });

  it("« off » : possible, pas encore activé", async () => {
    env = installPushEnv();
    expect((await settled()).result.current.state).toBe("off");
  });

  it("« on » : abonné dans le navigateur et connu du serveur", async () => {
    env = installPushEnv({ existing: fakeSubscription() });
    server.subscriptions = 1;
    const { result } = await settled();
    expect(result.current.state).toBe("on");
    expect(result.current.devices).toBe(1);
  });

  it("« stale » : abonné dans le navigateur mais oublié du serveur (abonnement révoqué), à réactiver", async () => {
    env = installPushEnv({ existing: fakeSubscription() });
    server.subscriptions = 0;
    expect((await settled()).result.current.state).toBe("stale");
  });
});

describe("usePush : activer et désactiver", () => {
  it("activer : l'appareil passe à « on » et une confirmation s'affiche", async () => {
    env = installPushEnv();
    const { result } = await settled();

    act(() => result.current.enable());

    await waitFor(() => expect(result.current.state).toBe("on"));
    expect(screen.getByRole("status").textContent).toContain("activées sur cet appareil");
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("pendant l'opération, « busy » évite le double clic", async () => {
    env = installPushEnv();
    let release: () => void = () => undefined;
    add.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            server.subscriptions = 1;
            resolve({ data: { ...server } });
          };
        }),
    );
    const { result } = await settled();

    act(() => result.current.enable());
    await waitFor(() => expect(result.current.busy).toBe(true));
    release();
    await waitFor(() => expect(result.current.busy).toBe(false));
  });

  it("permission refusée : message clair, l'état reste « off »", async () => {
    env = installPushEnv({ answer: "denied" });
    const { result } = await settled();

    act(() => result.current.enable());

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Notifications refusées"));
    expect(add).not.toHaveBeenCalled();
    await waitFor(() => expect(["off", "blocked"]).toContain(result.current.state));
  });

  it.each([
    ["NotAllowedError", "Registration failed - permission denied", "navigation privée"],
    ["AbortError", "Registration failed - permission denied", "navigation privée"], // ce que renvoie Edge en navigation privée
    ["AbortError", "Registration failed - push service error", "injoignable"],
    ["InvalidAccessError", "The provided applicationServerKey is not valid", "autre navigateur"],
  ])("erreur du navigateur %s : un message en français qui dit quoi faire, jamais le texte technique en anglais", async (name, technical, expected) => {
    env = installPushEnv({ permission: "granted" });
    env.subscribe.mockRejectedValueOnce(new DOMException(technical, name));
    const { result } = await settled();

    act(() => result.current.enable());

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(expected));
    expect(screen.getByRole("alert").textContent).not.toContain(technical);
    expect(add).not.toHaveBeenCalled();
  });

  it("l'API refuse l'abonnement : son message s'affiche et l'appareil n'est pas abonné à moitié", async () => {
    env = installPushEnv();
    add.mockRejectedValueOnce({ statusCode: 422, message: "Adresse d'abonnement refusée : seul le service Push d'un navigateur connu est accepté" });
    const { result } = await settled();

    act(() => result.current.enable());

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Adresse d'abonnement refusée"));
    expect(env.created.unsubscribe).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.state).toBe("off"));
  });

  it("réactiver un appareil « stale » ré-enregistre l'abonnement existant", async () => {
    env = installPushEnv({ existing: fakeSubscription(), permission: "granted" });
    server.subscriptions = 0;
    const { result } = await settled();
    expect(result.current.state).toBe("stale");

    act(() => result.current.enable());

    await waitFor(() => expect(result.current.state).toBe("on"));
  });

  it("désactiver : l'appareil repasse à « off » et le serveur est prévenu", async () => {
    env = installPushEnv({ existing: fakeSubscription() });
    server.subscriptions = 1;
    const { result } = await settled();

    act(() => result.current.disable());

    await waitFor(() => expect(result.current.state).toBe("off"));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("désactivées sur cet appareil");
  });

  it("désactiver sans réseau : une erreur s'affiche, mais l'appareil cesse de recevoir", async () => {
    const sub = fakeSubscription();
    env = installPushEnv({ existing: sub });
    server.subscriptions = 1;
    remove.mockRejectedValueOnce(new TypeError("réseau coupé"));
    const { result } = await settled();

    act(() => result.current.disable());

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Impossible de joindre le serveur"));
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
