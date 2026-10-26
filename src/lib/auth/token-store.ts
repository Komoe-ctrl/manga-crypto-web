/**
 * Jeton d'accès de la session, **gardé en mémoire uniquement** : jamais dans `localStorage` ni `sessionStorage`
 * (lisibles par n'importe quel script injecté). Un rechargement de la page le perd, et la session est alors
 * rétablie par le refresh token, que l'API garde dans un cookie `httpOnly` inaccessible au JavaScript.
 */

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  baseCurrency: string;
  tradingMode: "PAPER" | "LIVE";
  killSwitchActive: boolean;
}

export interface Session {
  accessToken: string;
  /** Échéance du jeton, en millisecondes depuis 1970. */
  expiresAt: number;
  user: UserProfile;
}

export type SessionListener = (session: Session | null) => void;

export interface TokenStore {
  get(): Session | null;
  set(session: Session): void;
  clear(): void;
  /** @returns la fonction de désabonnement. */
  subscribe(listener: SessionListener): () => void;
}

export function createTokenStore(): TokenStore {
  let current: Session | null = null;
  const listeners = new Set<SessionListener>();

  const notify = () => {
    for (const listener of listeners) listener(current);
  };

  return {
    get: () => current,
    set(session) {
      current = session;
      notify();
    },
    clear() {
      if (current === null) return;
      current = null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
