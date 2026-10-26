"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { sessionManager, tokenStore, type UserProfile } from "./index";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: UserProfile };

interface AuthValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Fournit l'état de connexion. Au chargement de la page, la session est rétablie par le cookie `httpOnly`
 * (`bootstrap`) : tant que la réponse n'est pas arrivée, l'état est « loading » et aucune page protégée ne s'affiche.
 *
 * Les données en cache sont **effacées** dès que la session disparaît (déconnexion, cookie révoqué) : l'utilisateur
 * suivant sur le même navigateur ne doit jamais voir celles du précédent.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const unsubscribe = tokenStore.subscribe((session) => {
      if (!active) return;
      if (session) setState({ status: "authenticated", user: session.user });
      else {
        setState({ status: "anonymous" });
        queryClient.clear();
      }
    });
    // Plusieurs appels simultanés (double exécution des effets de React en développement) partagent une seule requête.
    void sessionManager.bootstrap().then((session) => {
      if (!active) return;
      setState(session ? { status: "authenticated", user: session.user } : { status: "anonymous" });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryClient]);

  const login = useCallback(async (email: string, password: string) => {
    await sessionManager.login(email, password);
  }, []);

  const logout = useCallback(async () => {
    await sessionManager.logout();
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé sous <AuthProvider>");
  return value;
}
