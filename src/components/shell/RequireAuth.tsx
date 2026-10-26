"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/auth-provider";

/**
 * Protège une page : sans session, renvoie vers la connexion. Tant que la session n'est pas rétablie (le cookie est
 * en cours de vérification), rien de protégé n'est affiché.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "anonymous") router.replace("/login");
  }, [state.status, router]);

  if (state.status !== "authenticated") {
    return (
      <main aria-busy="true" className="flex min-h-screen items-center justify-center text-muted">
        Chargement…
      </main>
    );
  }
  return <>{children}</>;
}
