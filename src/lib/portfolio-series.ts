import type { AssetValuationDto, TrendsDto } from "@/lib/api/types.gen";
import { trendOf } from "@/lib/queries/trends";

/** Monnaies à 1 USD fixe : leur valeur ne bouge pas, elles n'ont pas de courbe (comme côté API). */
const STABLECOINS = new Set(["USD", "USDT", "USDC", "FDUSD", "DAI"]);
/** La série couvre 7 jours : le premier point date d'il y a 167 heures (168 clôtures horaires), le dernier est « maintenant ». */
const SPAN_HOURS = 167;

export interface SeriesPoint {
  /** Valeur du portefeuille en USD à ce moment (nombre : sert au tracé et à l'affichage, jamais à un calcul de gain). */
  value: number;
  /** Ancienneté approximative du point, en heures (0 = maintenant). */
  hoursAgo: number;
}

export interface PortfolioSeries {
  points: SeriesPoint[];
  /** Vrai si des actifs ont dû être laissés de côté (courbe indisponible ou trop courte) : le tracé est alors incomplet. */
  partial: boolean;
  /** Les actifs laissés de côté. */
  missing: string[];
}

/**
 * Valeur du portefeuille sur 7 jours **avec les positions actuelles** : pour chaque point, Σ quantité actuelle × prix de
 * l'époque. Ce n'est PAS l'historique réel (l'API ne le garde pas) : si les quantités ont changé pendant la semaine, le
 * passé réel était différent. L'écran le dit. Les courbes viennent des tendances (mêmes points pour tous les actifs).
 *
 * Renvoie `null` s'il n'y a rien d'honnête à tracer : aucune courbe d'actif non stable disponible.
 */
export function portfolioSeries(assets: readonly AssetValuationDto[], trends: TrendsDto | undefined): PortfolioSeries | null {
  if (!trends) return null;
  const lengths = assets.flatMap((a) => (STABLECOINS.has(a.symbol) ? [] : [trendOf(trends, a.symbol)?.sparkline.length ?? 0])).filter((n) => n > 1);
  if (lengths.length === 0) return null;
  const n = Math.max(...lengths);

  const totals = new Array<number>(n).fill(0);
  const missing: string[] = [];
  for (const asset of assets) {
    const quantity = Number(asset.quantity);
    if (!Number.isFinite(quantity)) {
      missing.push(asset.symbol);
      continue;
    }
    if (STABLECOINS.has(asset.symbol)) {
      for (let i = 0; i < n; i++) totals[i] += quantity; // 1 USD l'unité
      continue;
    }
    const series = trendOf(trends, asset.symbol)?.sparkline.map(Number);
    if (!series || series.length !== n || series.some((p) => !Number.isFinite(p))) {
      missing.push(asset.symbol);
      continue;
    }
    for (let i = 0; i < n; i++) totals[i] += quantity * series[i];
  }

  return {
    points: totals.map((value, i) => ({ value, hoursAgo: (n - 1 - i) * (SPAN_HOURS / (n - 1)) })),
    partial: missing.length > 0,
    missing,
  };
}

export interface ChartGeometry {
  /** Points du tracé de la ligne (`x,y x,y …`). */
  line: string;
  /** Contour fermé de la zone sous la courbe (pour le dégradé). */
  area: string;
  xs: number[];
  ys: number[];
}

/** Géométrie d'une courbe dans un cadre `width` × `height` avec une marge `pad` ; une série plate est tracée au milieu. */
export function chartGeometry(values: readonly number[], width: number, height: number, pad = 4): ChartGeometry {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const xs = values.map((_, i) => pad + i * step);
  const ys = values.map((v) => (span === 0 ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2)));
  const line = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const area = `${xs[0].toFixed(1)},${height} ${line} ${xs[xs.length - 1].toFixed(1)},${height}`;
  return { line, area, xs, ys };
}

/** Indice du point le plus proche d'une abscisse `x` (0 à `width`) : pour la lecture au survol ou au toucher. */
export function nearestIndex(x: number, width: number, count: number): number {
  if (count <= 1 || width <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round((x / width) * (count - 1))));
}

/** « maintenant », « il y a 5 h », « il y a 3 j » : approximatif, d'où le « environ » que l'écran y ajoute. */
export function describeAge(hoursAgo: number): string {
  if (hoursAgo < 1.5) return "maintenant";
  if (hoursAgo < 48) return `il y a ${Math.round(hoursAgo)} h`;
  return `il y a ${Math.round(hoursAgo / 24)} j`;
}

export interface DonutSegment {
  symbol: string;
  pct: number;
  /** Longueur visible de l'arc (en unités de circonférence), un petit intervalle étant retiré entre deux arcs. */
  length: number;
  /** Décalage de départ de l'arc (négatif, à donner à `strokeDashoffset`). */
  offset: number;
}

/**
 * Arcs d'un anneau pour des parts en % (déjà triées) : un cercle de rayon `r`, chaque arc proportionnel à sa part.
 * Une part unique de 100 % donne un cercle plein (sans intervalle).
 */
export function donutSegments(shares: readonly { symbol: string; pct: number }[], r: number, gap = 2): DonutSegment[] {
  const circumference = 2 * Math.PI * r;
  const total = shares.reduce((sum, s) => sum + s.pct, 0);
  if (total <= 0) return [];
  let start = 0;
  return shares.map((s) => {
    const full = (s.pct / total) * circumference;
    const length = shares.length === 1 ? full : Math.max(full - gap, 0.5);
    const segment = { symbol: s.symbol, pct: s.pct, length, offset: -start };
    start += full;
    return segment;
  });
}
