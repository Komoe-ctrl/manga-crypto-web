import type { AuthResponseDto } from "@/lib/api/types.gen";
import type { Session, TokenStore } from "./token-store";

/** Le jeton est renouvelé un peu avant son échéance, pour qu'aucune requête ne parte avec un jeton périmé. */
const REFRESH_MARGIN_MS = 60_000;
/** Si l'échéance est plus proche que la marge, on attend au moins ce délai : jamais de boucle de renouvellement. */
const MIN_REFRESH_DELAY_MS = 5_000;
/** Plafond de `setTimeout` (délai sur 32 bits signés). */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Les échecs d'authentification qu'un formulaire doit pouvoir distinguer. */
export type LoginFailure = "invalid_credentials" | "rate_limited" | "unreachable" | "unknown";

export class LoginError extends Error {
  constructor(readonly reason: LoginFailure) {
    super(reason);
    this.name = "LoginError";
  }
}

/** Exécute `task` en exclusion mutuelle entre tous les onglets du navigateur. */
export type LockRunner = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Verrou entre onglets (Web Locks). Indispensable : l'API détecte la **réutilisation** d'un refresh token (un jeton
 * déjà consommé présenté une seconde fois) et révoque alors toute la chaîne, donc déconnecte l'utilisateur. Deux onglets
 * qui renouvelleraient en même temps présenteraient le même jeton. Sérialisés, le second présente le nouveau cookie.
 * Sans Web Locks (navigateur ancien, tests), on exécute directement.
 */
export const browserLock: LockRunner = (task) => {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request("veille-session-refresh", task) : task();
};

export interface SessionManagerOptions {
  /** Origine de l'API, sans `/api` final. */
  apiUrl: string;
  store: TokenStore;
  fetchImpl?: typeof fetch;
  lock?: LockRunner;
  now?: () => number;
}

/**
 * Gère la session : connexion, déconnexion, rétablissement par le cookie `httpOnly` et renouvellement du jeton.
 * Les requêtes d'authentification passent par `fetch` directement (pas par le client généré, qui dépend de ce
 * gestionnaire) et portent toujours `credentials: "include"` pour que le cookie soit envoyé et reçu.
 */
export class SessionManager {
  private readonly apiUrl: string;
  private readonly store: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private readonly lock: LockRunner;
  private readonly now: () => number;
  private inFlight: Promise<Session | null> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SessionManagerOptions) {
    this.apiUrl = options.apiUrl;
    this.store = options.store;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.lock = options.lock ?? browserLock;
    this.now = options.now ?? Date.now;
  }

  /** Rétablit la session au chargement de la page : renvoie `null` si l'utilisateur n'est pas (ou plus) connecté. */
  bootstrap(): Promise<Session | null> {
    return this.refresh();
  }

  async login(email: string, password: string): Promise<Session> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiUrl}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new LoginError("unreachable");
    }
    if (response.status === 401) throw new LoginError("invalid_credentials");
    if (response.status === 429) throw new LoginError("rate_limited");
    if (!response.ok) throw new LoginError("unknown");
    try {
      return this.open((await response.json()) as AuthResponseDto);
    } catch {
      throw new LoginError("unknown"); // réponse illisible
    }
  }

  /**
   * Renouvelle le jeton avec le cookie. **Une seule demande à la fois** dans l'onglet (les appels simultanés partagent
   * la même promesse : le double appel des effets de React en développement n'envoie qu'une requête), et une seule à
   * la fois entre onglets (verrou).
   *
   * @returns la session, ou `null` si le renouvellement est refusé (cookie absent, expiré ou révoqué). Une panne
   * réseau ne déconnecte pas : la session en mémoire est conservée et le renouvellement sera retenté.
   */
  refresh(): Promise<Session | null> {
    this.inFlight ??= this.lock(() => this.doRefresh()).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async logout(): Promise<void> {
    this.cancelTimer();
    this.store.clear();
    try {
      await this.fetchImpl(`${this.apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // Hors ligne : la session locale est déjà effacée, le cookie expirera ou sera révoqué à la prochaine connexion.
    }
  }

  /** Arrête le renouvellement automatique (démontage de l'application, tests). */
  dispose(): void {
    this.cancelTimer();
  }

  private async doRefresh(): Promise<Session | null> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiUrl}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      this.scheduleRetry();
      return this.store.get();
    }
    if (response.status === 401 || response.status === 403) {
      this.cancelTimer();
      this.store.clear();
      return null;
    }
    if (!response.ok) {
      this.scheduleRetry();
      return this.store.get();
    }
    try {
      return this.open((await response.json()) as AuthResponseDto);
    } catch {
      this.scheduleRetry(); // réponse illisible : comme une panne passagère
      return this.store.get();
    }
  }

  private open(body: AuthResponseDto): Session {
    const session: Session = {
      accessToken: body.accessToken,
      expiresAt: this.now() + body.expiresIn * 1000,
      user: body.user,
    };
    this.store.set(session);
    this.scheduleRefresh(session.expiresAt);
    return session;
  }

  private scheduleRefresh(expiresAt: number): void {
    const delay = Math.max(expiresAt - this.now() - REFRESH_MARGIN_MS, MIN_REFRESH_DELAY_MS);
    this.schedule(delay);
  }

  /** Nouvel essai après une panne passagère. */
  private scheduleRetry(): void {
    this.schedule(MIN_REFRESH_DELAY_MS * 2);
  }

  private schedule(delay: number): void {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, Math.min(delay, MAX_TIMER_MS));
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
