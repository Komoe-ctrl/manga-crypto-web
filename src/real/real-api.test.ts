// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Le VRAI code du front (session, renouvellement par cookie, client généré, WebSocket) contre une VRAIE API.
 * Ignoré par défaut : il faut une API lancée, une base de test et `REAL_API_URL`. Voir `npm run test:real`.
 *
 *   REAL_API_URL=http://localhost:3999 NEXT_PUBLIC_API_URL=http://localhost:3999 npm run test:real
 *
 * Node n'a pas de navigateur donc pas de pot de cookies : un petit `fetch` en tient lieu (il garde le cookie
 * `httpOnly` du refresh token, comme le ferait le navigateur, sans que le code du front ne le voie).
 */
const REAL = process.env.REAL_API_URL;

interface Cookie {
  value: string;
  path: string;
}
const jar = new Map<string, Cookie>();
const realFetch = globalThis.fetch;
let requests: { method: string; path: string; authorization: string | null }[] = [];

async function jarFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const { pathname } = new URL(request.url);
  const cookies = [...jar.entries()].filter(([, c]) => pathname.startsWith(c.path)).map(([name, c]) => `${name}=${c.value}`);
  const headers = new Headers(request.headers);
  if (cookies.length) headers.set("Cookie", cookies.join("; "));
  requests.push({ method: request.method, path: pathname, authorization: headers.get("Authorization") });

  const response = await realFetch(new Request(request, { headers }));
  for (const line of response.headers.getSetCookie()) {
    const [pair, ...attributes] = line.split(";").map((part) => part.trim());
    const [name, ...value] = pair.split("=");
    const path = attributes.find((a) => a.toLowerCase().startsWith("path="))?.slice(5) ?? "/";
    const expires = attributes.find((a) => a.toLowerCase().startsWith("expires="))?.slice(8);
    if (value.join("=") === "" || (expires && new Date(expires).getTime() <= Date.now())) jar.delete(name);
    else jar.set(name, { value: value.join("="), path });
  }
  return response;
}

const email = `front-${Date.now()}@example.com`;
const password = "un-mot-de-passe-solide";

