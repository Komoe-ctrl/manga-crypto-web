import { vi } from "vitest";
import type { OperationDto } from "@/lib/api/types.gen";

/**
 * Faux serveur d'historique pour les tests : se comporte comme `GET /api/portfolio/operations` (filtre `symbol`,
 * `limit`, pagination `before`, plus récentes d'abord) et calcule le cumul du résultat réalisé sur tout le journal ou
 * sur l'actif demandé, indépendamment de la page lue.
 */
export function fakeOperationsServer(initial: OperationDto[] = []) {
  const state = { all: initial };
  const handler = vi.fn(async ({ query = {} }: { query?: { symbol?: string; limit?: number; before?: string } } = {}) => {
    const inScope = state.all.filter((o) => !query.symbol || o.symbol === query.symbol);
    const page = inScope
      .filter((o) => !query.before || o.createdAt < query.before)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, query.limit ?? 30);
    const total = inScope.reduce((sum, o) => sum + (o.realizedPnl === null ? 0 : Number(o.realizedPnl)), 0);
    return { data: { items: page, realizedTotal: String(total) } };
  });
  return { state, handler };
}
