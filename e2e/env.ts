/**
 * Réglages communs des tests de navigateur. Ports et base **dédiés** : ils ne touchent ni à l'application de
 * démonstration (3100 / 3999) ni à la base de développement.
 */
export const API_PORT = 3996;
export const WEB_PORT = 3101;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const DB_NAME = "crypto_e2e";
/** Redis n° 9 : les files de l'application de démonstration (n° 0) ne sont pas touchées. */
export const REDIS_DB = 9;

export const USER = { email: "e2e@veille.local", password: "un-mot-de-passe-solide", timezone: "Europe/Paris" };

/** Portefeuille de départ : de quoi voir des courbes, passer des ordres et dépasser le seuil d'exposition. */
export const HOLDINGS = [
  { symbol: "USDT", quantity: "10000", avgBuyPrice: "1" },
  { symbol: "BTC", quantity: "0.05", avgBuyPrice: "60000" },
  { symbol: "ETH", quantity: "1.2", avgBuyPrice: "2500" },
] as const;