describe.skipIf(!REAL)("front contre la vraie API", () => {
  let auth: typeof import("@/lib/auth");
  let sdk: typeof import("@/lib/api/sdk.gen");
  let RealtimeConnection: typeof import("@/lib/realtime/realtime-connection").RealtimeConnection;
  let browserSocket: typeof import("@/lib/realtime/realtime-connection").browserSocket;
  let WS_URL: string;

  beforeAll(async () => {
    vi.stubGlobal("fetch", jarFetch);
    // Importés APRÈS le remplacement de `fetch` : la configuration du client généré se fait à l'importation.
    auth = await import("@/lib/auth");
    sdk = await import("@/lib/api/sdk.gen");
    ({ RealtimeConnection, browserSocket } = await import("@/lib/realtime/realtime-connection"));
    ({ WS_URL } = await import("@/lib/config"));

    // Création du compte directement par l'API (le front n'a pas d'écran d'inscription).
    const res = await realFetch(`${REAL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, timezone: "UTC" }),
    });
    expect(res.status).toBe(201);
  });
  afterAll(() => {
    auth.sessionManager.dispose();
    vi.unstubAllGlobals();
  });

  it("connexion : jeton en mémoire, cookie httpOnly gardé hors de portée du code", async () => {
    const session = await auth.sessionManager.login(email, password);

    expect(session.user.email).toBe(email);
    expect(auth.tokenStore.get()?.accessToken).toBe(session.accessToken);
    expect(jar.get("refresh_token")?.path).toBe("/api/auth");
    expect(session.accessToken).not.toContain("refresh");
  });

  it("les appels de l'API passent par le client généré avec le jeton", async () => {
    requests = [];
    const { data } = await sdk.portfolioControllerGet({ throwOnError: true });

    expect(data.currency).toBe("USD");
    expect(data.assets).toEqual([]);
    const call = requests.find((r) => r.path === "/api/portfolio");
    expect(call?.authorization).toBe(`Bearer ${auth.tokenStore.get()?.accessToken}`);
  });

  it("jeton périmé : 401, renouvellement par le cookie, requête rejouée, tout seul", async () => {
    const real = auth.tokenStore.get()!;
    auth.tokenStore.set({ ...real, accessToken: "jeton.invalide.perime" }); // le serveur répondra 401
    requests = [];

    const { data } = await sdk.portfolioControllerGet({ throwOnError: true });

    expect(data.currency).toBe("USD");
    const paths = requests.map((r) => `${r.method} ${r.path}`);
    expect(paths).toEqual(["GET /api/portfolio", "POST /api/auth/refresh", "GET /api/portfolio"]);
    expect(auth.tokenStore.get()?.accessToken).not.toBe("jeton.invalide.perime");
  });

  it("des renouvellements simultanés ne déclenchent PAS la détection de réutilisation de l'API", async () => {
    // Un refresh token présenté deux fois révoquerait toute la session : une seule requête doit partir.
    requests = [];
    await Promise.all([auth.sessionManager.refresh(), auth.sessionManager.refresh(), auth.sessionManager.refresh()]);

    expect(requests.filter((r) => r.path === "/api/auth/refresh")).toHaveLength(1);
    // La session est toujours bonne : un renouvellement ultérieur réussit.
    expect(await auth.sessionManager.refresh()).not.toBeNull();
    const { data } = await sdk.portfolioControllerGet({ throwOnError: true });
    expect(data.currency).toBe("USD");
  });

  it("réglages : lecture, modification partielle, refus des valeurs invalides avec un message lisible", async () => {
    const { data: initial } = await sdk.notificationsControllerGetSettings({ throwOnError: true });
    expect(initial.nightModeEnabled).toBeTypeOf("boolean");
    expect(initial.digestMinute).toBeTypeOf("number");

    const { data: updated } = await sdk.notificationsControllerUpdateSettings({
      body: { nightModeEnabled: false, digestMinute: 9 * 60 + 30 },
      throwOnError: true,
    });
    expect(updated.nightModeEnabled).toBe(false);
    expect(updated.digestMinute).toBe(570);
    expect(updated.nightStartMinute).toBe(initial.nightStartMinute); // un PATCH partiel ne touche pas le reste

    const refused = await sdk.notificationsControllerUpdateSettings({ body: { digestMinute: 5000 } });
    expect(refused.response?.status).toBe(400);
    const { apiErrorMessage } = await import("@/lib/api-error");
    expect(apiErrorMessage(refused.error, "repli")).not.toBe("repli");

    // On remet les réglages d'origine.
    await sdk.notificationsControllerUpdateSettings({
      body: { nightModeEnabled: initial.nightModeEnabled, digestMinute: initial.digestMinute },
      throwOnError: true,
    });
  });

  it("notifications push : état serveur, abonnement valide accepté, hôte inconnu refusé, retrait", async () => {
    const { data: status } = await sdk.notificationsControllerPushStatus({ throwOnError: true });
    expect(status.subscriptions).toBe(0);
    expect(typeof status.configured).toBe("boolean");

    const { createECDH, randomBytes } = await import("node:crypto");
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const keys = {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    };
    const endpoint = "https://fcm.googleapis.com/fcm/send/front-real-test";

    const added = await sdk.notificationsControllerAddPushSubscription({ body: { endpoint, keys }, throwOnError: true });
    expect(added.data.subscriptions).toBe(1);

    const foreign = await sdk.notificationsControllerAddPushSubscription({
      body: { endpoint: "https://exemple.invalid/push/abc", keys },
    });
    expect(foreign.response?.status).toBe(422);

    const removed = await sdk.notificationsControllerRemovePushSubscription({ body: { endpoint }, throwOnError: true });
    expect(removed.data.subscriptions).toBe(0);
  });

  it("rapports : listes du jour et de la semaine, vides sur un compte neuf, et message de test avec son verdict", async () => {
    const day = await sdk.digestsControllerList({ query: { period: "TODAY", limit: 14 }, throwOnError: true });
    const week = await sdk.digestsControllerList({ query: { period: "WEEK", limit: 4 }, throwOnError: true });
    expect(day.data.items).toEqual([]);
    expect(day.data.unreadCount).toBe(0);
    expect(week.data.items).toEqual([]);

    const test = await sdk.notificationsControllerTest({ throwOnError: true });
    expect(test.data).toBeDefined();
    console.info("[réel] message de test →", JSON.stringify(test.data));
  });

  it("alertes : création avec le corps du front, activation, suppression, doublon et valeur absurde refusés avec un message", async () => {
    const { toCreateBody } = await import("@/lib/alerts");
    const { apiErrorMessage } = await import("@/lib/api-error");
    const drop = toCreateBody({ condition: "PRICE_DROP_PCT", assetSymbol: "btc", threshold: "5,5", windowMinutes: 1440, channel: "PUSH", isCritical: false });
    const cross = toCreateBody({ condition: "PRICE_CROSS_ABOVE", assetSymbol: "eth", threshold: "9000", windowMinutes: 60, channel: "EMAIL", isCritical: true });
    const portfolio = toCreateBody({ condition: "PORTFOLIO_DROP_PCT", assetSymbol: "", threshold: "10", windowMinutes: 240, channel: "PUSH", isCritical: false });

    const a = await sdk.alertsControllerCreate({ body: drop, throwOnError: true });
    const b = await sdk.alertsControllerCreate({ body: cross, throwOnError: true });
    const c = await sdk.alertsControllerCreate({ body: portfolio, throwOnError: true });
    expect(a.data).toMatchObject({ assetSymbol: "BTC", condition: "PRICE_DROP_PCT", windowMinutes: 1440, isActive: true, isTriggered: false });
    expect(b.data).toMatchObject({ assetSymbol: "ETH", windowMinutes: null, isCritical: true });
    expect(c.data).toMatchObject({ assetSymbol: null, condition: "PORTFOLIO_DROP_PCT" });

    const { data: list } = await sdk.alertsControllerList({ throwOnError: true });
    expect(list).toHaveLength(3);

    const paused = await sdk.alertsControllerUpdate({ path: { id: a.data.id }, body: { isActive: false }, throwOnError: true });
    expect(paused.data.isActive).toBe(false);

    // Ce que le front n'enverrait jamais mais que l'API doit refuser : une fenêtre sur un franchissement.
    const refused = await sdk.alertsControllerCreate({ body: { ...cross, windowMinutes: 60 } });
    expect(refused.response?.status).toBeGreaterThanOrEqual(400);
    expect(apiErrorMessage(refused.error, "repli")).not.toBe("repli");

    for (const alert of list) await sdk.alertsControllerRemove({ path: { id: alert.id }, throwOnError: true });
    expect((await sdk.alertsControllerList({ throwOnError: true })).data).toEqual([]);
  });

  it("garde-fous et kill switch : lecture, modification, arrêt d'urgence confirmé par l'API, ordre refusé avec son motif, reprise", async () => {
    const { baseAsset, describeFailure } = await import("@/lib/orders");
    const { apiErrorMessage, hasStatus } = await import("@/lib/api-error");

    const { data: before } = await sdk.riskControllerGetSettings({ throwOnError: true });
    expect(before.maxExposurePct).toBeTypeOf("number");
    const saved = await sdk.riskControllerUpdateSettings({ body: { maxExposurePct: 12.5 }, throwOnError: true });
    expect(saved.data.maxExposurePct).toBe(12.5);
    expect(saved.data.maxDailyLossPct).toBe(before.maxDailyLossPct);
    const tooMuch = await sdk.riskControllerUpdateSettings({ body: { maxExposurePct: 250 } });
    expect(tooMuch.response?.status).toBe(400);
    await sdk.riskControllerUpdateSettings({ body: { maxExposurePct: before.maxExposurePct }, throwOnError: true });

    const { data: running } = await sdk.riskControllerStatus({ throwOnError: true });
    expect(running).toMatchObject({ tradingMode: "PAPER", killSwitchActive: false, canTrade: true });

    let resumed: Awaited<ReturnType<typeof sdk.riskControllerDeactivateKillSwitch>> | undefined;
    try {
    const { data: stopped } = await sdk.riskControllerActivateKillSwitch({ throwOnError: true });
    expect(stopped).toMatchObject({ killSwitchActive: true, canTrade: false, blockedReason: "KILL_SWITCH" });

    // Ordre pendant l'arrêt : 422, message en français, motif connu du front, et l'ordre est enregistré comme refusé.
    const refused = await sdk.ordersControllerCreate({ body: { symbol: "BTC", side: "BUY", quantity: "0.001" } });
    expect(refused.response?.status).toBe(422);
    expect(hasStatus(refused.error, 422)).toBe(true);
    expect(apiErrorMessage(refused.error, "repli")).toMatch(/kill switch/i);
    const { data: orders } = await sdk.ordersControllerList({ query: { limit: 15 }, throwOnError: true });
    // L'API renvoie la paire (« BTC/USDT ») : le front la ramène à l'actif pour l'affichage.
    expect(orders.items[0]).toMatchObject({ status: "REJECTED", failureReason: "kill_switch", side: "BUY", symbol: "BTC/USDT" });
    expect(baseAsset(orders.items[0].symbol)).toBe("BTC");
    expect(describeFailure(orders.items[0].failureReason)).toMatch(/kill switch/);
    } finally {
      // Quoi qu'il arrive, le robot est relancé : les tests suivants passent des ordres.
      resumed = await sdk.riskControllerDeactivateKillSwitch({ throwOnError: true });
    }
    expect(resumed.data).toMatchObject({ killSwitchActive: false, canTrade: true });
  });

  it("temps réel : un ordre PAPER passé par l'API arrive en direct, du premier au dernier état", async () => {
    await sdk.portfolioControllerSet({
      path: { symbol: "USDT" },
      body: { quantity: "10000", avgBuyPrice: "1" },
      throwOnError: true,
    });

    const connection = new RealtimeConnection({ url: WS_URL, store: auth.tokenStore, manager: auth.sessionManager, createSocket: browserSocket });
    const events: string[] = [];
    const statuses: string[] = [];
    connection.subscribe({
      onStatus: (s) => statuses.push(s),
      onMessage: (m) => events.push(m.event === "order" ? `order:${m.data.status}` : m.event),
    });
    connection.start();
    await vi.waitFor(() => expect(connection.status).toBe("open"), { timeout: 8_000 });

    const order = await sdk.ordersControllerCreate({
      body: { symbol: "BTC", side: "BUY", quantity: "0.001" },
      throwOnError: true,
    });
    expect(order.data.status).toBeDefined();
    await vi.waitFor(() => expect(events).toContain("order:FILLED"), { timeout: 8_000 });

    expect(events.filter((e) => e.startsWith("order:"))).toEqual(["order:PENDING", "order:SUBMITTED", "order:FILLED"]);
    expect(statuses).toEqual(["connecting", "open"]);

    // L'événement part après la mise à jour du portefeuille : le relire donne déjà le résultat.
    const { data: portfolio } = await sdk.portfolioControllerGet({ throwOnError: true });
    expect(portfolio.assets.map((a) => a.symbol).sort()).toEqual(["BTC", "USDT"]);

    // Kill switch : l'état du robot arrive en direct.
    await sdk.riskControllerActivateKillSwitch({ throwOnError: true });
    await vi.waitFor(() => expect(events).toContain("risk"), { timeout: 8_000 });
    await sdk.riskControllerDeactivateKillSwitch({ throwOnError: true });

    // Déconnexion : le direct est coupé par la disparition de la session.
    await auth.sessionManager.logout();
    await vi.waitFor(() => expect(connection.status).toBe("idle"), { timeout: 8_000 });
    connection.stop();
  }, 30_000);

  it("après la déconnexion : le cookie est révoqué et l'API refuse tout", async () => {
    expect(auth.tokenStore.get()).toBeNull();
    expect(jar.has("refresh_token")).toBe(false);

    await expect(sdk.portfolioControllerGet({ throwOnError: true })).rejects.toBeDefined();
    expect(await auth.sessionManager.refresh()).toBeNull(); // plus de cookie : plus de session
  });

  it("mauvais mot de passe : « invalid_credentials », sans session", async () => {
    await expect(auth.sessionManager.login(email, "mauvais-mot-de-passe")).rejects.toMatchObject({ reason: "invalid_credentials" });
    expect(auth.tokenStore.get()).toBeNull();
  });

  it("reconnexion après déconnexion : tout refonctionne", async () => {
    await auth.sessionManager.login(email, password);
    const { data } = await sdk.portfolioControllerGet({ throwOnError: true });
    expect(data.assets.length).toBe(2);
    await auth.sessionManager.logout();
  });
});
