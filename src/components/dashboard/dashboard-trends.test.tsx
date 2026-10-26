import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrendsDto } from "@/lib/api/types.gen";
import { PrivacyProvider } from "@/lib/privacy";
import { SAMPLE } from "./fixtures";

let trends: { data?: TrendsDto; isError: boolean };
vi.mock("@/lib/queries/portfolio", () => ({
  usePortfolio: () => ({ data: SAMPLE, error: null, isPending: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/queries/trends", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries/trends")>()),
  useTrends: () => trends,
}));
vi.mock("@/components/bot/BotStatusCard", () => ({ BotStatusCard: () => null }));
vi.mock("@/components/orders/OrdersCard", () => ({ OrdersCard: () => null }));

import { Dashboard } from "./Dashboard";

const show = () =>
  render(
    <PrivacyProvider>
      <Dashboard />
    </PrivacyProvider>,
  );

beforeEach(() => {
  trends = { data: undefined, isError: false };
});

describe("Dashboard : les tendances ne bloquent jamais le portefeuille", () => {
  it("tendances chargées : pastille de marché et courbes", () => {
    trends = {
      isError: false,
      data: {
        market: { state: "DOWN", btcChange24hPct: "-3.4" },
        complete: true,
        assets: [{ symbol: "BTC", change24hPct: "-3.4", change7dPct: "1.2", sparkline: ["1", "2", "3"] }],
      },
    };
    show();
    expect(screen.getByText(/Marché en baisse/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /BTC sur 7 jours/ })).toBeTruthy();
    expect(screen.getByTestId("wallet-total")).toBeTruthy();
  });

  it("tendances pas encore là : portefeuille complet, ni pastille ni message d'erreur", () => {
    show();
    expect(screen.getByTestId("wallet-total")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mes actifs" })).toBeTruthy();
    expect(screen.queryByText(/Marché/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("tendances en échec : le portefeuille reste, un message calme explique l'absence de courbes", () => {
    trends = { data: undefined, isError: true };
    show();
    expect(screen.getByTestId("wallet-total")).toBeTruthy();
    expect(screen.getAllByText("BTC").length).toBeGreaterThan(0);
    expect(screen.getByRole("status").textContent).toContain("indisponibles pour le moment");
    expect(screen.queryByRole("alert")).toBeNull(); // pas d'alarme : ce n'est pas l'essentiel
  });

  it("échec d'un rafraîchissement alors que des données existent : on garde les courbes déjà là", () => {
    trends = {
      isError: true,
      data: { market: { state: "CALM", btcChange24hPct: "0.1" }, complete: true, assets: [{ symbol: "BTC", change24hPct: "0.1", change7dPct: "0.2", sparkline: ["1", "2"] }] },
    };
    show();
    expect(screen.getByRole("img", { name: /BTC sur 7 jours/ })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("BTC injoignable côté API (état null) : pas de pastille, le reste s'affiche", () => {
    trends = {
      isError: false,
      data: { market: { state: null, btcChange24hPct: null } as unknown as TrendsDto["market"], complete: true, assets: [] },
    };
    show();
    expect(screen.queryByText(/Marché/)).toBeNull();
    expect(screen.getByTestId("wallet-total")).toBeTruthy();
  });
});
