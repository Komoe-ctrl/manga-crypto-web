import { client } from "@/lib/api/client.gen";
import { API_URL } from "@/lib/config";
import { createAuthFetch } from "./auth-fetch";
import { SessionManager } from "./session-manager";
import { createTokenStore } from "./token-store";

/**
 * Session de l'application : un seul jeu (jeton en mémoire, gestionnaire, client HTTP) par onglet, créé à la première
 * importation. Le client généré est configuré ici, une fois : adresse de l'API et `fetch` qui porte le jeton.
 */
export const tokenStore = createTokenStore();
export const sessionManager = new SessionManager({ apiUrl: API_URL, store: tokenStore });

client.setConfig({
  baseUrl: API_URL,
  fetch: createAuthFetch({ store: tokenStore, manager: sessionManager }),
});

export { LoginError } from "./session-manager";
export type { LoginFailure } from "./session-manager";
export type { Session, UserProfile } from "./token-store";
