import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";

/** Client de test : aucune nouvelle tentative (un échec doit se voir tout de suite), aucun cache entre deux tests. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
}

export function wrapper(client: QueryClient = makeQueryClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

/** Rend un composant avec TanStack Query et les notifications visuelles, comme dans l'application. */
export function renderWithProviders(ui: ReactElement, options: RenderOptions & { client?: QueryClient } = {}) {
  const { client, ...rest } = options;
  const queryClient = client ?? makeQueryClient();
  return { queryClient, ...render(ui, { wrapper: wrapper(queryClient), ...rest }) };
}
