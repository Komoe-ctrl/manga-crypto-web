import { Eye } from "lucide-react";

/**
 * Page provisoire. Le tableau de bord sera construit à partir de
 * docs/design/CryptoDashboard.jsx, découpé en composants dans src/components/dashboard/.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-accent">
        <Eye className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="text-3xl font-extrabold tracking-tight">Veille</h1>
      <p className="text-muted">Front initialisé. Le tableau de bord arrive à l’étape front.</p>
    </main>
  );
}
