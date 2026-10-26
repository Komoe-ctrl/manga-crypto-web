import { describe, expect, it } from "vitest";
import { CLOSE, parseMessage } from "./events";
import { ALL_KEYS, keysToInvalidate, queryKeys } from "./query-keys";
import type { RealtimeEventMessage } from "./realtime-connection";

describe("parseMessage", () => {
  it.each(["ready", "error", "order", "risk", "notification"])("accepte « %s »", (event) => {
    const raw = JSON.stringify({ event, data: { a: 1 } });
    expect(parseMessage(raw)).toEqual({ event, data: { a: 1 } });
  });

  it.each([
    ["non texte", 42],
    ["null", null],
    ["objet déjà décodé", { event: "order", data: {} }],
    ["JSON invalide", "{"],
    ["JSON qui n'est pas un objet", "42"],
    ["null en JSON", "null"],
    ["événement absent", JSON.stringify({ data: {} })],
    ["événement inconnu", JSON.stringify({ event: "inconnu", data: {} })],
    ["événement qui n'est pas du texte", JSON.stringify({ event: 1, data: {} })],
    ["données absentes", JSON.stringify({ event: "order" })],
    ["données nulles", JSON.stringify({ event: "order", data: null })],
    ["données en texte", JSON.stringify({ event: "order", data: "x" })],
  ])("renvoie null pour : %s", (_label, raw) => {
    expect(parseMessage(raw)).toBeNull();
  });

  it("garde les codes de fermeture de l'API (SPEC section 8)", () => {
    expect(CLOSE).toEqual({ UNAUTHORIZED: 4401, AUTH_TIMEOUT: 4408, TOO_MANY_CONNECTIONS: 4429 });
  });
});

describe("keysToInvalidate", () => {
  const message = (event: string) => ({ event, data: {} }) as unknown as RealtimeEventMessage;

  it("un ordre relit les ordres ET le portefeuille (l'exécution change les quantités)", () => {
    expect(keysToInvalidate(message("order"))).toEqual([queryKeys.orders, queryKeys.portfolio]);
  });

  it("le robot relit l'état du risque", () => {
    expect(keysToInvalidate(message("risk"))).toEqual([queryKeys.risk]);
  });

  it("une notification relit la boîte de réception et les rapports", () => {
    expect(keysToInvalidate(message("notification"))).toEqual([queryKeys.notifications, queryKeys.digests, queryKeys.alerts]);
  });

  it("ALL_KEYS couvre toutes les données (relues à chaque reconnexion, rien n'est rejoué)", () => {
    expect(ALL_KEYS).toHaveLength(Object.keys(queryKeys).length);
    for (const key of Object.values(queryKeys)) expect(ALL_KEYS).toContainEqual(key);
  });
});
