import { describe, expect, it, vi } from "vitest";
import { createAuthFetch } from "./auth-fetch";
import { createTokenStore, type Session } from "./token-store";

const USER = {
  id: "u1",
  email: "a@example.com",
  displayName: null,
  timezone: "UTC",
  baseCurrency: "USD",
  tradingMode: "PAPER" as const,
  killSwitchActive: false,
};
const session = (token: string): Session => ({ accessToken: token, expiresAt: Date.now() + 900_000, user: USER });
const URL_ = "http://api.test/api/portfolio";

function build(options: { token?: string; refreshTo?: Session | null; responses: Response[] }) {
  const store = createTokenStore();
  if (options.token) store.set(session(options.token));
  const sent: Request[] = [];
  const queue = [...options.responses];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    sent.push(input as Request);
    return queue.shift() ?? new Response(null, { status: 500 });
  });
  const manager = { refresh: vi.fn(async () => options.refreshTo ?? null) };
  const authFetch = createAuthFetch({ store, manager, fetchImpl: fetchImpl as unknown as typeof fetch });
  return { authFetch, manager, sent, fetchImpl };
}

const ok = () => new Response("{}", { status: 200 });
const unauthorized = () => new Response("{}", { status: 401 });

describe("createAuthFetch", () => {
  it("ajoute le jeton d'accès et demande le cookie", async () => {
    const { authFetch, sent, manager } = build({ token: "t1", responses: [ok()] });

    const response = await authFetch(new Request(URL_));

    expect(response.status).toBe(200);
    expect(sent[0].headers.get("Authorization")).toBe("Bearer t1");
    expect(sent[0].credentials).toBe("include");
    expect(manager.refresh).not.toHaveBeenCalled();
  });

  it("sans session : aucune en-tête Authorization (l'API répondra 401)", async () => {
    const { authFetch, sent } = build({ responses: [ok()] });
    await authFetch(new Request(URL_));
    expect(sent[0].headers.has("Authorization")).toBe(false);
  });

  it("401 : renouvelle le jeton une fois puis rejoue la requête avec le nouveau", async () => {
    const { authFetch, sent, manager } = build({
      token: "perime",
      refreshTo: session("neuf"),
      responses: [unauthorized(), ok()],
    });

    const response = await authFetch(new Request(URL_));

    expect(response.status).toBe(200);
    expect(manager.refresh).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
    expect(sent[0].headers.get("Authorization")).toBe("Bearer perime");
    expect(sent[1].headers.get("Authorization")).toBe("Bearer neuf");
  });

  it("le corps d'une requête est rejoué à l'identique (il ne se lit qu'une fois)", async () => {
    const { authFetch, sent } = build({
      token: "perime",
      refreshTo: session("neuf"),
      responses: [unauthorized(), ok()],
    });

    await authFetch(
      new Request("http://api.test/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: "BTC", side: "BUY", quantity: "1" }),
      }),
    );

    expect(await sent[0].text()).toBe('{"symbol":"BTC","side":"BUY","quantity":"1"}');
    expect(await sent[1].text()).toBe('{"symbol":"BTC","side":"BUY","quantity":"1"}');
    expect(sent[1].method).toBe("POST");
  });

  it("second 401 après renouvellement : renvoyé tel quel, jamais de boucle", async () => {
    const { authFetch, sent, manager } = build({
      token: "perime",
      refreshTo: session("neuf"),
      responses: [unauthorized(), unauthorized()],
    });

    const response = await authFetch(new Request(URL_));

    expect(response.status).toBe(401);
    expect(sent).toHaveLength(2);
    expect(manager.refresh).toHaveBeenCalledTimes(1);
  });

  it("renouvellement refusé (plus de session) : le 401 d'origine est renvoyé, sans seconde tentative", async () => {
    const { authFetch, sent } = build({ token: "perime", refreshTo: null, responses: [unauthorized()] });

    const response = await authFetch(new Request(URL_));

    expect(response.status).toBe(401);
    expect(sent).toHaveLength(1);
  });

  it.each([400, 403, 404, 422, 500])("le statut %i n'est pas un jeton périmé : aucun renouvellement", async (status) => {
    const { authFetch, manager, sent } = build({ token: "t1", responses: [new Response("{}", { status })] });
    const response = await authFetch(new Request(URL_));
    expect(response.status).toBe(status);
    expect(manager.refresh).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  it("des 401 simultanés demandent chacun le renouvellement (la requête unique est garantie par le gestionnaire)", async () => {
    const { authFetch, manager } = build({
      token: "perime",
      refreshTo: session("neuf"),
      responses: [unauthorized(), unauthorized(), ok(), ok()],
    });

    await Promise.all([authFetch(new Request(URL_)), authFetch(new Request(`${URL_}?x=1`))]);

    expect(manager.refresh).toHaveBeenCalledTimes(2);
  });
});
