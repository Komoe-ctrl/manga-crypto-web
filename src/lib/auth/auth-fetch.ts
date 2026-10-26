import type { SessionManager } from "./session-manager";
import type { TokenStore } from "./token-store";

export interface AuthFetchOptions {
  store: TokenStore;
  manager: Pick<SessionManager, "refresh">;
  fetchImpl?: typeof fetch;
}

/**
 * `fetch` du client généré : ajoute le jeton d'accès à chaque requête et, sur un **401**, renouvelle le jeton une
 * fois puis rejoue la requête. Un second 401 est renvoyé tel quel (c'est un vrai refus, pas un jeton périmé).
 *
 * Le client généré appelle `fetch(request)` avec un objet `Request` : on le clone **avant** l'envoi, car un corps de
 * requête ne se lit qu'une fois et la nouvelle tentative en a besoin.
 */
export function createAuthFetch({ store, manager, fetchImpl }: AuthFetchOptions): typeof fetch {
  const send = fetchImpl ?? ((input, init) => fetch(input, init));

  const withToken = (request: Request, token: string | undefined): Request => {
    if (!token) return request;
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return new Request(request, { headers });
  };

  return async (input, init) => {
    const request = new Request(input, { credentials: "include", ...init });
    const retry = request.clone();

    const first = await send(withToken(request, store.get()?.accessToken));
    if (first.status !== 401) return first;

    // Jeton refusé : une seule tentative de renouvellement, partagée avec les autres requêtes en cours.
    const session = await manager.refresh();
    if (!session) return first; // plus de session : l'application renverra l'utilisateur vers la connexion
    return send(withToken(retry, session.accessToken));
  };
}
