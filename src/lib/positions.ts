/**
 * Déclaration des positions : mêmes règles que l'API (`crypto-api`, `portfolio.dto.ts`), vérifiées avant l'envoi pour
 * donner un message clair tout de suite. L'API reste l'autorité. Les montants restent des **chaînes décimales** : seul le
 * séparateur change (la virgule devient un point), jamais un passage par un nombre à virgule.
 */

/** Strictement positif, 20 chiffres entiers et 18 décimales au plus. */
const POSITIVE_DECIMAL = /^(?!0+(\.0+)?$)\d{1,20}(\.\d{1,18})?$/;
const SYMBOL = /^[A-Z0-9]{2,12}$/;

export type Subject = "quantité" | "prix";

export function normalizeDecimal(raw: string): string {
  return raw.trim().replace(",", ".");
}

/** Message d'erreur, ou `null` si la valeur est acceptable. */
export function validateDecimal(raw: string, subject: Subject): string | null {
  const value = normalizeDecimal(raw);
  const label = subject === "quantité" ? "une quantité" : "un prix";
  if (value === "") return `Saisissez ${label}.`;
  if (/^0+(?:\.0*)?$/.test(value)) return subject === "quantité" ? "La quantité doit être supérieure à zéro." : "Le prix doit être supérieur à zéro.";
  if (!POSITIVE_DECIMAL.test(value)) return `${subject === "quantité" ? "Quantité" : "Prix"} invalide : un nombre positif, 18 décimales au plus.`;
  return null;
}

export function normalizeAssetSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Un actif : 2 à 12 lettres ou chiffres. Contrairement aux ordres, USDT est permis (de la trésorerie se déclare aussi). */
export function validateAssetSymbol(raw: string): string | null {
  const symbol = normalizeAssetSymbol(raw);
  if (symbol === "") return "Choisissez un actif.";
  if (!SYMBOL.test(symbol)) return "Symbole invalide : 2 à 12 lettres ou chiffres.";
  return null;
}

export type PositionMode = "BUY" | "SELL" | "CORRECT";

export const MODE_OPTIONS = [
  ["BUY", "Achat"],
  ["SELL", "Vente"],
  ["CORRECT", "Corriger"],
] as const;

/** Ce que fait chaque mode, en une phrase : c'est ce qui évite de se tromper entre « acheter » et « corriger ». */
export const MODE_HELP: Record<PositionMode, string> = {
  BUY: "Ajoute à votre position et recalcule votre prix d'achat moyen.",
  SELL: "Retire de votre position. Le prix d'achat moyen ne change pas ; le gain réalisé est calculé.",
  CORRECT: "Remplace la quantité et le prix d'achat moyen de cet actif par ces valeurs (import initial ou rectification).",
};

/** Gain ou perte réalisé annoncé après une vente, ou « » si l'API n'en donne pas. */
export function describeRealized(realizedPnl: string | null, format: (value: string) => string): string {
  if (realizedPnl === null) return "";
  return ` Résultat réalisé : ${format(realizedPnl)}.`;
}
