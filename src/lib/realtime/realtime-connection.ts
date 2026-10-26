import type { SessionManager } from "@/lib/auth/session-manager";
import type { TokenStore } from "@/lib/auth/token-store";
import { CLOSE, parseMessage, type ServerMessage } from "./events";

export type RealtimeStatus = "idle" | "connecting" | "open" | "reconnecting";

/** Ce que la connexion utilise d'un `WebSocket` : permet un faux dans les tests. */
export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

/**
 * Adaptateur autour du `WebSocket` du navigateur : réduit ses événements à ce que la connexion lit (`data`, `code`),
 * ce qui garde `SocketLike` simple à imiter dans les tests.
 */
export function browserSocket(url: string): SocketLike {
  const ws = new WebSocket(url);
  const socket: SocketLike = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (data) => ws.send(data),
    close: (code) => ws.close(code),
  };
  ws.onopen = (event) => socket.onopen?.(event);
  ws.onmessage = (event) => socket.onmessage?.({ data: event.data });
  ws.onclose = (event) => socket.onclose?.({ code: event.code });
  ws.onerror = (event) => socket.onerror?.(event);
  return socket;
}

export type RealtimeEventMessage = Exclude<ServerMessage, { event: "ready" | "error" }>;

export interface RealtimeListener {
  onMessage?: (message: RealtimeEventMessage) => void;
  onStatus?: (status: RealtimeStatus) => void;
}

export interface RealtimeOptions {
  /** Adresse complète du WebSocket (`ws://hôte/api/ws`). */
  url: string;
  store: TokenStore;
  manager: Pick<SessionManager, "refresh">;
  createSocket?: (url: string) => SocketLike;
  random?: () => number;
}

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
/** 4429 : trop de connexions pour cet utilisateur. Insister serait inutile, on patiente. */
const TOO_MANY_DELAY_MS = 60_000;
const NORMAL_CLOSE = 1000;

/**
 * Connexion temps réel à l'API. Elle ne s'ouvre que lorsqu'une session existe, s'authentifie par un premier message
 * (le jeton ne va jamais dans l'URL), puis relaie les événements `order`, `risk` et `notification`.
 *
 * - **Reconnexion** automatique, à délai croissant (1 s, 2 s, 4 s… plafonné à 30 s, avec un peu d'aléa pour que les
 *   onglets ne se reconnectent pas tous en même temps).
 * - **Jeton renouvelé** : quand la session change de jeton, un nouveau message `auth` prolonge la connexion sans la
 *   couper (l'API ferme la connexion à l'échéance du jeton).
 * - **Code 4401** : le jeton est refusé ; on le renouvelle avant de se reconnecter, et on s'arrête si la session a disparu.
 * - **Aucun rejeu côté serveur** : un événement émis pendant une coupure est perdu. L'application doit donc relire
 *   son état par l'API à chaque (re)connexion (voir `onStatus`).
 */
export class RealtimeConnection {
  private readonly options: RealtimeOptions;
  private readonly listeners = new Set<RealtimeListener>();
  private socket: SocketLike | null = null;
  private authToken: string | null = null;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private running = false;
  private current: RealtimeStatus = "idle";

  constructor(options: RealtimeOptions) {
    this.options = options;
  }

  get status(): RealtimeStatus {
    return this.current;
  }

  /** @returns la fonction de désabonnement. */
  subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.unsubscribeStore = this.options.store.subscribe((session) => this.onSessionChange(session?.accessToken ?? null));
    if (this.options.store.get()) this.connect();
  }

  stop(): void {
    this.running = false;
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.clearTimer();
    this.drop();
    this.attempts = 0;
    this.setStatus("idle");
  }

  private onSessionChange(token: string | null): void {
    if (!this.running) return;
    if (token === null) {
      // Déconnexion : on coupe et on attend une nouvelle session.
      this.clearTimer();
      this.drop();
      this.attempts = 0;
      this.setStatus("idle");
      return;
    }
    if (this.socket && this.current === "open") {
      // Jeton renouvelé : on prolonge la connexion en renvoyant `auth`.
      if (token !== this.authToken) this.authenticate(token);
      return;
    }
    if (!this.socket && this.timer === null) this.connect();
  }

  private connect(): void {
    const token = this.options.store.get()?.accessToken;
    if (!token || !this.running) return;
    this.clearTimer();
    this.setStatus(this.attempts === 0 ? "connecting" : "reconnecting");

    const socket = (this.options.createSocket ?? browserSocket)(this.options.url);
    this.socket = socket;
    socket.onopen = () => {
      if (socket === this.socket) this.authenticate(token);
    };
    socket.onmessage = (event) => {
      if (socket === this.socket) this.handle(event.data);
    };
    socket.onclose = (event) => {
      if (socket === this.socket) this.onClose(event.code);
    };
    // Une erreur est toujours suivie d'une fermeture : c'est elle qui déclenche la reconnexion.
    socket.onerror = () => undefined;
  }

  private authenticate(token: string): void {
    this.authToken = token;
    this.socket?.send(JSON.stringify({ event: "auth", data: { token } }));
  }

  private handle(raw: unknown): void {
    const message = parseMessage(raw);
    if (!message) return;
    if (message.event === "ready") {
      this.attempts = 0;
      this.setStatus("open");
      return;
    }
    if (message.event === "error") return;
    for (const listener of this.listeners) listener.onMessage?.(message);
  }

  private onClose(code: number): void {
    this.socket = null;
    this.authToken = null;
    if (!this.running) return;

    this.attempts += 1;
    this.setStatus("reconnecting");

    if (code === CLOSE.UNAUTHORIZED) {
      // Jeton refusé ou expiré : on le renouvelle, puis on se reconnecte ; sans session, on attend la prochaine.
      // Le premier essai est immédiat ; si le serveur refuse encore (jeton valide mais compte refusé, par exemple),
      // les suivants passent par le délai croissant : jamais de boucle serrée.
      void this.options.manager.refresh().then((session) => {
        if (!this.running) return;
        if (!session) {
          this.setStatus("idle");
          return;
        }
        this.reconnectAfter(this.attempts <= 1 ? 0 : this.backoff());
      });
      return;
    }

    this.reconnectAfter(code === CLOSE.TOO_MANY_CONNECTIONS ? TOO_MANY_DELAY_MS : this.backoff());
  }

  private reconnectAfter(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  private backoff(): number {
    const base = Math.min(BASE_DELAY_MS * 2 ** (this.attempts - 1), MAX_DELAY_MS);
    const jitter = 0.8 + (this.options.random ?? Math.random)() * 0.4; // ±20 %
    return Math.round(base * jitter);
  }

  /** Ferme la connexion courante sans déclencher de reconnexion. */
  private drop(): void {
    const socket = this.socket;
    this.socket = null;
    this.authToken = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      try {
        socket.close(NORMAL_CLOSE);
      } catch {
        // déjà fermée
      }
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private setStatus(status: RealtimeStatus): void {
    if (status === this.current) return;
    this.current = status;
    for (const listener of this.listeners) listener.onStatus?.(status);
  }
}
