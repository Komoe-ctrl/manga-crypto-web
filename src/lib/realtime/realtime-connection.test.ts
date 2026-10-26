import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTokenStore, type Session, type TokenStore } from "@/lib/auth/token-store";
import { RealtimeConnection, type RealtimeEventMessage, type RealtimeStatus, type SocketLike } from "./realtime-connection";

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

class FakeSocket implements SocketLike {
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  sent: unknown[] = [];
  closedWith: number | undefined;
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number) {
    this.closedWith = code;
  }
  // ── côté serveur simulé ──
  open() {
    this.onopen?.({});
  }
  receive(message: unknown) {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }
  ready() {
    this.receive({ event: "ready", data: { expiresAt: null } });
  }
  closeFromServer(code: number) {
    this.onclose?.({ code });
  }
}

let store: TokenStore;
let sockets: FakeSocket[];
let refresh: ReturnType<typeof vi.fn>;

function build(withSession = true) {
  if (withSession) store.set(session("t1"));
  const connection = new RealtimeConnection({
    url: "ws://api.test/api/ws",
    store,
    manager: { refresh: refresh as unknown as () => Promise<Session | null> },
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    random: () => 0.5, // facteur d'aléa exactement 1,0 : délais prévisibles
  });
  const statuses: RealtimeStatus[] = [];
  const messages: RealtimeEventMessage[] = [];
  connection.subscribe({ onStatus: (s) => statuses.push(s), onMessage: (m) => messages.push(m) });
  return { connection, statuses, messages };
}

const last = () => sockets[sockets.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  store = createTokenStore();
  sockets = [];
  refresh = vi.fn(async () => session("renouvele"));
});
afterEach(() => vi.useRealTimers());

describe("connexion et authentification", () => {
  it("ne s'ouvre pas sans session, puis se connecte dès qu'une session existe", () => {
    const { connection, statuses } = build(false);
    connection.start();
    expect(sockets).toHaveLength(0);
    expect(connection.status).toBe("idle");

    store.set(session("t1"));

    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe("ws://api.test/api/ws");
    expect(statuses).toEqual(["connecting"]);
  });

  it("envoie le jeton dans un premier message, jamais dans l'adresse", () => {
    const { connection } = build();
    connection.start();
    last().open();

    expect(last().sent).toEqual([{ event: "auth", data: { token: "t1" } }]);
    expect(last().url).not.toContain("t1");
  });

  it("devient « open » à la réponse « ready », pas à l'ouverture du socket", () => {
    const { connection, statuses } = build();
    connection.start();
    last().open();
    expect(connection.status).toBe("connecting");

    last().ready();

    expect(connection.status).toBe("open");
    expect(statuses).toEqual(["connecting", "open"]);
  });

  it("start() deux fois n'ouvre qu'une connexion", () => {
    const { connection } = build();
    connection.start();
    connection.start();
    expect(sockets).toHaveLength(1);
  });
});

describe("messages", () => {
  it("relaie les événements order, risk et notification", () => {
    const { connection, messages } = build();
    connection.start();
    last().open();
    last().ready();

    last().receive({ event: "order", data: { id: "o1", status: "FILLED" } });
    last().receive({ event: "risk", data: { killSwitchActive: true } });
    last().receive({ event: "notification", data: { id: "n1" } });

    expect(messages.map((m) => m.event)).toEqual(["order", "risk", "notification"]);
  });

  it.each([
    ["JSON illisible", "{pas du json"],
    ["événement inconnu (version future de l'API)", { event: "nouveaute", data: {} }],
    ["sans données", { event: "order" }],
    ["données qui ne sont pas un objet", { event: "order", data: "x" }],
    ["tableau", []],
    ["texte brut", "bonjour"],
  ])("ignore sans planter : %s", (_label, message) => {
    const { connection, messages } = build();
    connection.start();
    last().open();
    last().ready();
    expect(() => last().receive(message)).not.toThrow();
    expect(messages).toEqual([]);
    expect(connection.status).toBe("open");
  });

  it("un message « error » du serveur n'est pas relayé (la fermeture qui suit gère la suite)", () => {
    const { connection, messages } = build();
    connection.start();
    last().open();
    last().receive({ event: "error", data: { code: "unauthorized" } });
    expect(messages).toEqual([]);
  });
});

