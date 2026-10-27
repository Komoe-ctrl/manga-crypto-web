import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioDto } from "@/lib/api/types.gen";
import { PrivacyProvider } from "@/lib/privacy";
import { SAMPLE, portfolio } from "./fixtures";

interface QueryState {
  data?: PortfolioDto;
  error: Error | null;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}
const refetch = vi.fn(async () => undefined);
let query: QueryState;
vi.mock("@/lib/queries/portfolio", () => ({ usePortfolio: () => query }));
// Les tendances ont leurs tests dans trends.test.tsx : ici, elles ne sont ni chargées ni en erreur.
vi.mock("@/lib/queries/trends", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries/trends")>()),
  useTrends: () => ({ data: undefined, isError: false }),
}));
// Les cartes du robot et des ordres ont leurs propres tests (bot.test.tsx, orders.test.tsx) : ici, seul le portefeuille compte.
vi.mock("@/components/bot/BotStatusCard", () => ({ BotStatusCard: () => null }));
vi.mock("@/components/orders/OrdersCard", () => ({ OrdersCard: () => null }));
vi.mock("@/components/portfolio/OperationsCard", () => ({ OperationsCard: () => null }));

import { Dashboard } from "./Dashboard";

const show = () =>
  render(
    <PrivacyProvider>
      <Dashboard />
    </PrivacyProvider>,
  );

beforeEach(() => {
  refetch.mockClear();
  query = { data: undefined, error: null, isPending: true, isFetching: true, refetch };
});

describe("Dashboard", () => {
  it("pendant le chargement : un message calme, annoncé comme occupé", () => {
    show();
    const loading = screen.getByText("Chargement de votre portefeuille…");
    expect(loading.closest("[aria-busy='true']")).not.toBeNull();
  });

  it("portefeuille chargé : valeur totale et actifs", () => {
    query = { ...query, data: SAMPLE, isPending: false, isFetching: false };
    show();
    expect(screen.getByTestId("wallet-total").textContent).toContain("88");
    expect(screen.getByRole("heading", { name: "Mes actifs" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("erreur : message dans une alerte et bouton pour réessayer", () => {
    query = { ...query, error: new Error("réseau"), isPending: false, isFetching: false };
    show();
    expect(screen.getByRole("alert").textContent).toContain("Impossible de charger votre portefeuille.");

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("le bouton « Réessayer » est inactif pendant une nouvelle tentative", () => {
    query = { ...query, error: new Error("réseau"), isPending: false, isFetching: true };
    show();
    expect((screen.getByRole("button", { name: "Réessayer" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("un nouveau compte sans position : le tableau de bord s'affiche et invite à déclarer ses actifs", () => {
    query = { ...query, data: portfolio(), isPending: false, isFetching: false };
    show();
    expect(screen.getByText(/Aucune position pour l’instant/)).toBeTruthy();
    expect(screen.getByTestId("wallet-total")).toBeTruthy();
  });
});
