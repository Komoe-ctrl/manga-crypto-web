"use client";

import { Check, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "info" | "error";

interface ToastApi {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi>({ notify: () => undefined });

const DURATION_MS = 3_200;
/** Une erreur reste plus longtemps : elle demande souvent une action. */
const ERROR_DURATION_MS = 6_000;

/**
 * Confirmations discrètes (« Mode Nuit activé »). Un seul message à la fois, annoncé aux lecteurs d'écran
 * (`role="status"`, ou `alert` pour une erreur), sans animation qui clignote.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = setTimeout(() => setToast(null), tone === "error" ? ERROR_DURATION_MS : DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <div
          role={toast.tone === "error" ? "alert" : "status"}
          className={`fixed left-1/2 top-20 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-2xl border bg-surface-strong px-[18px] py-3 text-sm font-semibold shadow-2xl ${
            toast.tone === "error" ? "border-loss/40" : "border-accent/35"
          }`}
        >
          {toast.tone === "error" ? (
            <TriangleAlert className="h-[18px] w-[18px] shrink-0 text-loss" aria-hidden="true" />
          ) : (
            <Check className="h-[18px] w-[18px] shrink-0 text-accent" strokeWidth={2.4} aria-hidden="true" />
          )}
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
