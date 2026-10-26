import { describe, expect, it, vi } from "vitest";
import { createTokenStore, type Session } from "./token-store";

const session: Session = {
  accessToken: "t1",
  expiresAt: 1,
  user: {
    id: "u1",
    email: "a@example.com",
    displayName: null,
    timezone: "UTC",
    baseCurrency: "USD",
    tradingMode: "PAPER",
    killSwitchActive: false,
  },
};

describe("createTokenStore", () => {
  it("garde la session en mémoire, sans rien écrire dans le stockage du navigateur", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const store = createTokenStore();

    store.set(session);

    expect(store.get()).toBe(session);
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain("t1");
    setItem.mockRestore();
  });

  it("prévient les abonnés d'un changement, et plus après désabonnement", () => {
    const store = createTokenStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set(session);
    store.clear();
    unsubscribe();
    store.set(session);

    expect(listener.mock.calls).toEqual([[session], [null]]);
  });

  it("effacer une session déjà absente ne prévient personne", () => {
    const store = createTokenStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it("deux magasins sont indépendants", () => {
    const a = createTokenStore();
    const b = createTokenStore();
    a.set(session);
    expect(b.get()).toBeNull();
  });
});
