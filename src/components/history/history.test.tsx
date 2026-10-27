import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeOperationsServer } from "@/test-operations-server";

const server = fakeOperationsServer();
vi.mock("@/lib/api/sdk.gen", () => ({
  portfolioControllerOperations: (...a: unknown[]) => server.handler(...(a as [])),
  portfolioControllerGet: async () => ({
    data: {
      currency: "USD",
      assets: [{ symbol: "BTC" }, { symbol: "ETH" }],
      totalValue: "0",
      totalCost: "0",
      totalPnl: "0",
      totalPnlPct: null,
      complete: true,
    },
  }),
}));

import { PrivacyProvider, resetPrivacyForTests, usePrivacy } from "@/lib/privacy";
import { MASK } from "@/lib/format";
import { operation } from "@/test-fixtures";
import { renderWithProviders } from "@/test-utils";
import { HistoryPage } from "./HistoryPage";

const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");
const show = async () => {
  const view = renderWithProviders(
    <PrivacyProvider>
      <HistoryPage />
    </PrivacyProvider>,
  );
  await screen.findByRole("heading", { name: "Historique des opérations" });
  return view;
};
const rows = () => within(screen.getByRole("list", { name: "Opérations" })).getAllByRole("listitem");

beforeEach(() => {
  window.localStorage.clear();
  resetPrivacyForTests();
  server.handler.mockClear();
  server.state.all = [];
});

describe("HistoryPage", () => {
  it("sans opération : explique que l'historique commence à la mise en service", async () => {
    await show();
    expect(await screen.findByText(/L’historique commence à la mise en service/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Opérations" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Voir plus" })).toBeNull();
  });

  it("liste les opérations, la plus récente d'abord, avec la nature, l'actif, l'origine et le résultat réalisé", async () => {
    server.state.all = [
      operation({ kind: "SELL", symbol: "BTC", quantity: "0.01", price: "80000", realizedPnl: "200" }),
      operation({ kind: "BUY", symbol: "BTC", source: "ORDER", orderId: "o1" }),
      operation({ kind: "SET", symbol: "ETH", quantity: "1.2", price: "2500" }),
      operation({ kind: "REMOVE", symbol: "SOL", quantity: "8", price: "150" }),
    ];
    await show();

    await waitFor(() => expect(rows()).toHaveLength(4));
    const [sale, order, fixed, removed] = rows();
    expect(plain(sale.textContent)).toMatch(/Vente de 0,01 BTC à 80 000,00.*\+200,00/);
    expect(within(sale).getByLabelText(/Résultat réalisé : \+200/)).toBeTruthy();
    expect(within(order).getByText("Ordre")).toBeTruthy();
    expect(plain(fixed.textContent)).toMatch(/Position ETH fixée à 1,2/);
    expect(plain(removed.textContent)).toMatch(/Position SOL retirée \(8 SOL/);
    expect(within(fixed).queryByText("Ordre")).toBeNull(); // une déclaration n'a pas de mention d'origine
  });

  it("le cumul est celui du journal entier, avec son signe et sa couleur", async () => {
    server.state.all = [operation({ kind: "SELL", realizedPnl: "150" }), operation({ kind: "SELL", realizedPnl: "-40" })];
    await show();
    const total = await screen.findByTestId("realized-total");
    expect(plain(total.textContent)).toMatch(/^\+110,00/);
    expect(total.className).toContain("text-gain");
  });

  it("une perte cumulée est affichée comme telle", async () => {
    server.state.all = [operation({ kind: "SELL", realizedPnl: "-99.7" })];
    await show();
    const total = await screen.findByTestId("realized-total");
    expect(plain(total.textContent)).toMatch(/^−99,70/);
    expect(total.className).toContain("text-loss");
  });
});

