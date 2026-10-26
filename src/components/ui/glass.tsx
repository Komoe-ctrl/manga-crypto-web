import type { ComponentPropsWithoutRef } from "react";

/** Carte de la maquette : fond translucide, bordure fine, grands arrondis. */
export function Glass({ className = "", children, ...rest }: ComponentPropsWithoutRef<"section">) {
  return (
    <section {...rest} className={`rounded-3xl border border-line bg-surface backdrop-blur-xl ${className}`}>
      {children}
    </section>
  );
}