describe("reconnexion", () => {
  it("après une coupure : 1 s, 2 s, 4 s… puis plafonné à 30 s", async () => {
    const { connection } = build();
    connection.start();

    const delays = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
    for (const [i, delay] of delays.entries()) {
      last().closeFromServer(1006);
      expect(sockets).toHaveLength(i + 1);
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(sockets).toHaveLength(i + 1); // pas avant le délai
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(i + 2);
    }
  });

  it("remet le délai à 1 s une fois reconnecté", async () => {
    const { connection } = build();
    connection.start();
    last().closeFromServer(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    last().closeFromServer(1006);
    await vi.advanceTimersByTimeAsync(2_000);
    last().open();
    last().ready(); // reconnecté : l'historique d'échecs est oublié

    last().closeFromServer(1006);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(sockets).toHaveLength(4);
  });

  it("le délai comprend un peu d'aléa (±20 %) pour que les onglets ne se reconnectent pas ensemble", async () => {
    store.set(session("t1"));
    const connection = new RealtimeConnection({
      url: "ws://x/api/ws",
      store,
      manager: { refresh: refresh as unknown as () => Promise<Session | null> },
      createSocket: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      random: () => 0, // aléa minimal : 0,8 × 1 000 ms
    });
    connection.start();
    last().closeFromServer(1006);
    await vi.advanceTimersByTimeAsync(799);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
  });

  it("annonce « reconnecting » pendant l'attente", () => {
    const { connection, statuses } = build();
    connection.start();
    last().open();
    last().ready();
    last().closeFromServer(1006);
    expect(connection.status).toBe("reconnecting");
    expect(statuses.at(-1)).toBe("reconnecting");
  });

  it("4408 (pas d'authentification à temps) : reconnexion normale", async () => {
    const { connection } = build();
    connection.start();
    last().closeFromServer(4408);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);
  });

  it("4429 (trop de connexions) : patiente une minute au lieu d'insister", async () => {
    const { connection } = build();
    connection.start();
    last().closeFromServer(4429);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
  });

  it("une fermeture tardive d'un ancien socket ne déclenche pas de reconnexion en double", async () => {
    const { connection } = build();
    connection.start();
    const old = last();
    old.closeFromServer(1006);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sockets).toHaveLength(2);

    old.closeFromServer(1006); // événement tardif de l'ancien socket
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sockets).toHaveLength(2);
  });
});

describe("jeton refusé (4401)", () => {
  it("renouvelle le jeton puis se reconnecte tout de suite avec le nouveau", async () => {
    const { connection } = build();
    connection.start();
    last().open();
    store.set(session("renouvele")); // le gestionnaire met le nouveau jeton dans le magasin
    last().closeFromServer(4401);
    await vi.advanceTimersByTimeAsync(0);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(2);
    last().open();
    expect(last().sent).toEqual([{ event: "auth", data: { token: "renouvele" } }]);
  });

  it("si la session a disparu, s'arrête sans boucler", async () => {
    refresh.mockResolvedValue(null);
    const { connection } = build();
    connection.start();
    last().closeFromServer(4401);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sockets).toHaveLength(1);
    expect(connection.status).toBe("idle");
  });

  it("refus répétés : le deuxième passe par le délai croissant, jamais de boucle serrée", async () => {
    const { connection } = build();
    connection.start();
    last().closeFromServer(4401);
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(2); // premier essai immédiat

    last().closeFromServer(4401); // le serveur refuse encore
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(2); // pas immédiat cette fois
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sockets).toHaveLength(3);
  });
});

describe("renouvellement du jeton sur une connexion ouverte", () => {
  it("envoie un nouveau « auth » sans couper la connexion", () => {
    const { connection } = build();
    connection.start();
    last().open();
    last().ready();

    store.set(session("t2"));

    expect(sockets).toHaveLength(1);
    expect(last().sent).toEqual([
      { event: "auth", data: { token: "t1" } },
      { event: "auth", data: { token: "t2" } },
    ]);
    expect(connection.status).toBe("open");
  });

  it("ne renvoie rien si le jeton n'a pas changé", () => {
    const { connection } = build();
    connection.start();
    last().open();
    last().ready();
    store.set({ ...session("t1") });
    expect(last().sent).toHaveLength(1);
  });
});

describe("déconnexion et arrêt", () => {
  it("la session disparaît : connexion fermée proprement, pas de reconnexion", async () => {
    const { connection } = build();
    connection.start();
    last().open();
    last().ready();
    const socket = last();

    store.clear();

    expect(socket.closedWith).toBe(1000);
    expect(connection.status).toBe("idle");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sockets).toHaveLength(1);
  });

  it("une nouvelle session après une déconnexion rouvre la connexion", () => {
    const { connection } = build();
    connection.start();
    store.clear();
    store.set(session("t9"));
    expect(sockets).toHaveLength(2);
    last().open();
    expect(last().sent).toEqual([{ event: "auth", data: { token: "t9" } }]);
  });

  it("une coupure en attente de reconnexion est annulée par la déconnexion", async () => {
    const { connection } = build();
    connection.start();
    last().closeFromServer(1006);
    store.clear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
    expect(connection.status).toBe("idle");
  });

  it("stop() ferme, annule les minuteurs et ignore les événements suivants", async () => {
    const { connection, messages } = build();
    connection.start();
    last().open();
    last().ready();
    const socket = last();

    connection.stop();
    socket.receive({ event: "order", data: { id: "o1" } });
    socket.closeFromServer(1006);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(socket.closedWith).toBe(1000);
    expect(messages).toEqual([]);
    expect(sockets).toHaveLength(1);
    expect(connection.status).toBe("idle");
  });

  it("stop() puis un changement de session n'ouvre rien", () => {
    const { connection } = build();
    connection.start();
    connection.stop();
    store.set(session("t3"));
    expect(sockets).toHaveLength(1);
  });

  it("se désabonner d'un écouteur le fait taire sans toucher la connexion", () => {
    const { connection } = build();
    const listener = { onMessage: vi.fn() };
    const unsubscribe = connection.subscribe(listener);
    connection.start();
    last().open();
    last().ready();
    unsubscribe();
    last().receive({ event: "risk", data: {} });
    expect(listener.onMessage).not.toHaveBeenCalled();
    expect(connection.status).toBe("open");
  });
});