describe("HistoryPage : filtre par actif", () => {
  it("propose les actifs du portefeuille et ceux déjà vus dans l'historique (un actif retiré y reste)", async () => {
    server.state.all = [operation({ symbol: "SOL", kind: "REMOVE" })];
    await show();
    await waitFor(() => expect(rows()).toHaveLength(1));
    const options = within(screen.getByLabelText("Actif")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Tous les actifs", "BTC", "ETH", "SOL"]);
  });

  it("choisir un actif relit l'historique de cet actif et son propre cumul", async () => {
    server.state.all = [
      operation({ symbol: "BTC", kind: "SELL", realizedPnl: "200" }),
      operation({ symbol: "ETH", kind: "SELL", realizedPnl: "-30" }),
      operation({ symbol: "ETH", kind: "BUY" }),
    ];
    await show();
    await waitFor(() => expect(rows()).toHaveLength(3));

    fireEvent.change(screen.getByLabelText("Actif"), { target: { value: "ETH" } });

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(server.handler).toHaveBeenLastCalledWith(expect.objectContaining({ query: expect.objectContaining({ symbol: "ETH" }) }));
    expect(screen.getByText("Résultat réalisé sur ETH")).toBeTruthy();
    expect(plain((await screen.findByTestId("realized-total")).textContent)).toMatch(/^−30,00/);
  });

  it("un actif sans opération : le dit, sans parler de mise en service", async () => {
    server.state.all = [operation({ symbol: "BTC" })];
    await show();
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Actif"), { target: { value: "ETH" } });
    expect(await screen.findByText("Aucune opération sur ETH.")).toBeTruthy();
  });
});

describe("HistoryPage : « Voir plus »", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => operation({ symbol: "BTC", quantity: String(i + 1), realizedPnl: i === 0 ? "10" : null }));

  it("charge la page suivante à partir de la date de la dernière opération lue, sans doublon, et le cumul ne bouge pas", async () => {
    server.state.all = many(25);
    await show();
    await waitFor(() => expect(rows()).toHaveLength(20));
    const totalBefore = (await screen.findByTestId("realized-total")).textContent;

    fireEvent.click(screen.getByRole("button", { name: "Voir plus" }));

    await waitFor(() => expect(rows()).toHaveLength(25));
    const lastCall = server.handler.mock.calls.at(-1)![0] as { query: { before: string } };
    expect(lastCall.query.before).toBe(server.state.all[19].createdAt); // la 20e opération lue
    expect(new Set(rows().map((r) => r.textContent)).size).toBe(25); // aucun doublon
    expect(screen.queryByRole("button", { name: "Voir plus" })).toBeNull(); // plus rien à charger
    expect((await screen.findByTestId("realized-total")).textContent).toBe(totalBefore);
  });

  it("une page exactement pleine propose « Voir plus » ; la page suivante, vide, le retire", async () => {
    server.state.all = many(20);
    await show();
    await waitFor(() => expect(rows()).toHaveLength(20));

    fireEvent.click(screen.getByRole("button", { name: "Voir plus" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Voir plus" })).toBeNull());
    expect(rows()).toHaveLength(20);
  });

  it("moins d'une page : pas de bouton", async () => {
    server.state.all = many(5);
    await show();
    await waitFor(() => expect(rows()).toHaveLength(5));
    expect(screen.queryByRole("button", { name: "Voir plus" })).toBeNull();
  });
});

describe("HistoryPage : erreur et confidentialité", () => {
  it("chargement impossible : alerte et « Réessayer »", async () => {
    server.handler.mockRejectedValueOnce(new Error("hors ligne"));
    renderWithProviders(<HistoryPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Impossible de charger l’historique des opérations.");

    server.state.all = [operation()];
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it("le masquage des montants cache quantités, prix et gains, pas la nature de l'opération", async () => {
    function Hide() {
      const { toggle } = usePrivacy();
      return (
        <button type="button" onClick={toggle}>
          masquer
        </button>
      );
    }
    server.state.all = [operation({ kind: "SELL", quantity: "0.01", price: "80000", realizedPnl: "200" })];
    renderWithProviders(
      <PrivacyProvider>
        <Hide />
        <HistoryPage />
      </PrivacyProvider>,
    );
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(plain(rows()[0].textContent)).toMatch(/0,01.*80 000/);

    fireEvent.click(screen.getByRole("button", { name: "masquer" }));

    const text = plain(rows()[0].textContent);
    expect(text).toContain(MASK);
    expect(text).toMatch(/^Vente de/);
    expect(text).not.toMatch(/0,01|80 000|200/);
    expect(plain((await screen.findByTestId("realized-total")).textContent)).toBe(MASK);
    fireEvent.click(screen.getByRole("button", { name: "masquer" })); // rétablit la préférence (mémoire de module)
  });
});
