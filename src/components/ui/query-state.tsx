import { Glass } from "@/components/ui/glass";

/** Chargement d'une carte : annoncé comme occupé, sans animation qui clignote. */
export function CardLoading({ children }: { children: string }) {
  return (
    <Glass aria-busy="true" className="p-7 text-muted">
      {children}
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
