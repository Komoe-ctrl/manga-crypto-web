/**
 * Adresses de l'API. Les variables `NEXT_PUBLIC_*` sont remplacées à la compilation (`next build`) : elles doivent
 * être lues par `process.env.NEXT_PUBLIC_NOM` écrit en toutes lettres, jamais par une clé calculée.
 *
 * `NEXT_PUBLIC_API_URL` est l'**origine** de l'API (`http://localhost:3001`), sans `/api` : le client généré
 * ajoute lui-même le préfixe `/api` à chaque route.
 */

/** Retire les `/` de fin : `http://x/` et `http://x` désignent la même API. */
export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** `http` devient `ws`, `https` devient `wss` ; une adresse déjà en `ws(s)` est conservée. */
export function toWebSocketUrl(url: string): string {
  return trimSlash(url).replace(/^http/i, "ws");
}

/** Chemin du WebSocket de l'API (voir `docs/SPEC.md` de crypto-api, section 8). */
export const WS_PATH = "/api/ws";

export const API_URL = trimSlash(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001");

export const WS_URL = `${toWebSocketUrl(process.env.NEXT_PUBLIC_WS_URL || API_URL)}${WS_PATH}`;
