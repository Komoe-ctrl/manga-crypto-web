import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Titre d'une page : une icône, le titre (le seul `h1` de la page) et une phrase qui dit à quoi elle sert. */
export function PageHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description?: ReactNode }) {
  return (
    <header className="flex items-center gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/25 bg-accent/[0.12] text-accent shadow-[0_0_30px_-10px_var(--color-accent)]">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
    </header>
  );
}

const WIDTH = {
  /** Réglages, rapports, historique : une colonne de lecture. */
  md: "max-w-3xl",
  /** Alertes : la liste et le formulaire côte à côte. */
  lg: "max-w-5xl",
  /** Tableau de bord : toute la largeur de l'application. */
  full: "",
} as const;

/** Colonne centrée d'une page : le contenu ne reste pas collé à gauche, quelle que soit la largeur de l'écran. */
export function PageColumn({ width = "md", children }: { width?: keyof typeof WIDTH; children: ReactNode }) {
  return <div className={`mx-auto flex w-full min-w-0 flex-col gap-6 ${WIDTH[width]}`}>{children}</div>;
}
