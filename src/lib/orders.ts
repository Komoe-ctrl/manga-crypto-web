import type { OrderDto } from "@/lib/api/types.gen";

export const STATUS_LABEL: Record<OrderDto["status"], string> = {
  PENDING: "En attente",
  SUBMITTED: "Envoyé",
  PARTIALLY_FILLED: "Partiellement exécuté",
  FILLED: "Exécuté",
  CANCELLED: "Annulé",
  REJECTED: "Refusé",
  FAILED: "Échoué",
};

export const ORIGIN_LABEL: Record<OrderDto["origin"], string> = {
  MANUAL: "Manuel",
  SIGNAL: "Signal du moteur",
  STOP_LOSS: "Stop-loss",
  TAKE_PROFIT: "Take-profit",
};

export const SIDE_LABEL: Record<OrderDto["side"], string> = { BUY: "Achat", SELL: "Vente" };

/** Ton d'un statut : un refus ou un échec se voit, une attente reste neutre. */
export function statusTone(status: OrderDto["status"]): "gain" | "loss" | "neutral" {
  if (status === "FILLED") return "gain";
  if (status === "REJECTED" || status === "FAILED") return "loss";
  return "neutral";
}

/**
 * Motifs de refus (`failureReason`), repris de `crypto-api` (`order-rules.ts`). Un code inconnu — version future de
 * l'API — reste lisible : le code brut n'est jamais montré tel quel.
 */
const REASONS: Record<string, string> = {
  kill_switch: "Le robot est arrêté (kill switch actif).",
  paused_daily_loss: "Le robot est en pause : perte journalière maximale atteinte.",
  manual_orders_paper_only: "Les ordres manuels ne sont disponibles qu'en mode PAPER.",
  symbol_not_tradable: "Ce symbole ne peut pas être négocié.",
  price_unavailable: "Prix indisponible : réessayez dans un instant.",
  capital_unknown: "Capital total non calculable (un prix manque) : aucun ordre n'est passé à l'aveugle.",
  exposure_exceeded: "Exposition maximale par position dépassée.",
  insufficient_funds: "Fonds insuffisants.",
  insufficient_quantity: "Quantité insuffisante pour cette vente.",
  no_verified_exchange: "Aucune configuration d'échange active, vérifiée et hors testnet.",
  mode_changed: "Le mode de trading a changé depuis la création de l'ordre.",
  below_minimum: "Quantité inférieure au minimum de la plateforme.",
  invalid_order: "Ordre refusé par la plateforme.",
  invalid_symbol: "Paire inconnue de la plateforme.",
  exchange_auth: "Clé API refusée par la plateforme.",
  retries_exhausted: "La plateforme est restée injoignable : ordre abandonné.",
};

export function describeFailure(reason: string | null): string {
  if (!reason) return "Motif non précisé.";
  return REASONS[reason] ?? "Motif non reconnu : consultez le journal du serveur.";
}

/** Quantité d'actif : décimal strictement positif, 18 décimales au plus (comme l'API). Aucune conversion en nombre. */
const QUANTITY = /^\d+(?:\.\d{1,18})?$/;

export function validateQuantity(raw: string): string | null {
  const value = raw.trim().replace(",", ".");
  if (value === "") return "Saisissez une quantité.";
  if (!QUANTITY.test(value)) return "Quantité invalide : un nombre positif, 18 décimales au plus.";
  if (/^0+(?:\.0*)?$/.test(value)) return "La quantité doit être supérieure à zéro.";
  return null;
}

/** Forme envoyée à l'API : virgule remplacée par un point, rien d'autre ne change. */
export function normalizeQuantity(raw: string): string {
  return raw.trim().replace(",", ".");
}

/**
 * L'API enregistre et renvoie la **paire** d'un ordre (« BTC/USDT »), alors qu'elle reçoit l'actif de base (« BTC »).
 * On affiche l'actif : la monnaie de règlement est toujours USDT et alourdirait chaque ligne.
 */
export function baseAsset(pair: string): string {
  return pair.split("/")[0];
}

/** Symbole d'actif : lettres et chiffres, majuscules (la paire est `<actif>/USDT`). */
export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateSymbol(raw: string): string | null {
  const symbol = normalizeSymbol(raw);
  if (symbol === "") return "Choisissez un actif.";
  if (!/^[A-Z0-9]{2,12}$/.test(symbol)) return "Symbole invalide : 2 à 12 lettres ou chiffres.";
  if (symbol === "USDT") return "USDT est la monnaie de règlement : choisissez un autre actif.";
  return null;
}
