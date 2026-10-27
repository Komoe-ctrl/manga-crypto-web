/**
 * Formatage des montants pour l'affichage. L'API renvoie les montants en **chaînes décimales** (jamais en nombres
 * JSON) : on ne les convertit en nombre que pour les afficher, jamais pour calculer.
 */

const LOCALE = "fr-FR";
/** Les montants masqués ne révèlent ni la valeur ni sa longueur. */
export const MASK = "•••••";

export type Amount = string | number | null | undefined;

export function toNumber(value: Amount): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(value: Amount, currency = "USD", digits = 2): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** Montant avec son signe explicite : « +1 234,00 $US » ou « −56,00 $US » (vrai signe moins). */
export function formatSigned(value: Amount, currency = "USD", digits = 2): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return (n >= 0 ? "+" : "−") + formatMoney(Math.abs(n), currency, digits);
}

export function formatPercent(value: Amount): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const text = Math.abs(n).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n >= 0 ? "+" : "−"}${text} %`;
}

/** Part dans le portefeuille : sans signe, arrondie à l'unité. */
export function formatWeight(value: Amount): string {
  const n = toNumber(value);
  return n === null ? "—" : `${Math.round(n)} %`;
}

/**
 * Quantité d'un actif : 4 décimales au plus à partir d'une unité, **8 en dessous**. Avec 4 partout, 0,00001234 BTC (environ
 * 1 $) s'affichait « 0 » : une position non nulle ne doit jamais sembler vide.
 */
export function formatQuantity(value: Amount): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return n.toLocaleString(LOCALE, { maximumFractionDigits: Math.abs(n) < 1 ? 8 : 4 });
}

/** Prix d'un actif : quatre décimales sous 10 $ (les petits prix perdraient tout sens avec deux). */
export function formatPrice(value: Amount, currency = "USD"): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return formatMoney(n, currency, Math.abs(n) < 10 ? 4 : 2);
}

export type Tone = "gain" | "loss" | "neutral";

/** Couleur d'un résultat : en dessous d'un centime, ni gain ni perte (l'interface reste calme). */
export function tone(value: Amount): Tone {
  const n = toNumber(value);
  if (n === null || Math.abs(n) < 0.01) return "neutral";
  return n > 0 ? "gain" : "loss";
}

export const TONE_CLASS: Record<Tone, string> = {
  gain: "text-gain",
  loss: "text-loss",
  neutral: "text-ink-soft",
};

/** Couleur stable d'un actif (barre d'allocation, pastille) : même symbole, même teinte, sans palette codée en dur. */
export function assetHue(symbol: string): number {
  let hash = 0;
  for (const char of symbol) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

/**
 * Lettres de la pastille d'un actif : le symbole entier jusqu'à trois lettres (BTC, ETH, SOL), les deux premières
 * au-delà (LINK devient LI, USDC devient US) : une troncature à trois lettres donnerait « LIN », qui ne veut rien dire.
 */
export function assetBadge(symbol: string): string {
  return symbol.length <= 3 ? symbol : symbol.slice(0, 2);
}
