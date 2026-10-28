"use client";

import { useId, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AssetValuationDto, TrendsDto } from "@/lib/api/types.gen";
import { TONE_CLASS, formatMoney, formatPercent, tone } from "@/lib/format";
import { chartGeometry, describeAge, nearestIndex, portfolioSeries } from "@/lib/portfolio-series";
import { usePrivacy } from "@/lib/privacy";

const W = 600;
const H = 160;

interface PortfolioChartProps {
  assets: readonly AssetValuationDto[];
  trends: TrendsDto | undefined;
  /** `loading` : les tendances arrivent ; `unavailable` : elles n'ont pas pu être lues ; `ready` : on les a. */
  status: "loading" | "unavailable" | "ready";
  currency: string;
}

/**
 * Valeur du portefeuille sur 7 jours, avec les positions ACTUELLES (l'API ne garde pas l'historique réel : l'écran le
 * dit). Lecture d'un point au survol, au toucher ou au clavier (flèches, Début, Fin) ; sans interaction, le dernier
 * point (maintenant). Verte si la valeur a monté sur la période, orangée sinon ; la couleur ne porte pas seule
 * l'information : le pourcentage et la valeur sont écrits.
 */
export function PortfolioChart({ assets, trends, status, currency }: PortfolioChartProps) {
  const { mask } = usePrivacy();
  const gradient = `fade-${useId().replace(/:/g, "")}`;
  const series = useMemo(() => portfolioSeries(assets, trends), [assets, trends]);
  const geometry = useMemo(() => (series ? chartGeometry(series.points.map((p) => p.value), W, H) : null), [series]);
  const [cursor, setCursor] = useState<number | null>(null);

  if (status === "loading") return <Skeleton aria-hidden="true" className="h-40 w-full" />;
  if (!series || !geometry) {
    return (
      <p className="text-[13px] text-muted">
        {status === "unavailable"
          ? "La courbe de valeur est indisponible pour le moment."
          : "Pas de courbe : le portefeuille ne contient que de la trésorerie en USDT, ou les prix sont indisponibles."}
      </p>
    );
  }

  const { points, partial, missing } = series;
  const last = points.length - 1;
  const index = cursor ?? last;
  const point = points[index];
  const first = points[0].value;
  const change = first > 0 ? ((points[last].value - first) / first) * 100 : null;
  const direction = change === null ? "neutral" : tone(String(change));
  const color = direction === "loss" ? "text-loss" : "text-gain";

  const move = (to: number) => setCursor(Math.min(last, Math.max(0, to)));
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: last }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    move(step);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[13px] font-semibold text-ink-soft">Évolution sur 7 jours</span>
        {change !== null && (
          <span className={`text-[13px] font-bold tabular-nums ${TONE_CLASS[direction]}`}>{formatPercent(change.toFixed(2))}</span>
        )}
      </div>

      <div
        role="group"
        aria-label="Valeur du portefeuille sur 7 jours"
        tabIndex={0}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - box.left) / box.width) * W;
          // Zone repliée (largeur nulle) ou position illisible : on ne bouge pas le curseur.
          if (box.width > 0 && Number.isFinite(x)) move(nearestIndex(x, W, points.length));
        }}
        onPointerLeave={() => setCursor(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setCursor(null)}
        className={`touch-pan-y rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${color}`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line key={ratio} x1="0" x2={W} y1={H * ratio} y2={H * ratio} stroke="currentColor" strokeOpacity="0.07" />
          ))}
          <polygon points={geometry.area} fill={`url(#${gradient})`} />
          <polyline points={geometry.line} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
          {cursor !== null && (
            <line x1={geometry.xs[index]} x2={geometry.xs[index]} y1="0" y2={H} stroke="currentColor" strokeOpacity="0.4" strokeDasharray="3 4" />
          )}
          <circle cx={geometry.xs[index]} cy={geometry.ys[index]} r="5" fill="currentColor" stroke="var(--color-canvas)" strokeWidth="2.5" />
        </svg>
      </div>

      <p aria-live="polite" className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px] text-muted">
        <span className="font-bold tabular-nums text-ink">{mask(formatMoney(String(point.value), currency))}</span>
        <span>{index === last ? "maintenant" : `≈ ${describeAge(point.hoursAgo)}`}</span>
      </p>
      <p className="text-xs text-muted">
        Avec vos positions actuelles (l’historique réel n’est pas conservé).
        {partial && ` Sans ${missing.join(", ")} : courbe indisponible.`}
      </p>
    </div>
  );
}
