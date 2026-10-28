import { Glass } from "@/components/ui/glass";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Chargement d'une carte : un emplacement doux (la mise en page ne saute pas à l'arrivée des données), annoncé comme
 * occupé aux lecteurs d'écran par son texte.
 */
export function CardLoading({ children }: { children: string }) {
  return (
    <Glass aria-busy="true" className="flex flex-col gap-3 p-7">
      <span className="sr-only">{children}</span>
      <Skeleton aria-hidden="true" className="h-5 w-1/3" />
      <Skeleton aria-hidden="true" className="h-10 w-2/3" />
    </Glass>
  );
}

/** Échec de chargement d'une carte, avec « Réessayer ». */
export function CardError({ children, onRetry, retrying }: { children: string; onRetry: () => void; retrying: boolean }) {
  return (
    <Glass role="alert" className="flex flex-col items-start gap-4 p-7">
      <p className="text-loss">{children}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold text-ink-soft hover:bg-surface disabled:opacity-60"
      >
        Réessayer
      </button>
    </Glass>
  );
}
