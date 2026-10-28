import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Écran plein page (introuvable, erreur) : icône, titre, phrase, et l'action à faire. */
export function StatusScreen({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/25 bg-accent/[0.12] text-accent shadow-[0_0_40px_-10px_var(--color-accent)]">
        <Icon className="h-8 w-8" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {children}
    </main>
  );
}
