import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

/**
 * `public/sw.js` est du JavaScript brut, hors de la compilation de Next : on l'exécute **tel quel** dans un bac à sable
 * avec un faux environnement de service worker, et on lui envoie de faux événements.
 */
const SOURCE = fs.readFileSync(path.resolve(import.meta.dirname, "../../public/sw.js"), "utf8");

interface Win {
  focus?: () => Promise<unknown>;
}

function load(windows: Win[] = []) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers[type] = handler;
    },
    registration: {
      showNotification: vi.fn((title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      }),
    },
    clients: {
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => ({})),
    },
  };
  vm.runInNewContext(SOURCE, { self, console });

  const pending: Promise<unknown>[] = [];
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending.splice(0));
  };
  const push = (data: unknown) => dispatch("push", { data: data === undefined ? null : { json: () => data } });
  return { self, shown, handlers, dispatch, push };
}

describe("service worker : notification Push", () => {
  it("affiche le titre et le texte reçus", async () => {
    const sw = load();
    await sw.push({ title: "Stop-loss exécuté", body: "BTC vendu à 79 000 USDT", critical: false });
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe("Stop-loss exécuté");
    expect(sw.shown[0].options.body).toBe("BTC vendu à 79 000 USDT");
  });

  it("une alerte critique reste affichée jusqu'à ce qu'on la ferme ; une autre non", async () => {
    const sw = load();
    await sw.push({ title: "a", body: "b", critical: true });
    await sw.push({ title: "a", body: "b", critical: false });
    expect(sw.shown[0].options.requireInteraction).toBe(true);
    expect(sw.shown[1].options.requireInteraction).toBe(false);
  });

  it("une alerte du même type en remplace une autre au lieu de s'empiler, les critiques à part", async () => {
    const sw = load();
    await sw.push({ title: "a", body: "b", critical: true });
    await sw.push({ title: "a", body: "b", critical: false });
    expect(sw.shown[0].options.tag).toBe("veille-critique");
    expect(sw.shown[1].options.tag).toBe("veille");
  });

  it.each([
    ["sans données", undefined],
    ["objet vide", {}],
    ["titre qui n'est pas du texte", { title: 42, body: "x" }],
    ["titre vide", { title: "", body: "x" }],
    ["null", null],
    ["texte JSON", "bonjour"],
    ["nombre JSON", 42],
    ["tableau JSON", []],
  ])("message incomplet (%s) : une notification s'affiche quand même, avec le titre « Veille »", async (_label, data) => {
    const sw = load();
    await sw.push(data);
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe("Veille");
  });

  it("un texte absent ou qui n'est pas du texte devient une chaîne vide, jamais « undefined »", async () => {
    const sw = load();
    await sw.push({ title: "t" });
    await sw.push({ title: "t", body: 123 });
    expect(sw.shown.map((n) => n.options.body)).toEqual(["", ""]);
  });

  it("un message illisible (json() qui échoue) n'empêche pas d'afficher une notification", async () => {
    const sw = load();
    await sw.dispatch("push", {
      data: {
        json: () => {
          throw new SyntaxError("pas du JSON");
        },
      },
    });
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe("Veille");
  });

  it("une valeur « critical » qui n'est pas exactement vraie n'est pas critique", async () => {
    const sw = load();
    await sw.push({ title: "t", body: "b", critical: "true" });
    await sw.push({ title: "t", body: "b", critical: 1 });
    expect(sw.shown.map((n) => n.options.requireInteraction)).toEqual([false, false]);
  });

  it("attend l'affichage avant de rendre la main (waitUntil)", async () => {
    const sw = load();
    let waited = false;
    sw.handlers.push({ data: { json: () => ({ title: "t", body: "b" }) }, waitUntil: () => (waited = true) });
    expect(waited).toBe(true);
  });
});

describe("service worker : clic sur la notification", () => {
  it("ferme la notification", async () => {
    const sw = load();
    const close = vi.fn();
    await sw.dispatch("notificationclick", { notification: { close } });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("met en avant la fenêtre déjà ouverte au lieu d'en ouvrir une seconde", async () => {
    const focus = vi.fn(async () => undefined);
    const sw = load([{ focus }]);
    await sw.dispatch("notificationclick", { notification: { close: vi.fn() } });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("ouvre l'application quand aucune fenêtre n'est ouverte", async () => {
    const sw = load([]);
    await sw.dispatch("notificationclick", { notification: { close: vi.fn() } });
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith("/");
  });

  it("n'ouvre que l'application elle-même : jamais une adresse venue du message", async () => {
    const sw = load([]);
    await sw.dispatch("notificationclick", { notification: { close: vi.fn(), data: { url: "https://evil.example" } } });
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith("/");
  });
});

describe("service worker : sobriété", () => {
  it("n'enregistre que les deux événements dont il a besoin", () => {
    expect(Object.keys(load().handlers).sort()).toEqual(["notificationclick", "push"]);
  });

  it("n'accède à aucun jeton ni stockage, n'appelle aucun réseau", () => {
    expect(SOURCE).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|importScripts|Authorization/);
  });
});
