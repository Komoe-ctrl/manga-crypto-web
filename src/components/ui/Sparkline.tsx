interface SparklineProps {
  /** Prix du plus ancien au plus récent, en chaînes décimales (comme l'API) : converties **pour le tracé seulement**. */
  values: readonly string[];
  /** Texte lu par les lecteurs d'écran à la place de l'image (la courbe seule ne dit rien sans voir). */
  label: string;
  width?: number;
  height?: number;
}

const PAD = 2;

/** Valeurs lisibles : une chaîne vide vaut 0 pour Number() et serait tracée comme un vrai point, on l'écarte. */
function readable(values: readonly string[]): number[] {
  return values.filter((v) => v.trim() !== "").map(Number).filter((n) => Number.isFinite(n));
}

/** Points du tracé dans un cadre `width` × `height`, ou `null` s'il manque de quoi tracer (moins de 2 valeurs lisibles). */
export function sparklinePoints(values: readonly string[], width: number, height: number): string | null {
  const numbers = readable(values);
  if (numbers.length < 2) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min;
  const step = (width - PAD * 2) / (numbers.length - 1);
  return numbers
    .map((n, i) => {
      // Série plate : une ligne au milieu plutôt qu'une division par zéro.
      const y = span === 0 ? height / 2 : PAD + (1 - (n - min) / span) * (height - PAD * 2);
      return `${(PAD + i * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Sens de la courbe : de la première à la dernière valeur lisible. */
export function sparklineTrend(values: readonly string[]): "up" | "down" | "flat" | null {
  const numbers = readable(values);
  if (numbers.length < 2) return null;
  const delta = numbers[numbers.length - 1] - numbers[0];
  return delta > 0 ? "up" : delta < 0 ? "down" : "flat";
}

const STROKE = { up: "stroke-gain", down: "stroke-loss", flat: "stroke-muted" } as const;

/**
 * Petite courbe sans axes (la maquette n'en a pas) : verte si elle monte sur la période, orangée si elle baisse. La
 * couleur ne porte pas seule l'information : le libellé donne la variation. Rien n'est dessiné sans au moins deux points.
 */
export function Sparkline({ values, label, width = 96, height = 32 }: SparklineProps) {
  const points = sparklinePoints(values, width, height);
  const trend = sparklineTrend(values);
  if (!points || !trend) return <span aria-hidden="true" className="text-muted">—</span>;

  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block overflow-visible">
      <polyline points={points} fill="none" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" className={STROKE[trend]} />
    </svg>
  );
}
