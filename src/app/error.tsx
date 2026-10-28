"use client";

import { TriangleAlert } from "lucide-react";
import { StatusScreen } from "@/components/shell/StatusScreen";

/** Dernier filet : une erreur inattendue d'affichage ne laisse jamais un écran blanc. Rien de technique n'est montré. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusScreen icon={TriangleAlert} title="Un problème est survenu" description="Vos données et vos ordres ne sont pas touchés. Réessayez dans un instant.">
      <button type="button" onClick={reset} className="h-12 rounded-xl bg-accent px-6 text-sm font-bold text-accent-ink hover:brightness-110">
        Réessayer
      </button>
    </StatusScreen>
  );
}
