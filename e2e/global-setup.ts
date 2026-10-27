import { API_URL, HOLDINGS, USER } from "./env";

/**
 * Rejoue un appel coupé par le réseau (l'API vient de démarrer et peut réinitialiser une toute première connexion).
 * Seule une **erreur réseau** est rejouée : une réponse HTTP, même en erreur, est définitive.
 */
async function withNetworkRetry(call: () => Promise<Response>, attempts = 5): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      return await call();
    } catch (error) {
      if (i >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

/**
 * Après le démarrage de l'API et du front : crée le compte de test et son portefeuille. Le jeton renvoyé par
 * l'inscription sert à déclarer les positions ; **aucune connexion n'est faite ici** (la connexion, l'inscription et
 * le renouvellement sont limités à 5 par minute : on garde ces appels pour les parcours eux-mêmes).
 */
export default async function globalSetup(): Promise<void> {
  const register = await withNetworkRetry(() =>
    fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(USER),
    }),
  );
  if (register.status !== 201) throw new Error(`Inscription du compte de test refusée (${register.status}) : ${await register.text()}`);
  const { accessToken } = (await register.json()) as { accessToken: string };

  for (const { symbol, ...body } of HOLDINGS) {
    const res = await fetch(`${API_URL}/api/portfolio/assets/${symbol}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Position ${symbol} refusée (${res.status}) : ${await res.text()}`);
  }
}
