import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertDto } from "@/lib/api/types.gen";
import { fakeOperationsServer } from "@/test-operations-server";

const server = fakeOperationsServer();
let alerts: AlertDto[] = [];
const listAlerts = vi.fn();
vi.mock("@/lib/api/sdk.gen", () => ({
  portfolioControllerOperations: (...a: unknown[]) => server.handler(...(a as [])),
  alertsControllerList: (...a: unknown[]) => listAlerts(...a),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { asset } from "@/components/dashboard/fixtures";
import { MASK } from "@/lib/format";
import { PrivacyProvider, resetPrivacyForTests, usePrivacy } from "@/lib/privacy";
import { alert, operation } from "@/test-fixtures";
import { renderWithProviders } from "@/test-utils";
import { AssetDialog } from "./AssetDialog";

const BTC = asset({
  symbol: "BTC",
  quantity: "0.05",
  avgBuyPrice: "60000",
  currentPrice: "80000",
  value: "4000",
  pnl: "1000",
  pnlPct: "33.33",
  weightPct: "24",
});
const TREND = { symbol: "BTC", change24hPct: "-1.35", change7dPct: "4.2", sparkline: ["1", "2", "3", "2.5"] };
const onClose = vi.fn();
const onAction = vi.fn();
const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

const show = (over: { trend?: typeof TREND | undefined; asset?: typeof BTC } = {}) =>
  renderWithProviders(
    <PrivacyProvider>
      <AssetDialog asset={over.asset ?? BTC} trend={"trend" in over ? over.trend : TREND} currency="USD" onClose={onClose} onAction={onAction} />
    </PrivacyProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  resetPrivacyForTests();
  onClose.mockClear();
  onAction.mockClear();
  server.handler.mockClear();
  server.state.all = [];
  alerts = [];
  listAlerts.mockReset().mockImplementation(async () => ({ data: alerts }));
});

describe("AssetDialog : le détail", () => {
  it("nomme l'actif, donne le prix, la grande courbe nommée et les variations 24 h / 7 jours", () => {
    show();
    expect(screen.getByRole("dialog", { name: "BTC" })).toBeTruthy();
    expect(plain(screen.getByText(/80 000,00/).textContent)).toContain("80 000,00");
    expect(screen.getByRole("img", { name: "BTC sur 7 jours : +4,20 %" })).toBeTruthy();
    expect(screen.getByText("−1,35 %").className).toContain("text-loss");
    expect(screen.getByText("+4,20 %").className).toContain("text-gain");
  });

  it("la position : quantité, prix d'achat moyen, valeur, part, résultat latent", () => {
    show();
    const figures = screen.getAllByRole("definition").map((d) => plain(d.textContent));
    expect(figures.join(" | ")).toMatch(/0,05/);
    expect(figures.join(" | ")).toMatch(/60 000,00/);
    expect(figures.join(" | ")).toMatch(/4 000,00/);
    expect(figures.join(" | ")).toMatch(/24 %/);
    expect(figures.join(" | ")).toMatch(/\+1 000,00.*\+33,33 %/);
  });

  it("sans courbe (trésorerie, prix indisponible) : le dit, et les variations sont des tirets", () => {
    show({ asset: asset({ symbol: "USDT", quantity: "10000", currentPrice: "1" }), trend: undefined });
    expect(screen.getByText(/Pas de courbe pour cet actif/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("un actif récent (pas de variation sur 7 jours) : la courbe ne prétend pas couvrir 7 jours", () => {
    show({ trend: { ...TREND, change7dPct: null as unknown as string } });
    expect(screen.getByRole("img").getAttribute("aria-label")).not.toContain("7 jours");
  });

  it("le masquage cache la quantité, le prix moyen, la valeur et le résultat, pas la part ni les variations", () => {
    function Hide() {
      const { toggle } = usePrivacy();
      return (
        <button type="button" onClick={toggle}>
          masquer
        </button>
      );
    }
    renderWithProviders(
      <PrivacyProvider>
        <Hide />
        <AssetDialog asset={BTC} trend={TREND} currency="USD" onClose={onClose} onAction={onAction} />
      </PrivacyProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "masquer" }));
    const text = plain(screen.getAllByRole("definition").map((d) => d.textContent).join(" | "));
    expect(text).toContain(MASK);
    expect(text).not.toMatch(/60 000|4 000|1 000/);
    expect(text).toMatch(/24 %/);
    fireEvent.click(screen.getByRole("button", { name: "masquer" }));
  });
});

describe("AssetDialog : actions", () => {
  it.each([
    ["Acheter", "BUY"],
    ["Vendre", "SELL"],
    ["Corriger", "CORRECT"],
  ])("« %s » demande le mode %s", (name, mode) => {
    show();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(onAction).toHaveBeenCalledWith(mode);
    expect(onClose).not.toHaveBeenCalled(); // c'est l'appelant qui remplace la fiche par la fenêtre de déclaration
  });

  it("Fermer et Échap ferment", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("AssetDialog : opérations de l'actif", () => {
  it("ne lit que les opérations de cet actif, les 5 dernières, avec son résultat réalisé", async () => {
    server.state.all = [
      operation({ symbol: "BTC", kind: "SELL", realizedPnl: "200" }),
      operation({ symbol: "ETH", kind: "SELL", realizedPnl: "-30" }),
      ...Array.from({ length: 6 }, () => operation({ symbol: "BTC" })),
    ];
    show();

    const list = await screen.findByRole("list", { name: "Opérations sur BTC" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(server.handler).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ symbol: "BTC", limit: 5 }) }));
    expect(screen.getByText("Résultat réalisé sur BTC")).toBeTruthy();
    expect(plain((await screen.findByTestId("realized-total")).textContent)).toMatch(/^\+200,00/); // sans le −30 d'ETH
    expect(screen.getByRole("link", { name: "Tout l’historique" }).getAttribute("href")).toBe("/historique");
  });

  it("sans opération : l'explique", async () => {
    show();
    expect(await screen.findByText(/Aucune opération enregistrée sur cet actif/)).toBeTruthy();
  });

  it("lecture impossible : un message, sans bloquer le reste de la fiche", async () => {
    server.handler.mockRejectedValueOnce(new Error("hors ligne"));
    show();
    expect(await screen.findByText("Impossible de charger les opérations.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acheter" })).toBeTruthy();
  });
});

describe("AssetDialog : alertes de l'actif", () => {
  it("liste seulement les alertes de cet actif, avec leur état", async () => {
    alerts = [
      alert({ id: "1", assetSymbol: "BTC", threshold: "5" }),
      alert({ id: "2", assetSymbol: "BTC", condition: "PRICE_CROSS_ABOVE", threshold: "90000", windowMinutes: null, isTriggered: true }),
      alert({ id: "3", assetSymbol: "BTC", isActive: false, threshold: "9" }),
      alert({ id: "4", assetSymbol: "ETH" }),
      alert({ id: "5", assetSymbol: null, condition: "PORTFOLIO_DROP_PCT" }),
    ];
    show();
    const list = await screen.findByRole("list", { name: "Alertes sur BTC" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/BTC perd 5 % en 1 jour.*Armée/);
    expect(plain(rows[1].textContent)).toMatch(/BTC dépasse.*90 000.*Déclenchée/);
    expect(rows[2].textContent).toMatch(/En pause/);
  });

  it("sans alerte : le dit et propose d'en créer une", async () => {
    show();
    expect(await screen.findByText(/Aucune alerte sur cet actif/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Créer une alerte" }).getAttribute("href")).toBe("/alertes");
  });

  it("lecture impossible : un message, sans bloquer la fiche", async () => {
    listAlerts.mockRejectedValueOnce(new Error("hors ligne"));
    show();
    await waitFor(() => expect(screen.getByText("Impossible de charger les alertes.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Vendre" })).toBeTruthy();
  });
});
