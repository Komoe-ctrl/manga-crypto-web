import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginError, SessionManager, type LockRunner } from "./session-manager";
import { createTokenStore, type TokenStore } from "./token-store";

const API = "http://api.test";
const NOW = 1_800_000_000_000;
const USER = {
  id: "u1",
  email: "a@example.com",
  displayName: null,
  timezone: "UTC",
  baseCurrency: "USD",
  tradingMode: "PAPER" as const,
  killSwitchActive: false,
};
const body = (token: string, expiresIn = 900) => ({ accessToken: token, expiresIn, user: USER });
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

let store: TokenStore;
let clock: number;

function build(handler: (url: string, init?: RequestInit) => Response | Promise<Response>, lock?: LockRunner) {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  const manager = new SessionManager({
    apiUrl: API,
    store,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    lock,
    now: () => clock,
  });
  return { manager, fetchImpl };
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = NOW;
  store = createTokenStore();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("SessionManager.login", () => {
  it("ouvre la session : jeton gardé en mémoire avec son échéance, cookie demandé", async () => {
    const { manager, fetchImpl } = build(() => json(body("t1", 900)));

    const session = await manager.login("a@example.com", "secret");

    expect(session).toMatchObject({ accessToken: "t1", expiresAt: NOW + 900_000, user: USER });
    expect(store.get()).toBe(session);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/auth/login`);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@example.com", password: "secret" });
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });

  it.each([
    [401, "invalid_credentials"],
    [429, "rate_limited"],
    [500, "unknown"],
    [400, "unknown"],
  ])("le statut %i devient « %s » et n'ouvre aucune session", async (status, reason) => {
    const { manager } = build(() => json({ message: "x" }, status));
    await expect(manager.login("a@example.com", "x")).rejects.toMatchObject({ name: "LoginError", reason });
    expect(store.get()).toBeNull();
  });

  it("serveur injoignable : « unreachable »", async () => {
    const { manager } = build(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(manager.login("a@example.com", "x")).rejects.toEqual(new LoginError("unreachable"));
  });

  it("réponse de succès illisible : « unknown », sans session", async () => {
    const { manager } = build(() => new Response("pas du json", { status: 200 }));
    await expect(manager.login("a@example.com", "x")).rejects.toMatchObject({ reason: "unknown" });
    expect(store.get()).toBeNull();
  });
});

describe("SessionManager.refresh et bootstrap", () => {
  it("rétablit la session avec le cookie (credentials: include)", async () => {
    const { manager, fetchImpl } = build(() => json(body("t2")));

    const session = await manager.bootstrap();

    expect(session?.accessToken).toBe("t2");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/auth/refresh`);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
  });

  it.each([401, 403])("cookie refusé (%i) : plus de session, et plus aucun renouvellement programmé", async (status) => {
    store.set({ accessToken: "vieux", expiresAt: NOW + 1000, user: USER });
    const { manager, fetchImpl } = build(() => json({}, status));

    await expect(manager.refresh()).resolves.toBeNull();

    expect(store.get()).toBeNull();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("une seule requête pour des appels simultanés (le double appel des effets de React ne déconnecte personne)", async () => {
    // L'API révoque toute la chaîne si un refresh token déjà consommé est présenté une seconde fois.
    const { manager, fetchImpl } = build(() => json(body("t3")));

    const results = await Promise.all([manager.refresh(), manager.bootstrap(), manager.refresh()]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new Set(results).size).toBe(1);
  });

  it("une fois terminé, un nouvel appel refait une requête", async () => {
    const { manager, fetchImpl } = build(() => json(body("t4")));
    await manager.refresh();
    await manager.refresh();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("passe par le verrou entre onglets, et le verrou enveloppe toute la requête", async () => {
    const order: string[] = [];
    const lock: LockRunner = async (task) => {
      order.push("verrou pris");
      const result = await task();
      order.push("verrou rendu");
      return result;
    };
    const { manager } = build(() => {
      order.push("requête");
      return json(body("t5"));
    }, lock);

    await manager.refresh();

    expect(order).toEqual(["verrou pris", "requête", "verrou rendu"]);
  });

  it("panne réseau : la session en mémoire est conservée et le renouvellement est retenté", async () => {
    store.set({ accessToken: "encore-valide", expiresAt: NOW + 600_000, user: USER });
    let down = true;
    const { manager, fetchImpl } = build(() => {
      if (down) throw new TypeError("réseau coupé");
      return json(body("neuf"));
    });

    const first = await manager.refresh();
    expect(first?.accessToken).toBe("encore-valide"); // pas déconnecté pour une coupure

    down = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(store.get()?.accessToken).toBe("neuf");
  });

  it.each([
    ["erreur 500", () => json({}, 500)],
    ["réponse illisible", () => new Response("<html>", { status: 200 })],
  ])("%s : traité comme une panne passagère, sans déconnexion", async (_label, response) => {
    store.set({ accessToken: "garde", expiresAt: NOW + 600_000, user: USER });
    const { manager } = build(response);
    expect((await manager.refresh())?.accessToken).toBe("garde");
    expect(store.get()?.accessToken).toBe("garde");
  });

  it("sans session au départ, une panne réseau renvoie null", async () => {
    const { manager } = build(() => {
      throw new TypeError("réseau coupé");
    });
    await expect(manager.bootstrap()).resolves.toBeNull();
  });
});

describe("renouvellement automatique", () => {
  it("renouvelle une minute avant l'échéance, pas avant", async () => {
    const { manager, fetchImpl } = build((url) => (url.endsWith("/login") ? json(body("t1", 900)) : json(body("t2", 900))));
    await manager.login("a@example.com", "x");

    await vi.advanceTimersByTimeAsync(839_000); // 900 s − 60 s − 1 s
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(store.get()?.accessToken).toBe("t2");
  });

  it("enchaîne les renouvellements tant que la session vit", async () => {
    let n = 0;
    const { manager, fetchImpl } = build(() => json(body(`t${++n}`, 900)));
    await manager.login("a@example.com", "x");

    await vi.advanceTimersByTimeAsync(840_000 * 3);

    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(store.get()?.accessToken).toBe(`t${n}`);
  });

  it("jeton à échéance très proche : au moins 5 s d'attente, jamais de boucle serrée", async () => {
    const { manager, fetchImpl } = build((url) => (url.endsWith("/login") ? json(body("t1", 30)) : json(body("t2", 30))));
    await manager.login("a@example.com", "x");

    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("dispose arrête le renouvellement", async () => {
    const { manager, fetchImpl } = build(() => json(body("t1", 900)));
    await manager.login("a@example.com", "x");
    manager.dispose();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("SessionManager.logout", () => {
  it("efface la session tout de suite, puis révoque le cookie", async () => {
    const { manager, fetchImpl } = build((url) => (url.endsWith("/login") ? json(body("t1")) : new Response(null, { status: 204 })));
    await manager.login("a@example.com", "x");

    const done = manager.logout();
    expect(store.get()).toBeNull(); // avant même la réponse du serveur
    await done;

    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(`${API}/api/auth/logout`);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("hors ligne : la session locale est quand même effacée, sans erreur", async () => {
    const { manager } = build((url) => {
      if (url.endsWith("/logout")) throw new TypeError("hors ligne");
      return json(body("t1"));
    });
    await manager.login("a@example.com", "x");
    await expect(manager.logout()).resolves.toBeUndefined();
    expect(store.get()).toBeNull();
  });

  it("annule le renouvellement programmé", async () => {
    const { manager, fetchImpl } = build((url) => (url.endsWith("/logout") ? new Response(null, { status: 204 }) : json(body("t1", 900))));
    await manager.login("a@example.com", "x");
    await manager.logout();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // connexion + déconnexion, rien d'autre
  });
});
