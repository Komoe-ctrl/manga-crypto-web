import type { ComponentPropsWithoutRef } from "react";

/**
 * Emplacement d'un contenu qui arrive : un bloc doux qui respire lentement, à la place d'un texte « Chargement… » qui
 * fait sauter la mise en page. L'animation est coupée pour qui demande moins de mouvement.
 */
export function Skeleton({ className = "", ...rest }: ComponentPropsWithoutRef<"div">) {
  return <div {...rest} className={`animate-pulse rounded-2xl bg-white/[0.06] motion-reduce:animate-none ${className}`} />;
}
