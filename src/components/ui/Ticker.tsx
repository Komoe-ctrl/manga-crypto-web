"use client";

import { useState, type ReactNode } from "react";
import { usePrivacy } from "@/lib/privacy";

interface TickerProps {
  /** Valeur suivie (chaîne décimale de l'API) : quand elle change, le contenu se teinte doucement une seconde. */
  value: string | null | undefined;
  children: ReactNode;
  className?: string;
}

/**
 * Rend visible, sans clignoter, qu'un chiffre vient de bouger : un fond vert pâle (hausse) ou orangé pâle (baisse) qui
 * s'estompe en 1,4 s. C'est l'application qui est « vivante » (les prix se rafraîchissent seuls), pas un effet de
 * décor. Aucun effet quand les montants sont masqués (la teinte révélerait le sens de la variation), ni pour qui demande
 * moins d'animations (la règle CSS est coupée).
 */
export function Ticker({ value, children, className = "" }: TickerProps) {
  const { hidden } = usePrivacy();
  const [previous, setPrevious] = useState(value);
  const [tick, setTick] = useState<{ id: number; direction: "up" | "down" } | null>(null);

  // Dérivé pendant le rendu (motif recommandé par React) : pas d'effet, pas de minuterie, l'animation CSS s'arrête seule.
  if (value !== previous) {
    setPrevious(value);
    // Une valeur absente ou vide n'est pas « 0 » (Number(null) vaut 0) : sans point de comparaison, pas de teinte.
    const comparable = previous != null && previous !== "" && value != null && value !== "";
    const before = Number(previous);
    const after = Number(value);
    if (comparable && Number.isFinite(before) && Number.isFinite(after) && before !== after) {
      setTick({ id: (tick?.id ?? 0) + 1, direction: after > before ? "up" : "down" });
    }
  }

  const effect = tick && !hidden ? (tick.direction === "up" ? "tick-up" : "tick-down") : "";
  // Changer la clé relance l'animation à chaque nouvelle variation.
  return (
    <span key={tick?.id ?? 0} className={`${effect} ${className}`.trim()} data-tick={tick && !hidden ? tick.direction : undefined}>
      {children}
    </span>
  );
}
