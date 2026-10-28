import { beforeEach, describe, expect, it, vi } from "vitest";

// On regarde les options données à TanStack Query, sans exécuter de requête : c'est elles qui font que les prix suivent le marché.
const useQuery = vi.fn((options: unknown) => options);
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => useQuery(options) }));
vi.mock("@/lib/api/sdk.gen", () => ({ portfolioControllerGet: vi.fn(async () => ({ data: { assets: [] } })) }));

import { usePortfolio } from "./portfolio";

beforeEach(() => useQuery.mockClear());

describe("usePortfolio : les prix bougent, l'écran suit", () => {
  it("se relit seul toutes les 30 secondes (l'API met ses prix en cache 15 s), onglet visible seulement", () => {
    const options = usePortfolio() as unknown as { refetchInterval: number; refetchIntervalInBackground?: boolean; queryKey: string[] };
    expect(options.refetchInterval).toBe(30_000);
    expect(options.refetchIntervalInBackground).toBeUndefined(); // par défaut : pas de relecture dans un onglet caché
  });

  it("garde la clé du portefeuille : un ordre, une déclaration ou une reconnexion le relisent aussi", () => {
    const options = usePortfolio() as unknown as { queryKey: string[] };
    expect(options.queryKey).toEqual(["portfolio"]);
  });

  it("lit le portefeuille par le client de l'API", async () => {
    const { portfolioControllerGet } = await import("@/lib/api/sdk.gen");
    const options = usePortfolio() as unknown as { queryFn: () => Promise<unknown> };
    await expect(options.queryFn()).resolves.toEqual({ assets: [] });
    expect(portfolioControllerGet).toHaveBeenCalledWith({ throwOnError: true });
  });
});
