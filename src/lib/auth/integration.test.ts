import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La chaîne complète, sans simuler nos propres modules : session, jeton en mémoire, `fetch` authentifié et client HTTP
 * **généré** par `openapi-ts`. Seul `fetch` (le réseau) est remplacé. C'est ce test qui prouve que la configuration du
 * client généré (adresse de l'API, `fetch` qui porte le jeton) est bien appliquée.
 */
import { portfolioControllerGet } from "@/lib/api/sdk.gen";
import { API_URL } from "@/lib/config";
import { sessionManager, tokenStore } from "./index";

const USER = {
  id: "u1",
  email: "a@example.com",
  displayName: null,
  timezone: "UTC",
  baseCurrency: "USD",
  tradingMode: "PAPER",
  killSwitchActive: false,
};
const PORTFOLIO = {
  currency: "USD",
  assets: [],
  totalValue: "0",
  totalCost: "0",
  totalPnl: "0",
  totalPnlPct: null,
  complete: true,
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

interface Call {
  method: string;
  url: string;
  authorization: string | null;
  credentials: RequestCredentials;
}
let calls: Call[];
let handler: (call: Call) => Response;

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const call: Call = {
        method: request.method,
        url: request.url,
        authorization: request.headers.get("Authorization"),
        credentials: init?.credentials ?? request.credentials,
      };
      calls.push(call);
      return handler(call);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  sessionManager.dispose();
  tokenStore.clear();
});

describe("chaîne d'authentification et client généré", () => {
  it("après la connexion, les appels de l'API portent le jeton et visent l'adresse configurée", async () => {
    handler = (call) => (call.url.endsWith("/api/auth/login") ? json({ accessToken: "t1", expiresIn: 900, user: USER }) : json(PORTFOLIO));
    await sessionManager.login("a@example.com", "secret");

    const { data } = await portfolioControllerGet({ throwOnError: true });

    expect(data).toEqual(PORTFOLIO);
    const portfolioCall = calls.at(-1)!;
    expect(portfolioCall.url).toBe(`${API_URL}/api/portfolio`);
    expect(portfolioCall.authorization).toBe("Bearer t1");
    expect(portfolioCall.credentials).toBe("include");
  });

  it("un jeton périmé (401) est renouvelé avec le cookie, puis la requête est rejouée avec le nouveau", async () => {
    let portfolioCalls = 0;
    handler = (call) => {
      if (call.url.endsWith("/api/auth/login")) return json({ accessToken: "perime", expiresIn: 900, user: USER });
      if (call.url.endsWith("/api/auth/refresh")) return json({ accessToken: "neuf", expiresIn: 900, user: USER });
      portfolioCalls += 1;
      return call.authorization === "Bearer neuf" ? json(PORTFOLIO) : json({ message: "Unauthorized" }, 401);
    };
    await sessionManager.login("a@example.com", "secret");

    const { data } = await portfolioControllerGet({ throwOnError: true });

    expect(data).toEqual(PORTFOLIO);
    expect(portfolioCalls).toBe(2);
    expect(calls.filter((c) => c.url.endsWith("/api/auth/refresh"))).toHaveLength(1);
    const refresh = calls.find((c) => c.url.endsWith("/api/auth/refresh"))!;
    expect(refresh.method).toBe("POST");
    expect(refresh.credentials).toBe("include"); // le cookie httpOnly part avec la demande
    expect(refresh.authorization).toBeNull(); // le renouvellement ne s'authentifie que par le cookie
    expect(tokenStore.get()?.accessToken).toBe("neuf");
  });

  it("plusieurs requêtes qui expirent ensemble ne déclenchent qu'un seul renouvellement", async () => {
    // Un second renouvellement présenterait un refresh token déjà consommé : l'API révoquerait toute la session.
    handler = (call) => {
      if (call.url.endsWith("/api/auth/login")) return json({ accessToken: "perime", expiresIn: 900, user: USER });
      if (call.url.endsWith("/api/auth/refresh")) return json({ accessToken: "neuf", expiresIn: 900, user: USER });
      return call.authorization === "Bearer neuf" ? json(PORTFOLIO) : json({}, 401);
    };
    await sessionManager.login("a@example.com", "secret");

    await Promise.all([
      portfolioControllerGet({ throwOnError: true }),
      portfolioControllerGet({ throwOnError: true }),
      portfolioControllerGet({ throwOnError: true }),
    ]);

    expect(calls.filter((c) => c.url.endsWith("/api/auth/refresh"))).toHaveLength(1);
  });

  it("cookie révoqué : l'erreur remonte, la session est effacée, aucune boucle de renouvellement", async () => {
    handler = (call) => {
      if (call.url.endsWith("/api/auth/login")) return json({ accessToken: "t1", expiresIn: 900, user: USER });
      return json({ message: "Unauthorized" }, 401); // données ET renouvellement refusés
    };
    await sessionManager.login("a@example.com", "secret");

    await expect(portfolioControllerGet({ throwOnError: true })).rejects.toBeDefined();

    expect(tokenStore.get()).toBeNull();
    expect(calls.filter((c) => c.url.endsWith("/api/auth/refresh"))).toHaveLength(1);
  });

  it("l'API n'est jamais appelée avec un jeton qui traînerait après la déconnexion", async () => {
    handler = (call) => {
      if (call.url.endsWith("/api/auth/login")) return json({ accessToken: "t1", expiresIn: 900, user: USER });
      if (call.url.endsWith("/api/auth/logout")) return new Response(null, { status: 204 });
      return json({}, 401);
    };
    await sessionManager.login("a@example.com", "secret");
    await sessionManager.logout();

    await portfolioControllerGet().catch(() => undefined);

    expect(calls.find((c) => c.url.endsWith("/api/portfolio"))?.authorization).toBeNull();
  });
});
