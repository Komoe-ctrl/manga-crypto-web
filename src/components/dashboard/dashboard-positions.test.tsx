import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioDto } from "@/lib/api/types.gen";
import { PrivacyProvider } from "@/lib/privacy";
import { renderWithProviders } from "@/test-utils";
import { SAMPLE, portfolio } from "./fixtures";

let current: PortfolioDto;
const record = vi.fn();
vi.mock("@/lib/queries/portfolio", () => ({
  usePortfolio: () => ({ data: current, error: null, isPending: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/queries/trends", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queries/trends")>()),
  useTrends: () => ({ data: undefined, isError: false }),
}));
vi.mock("@/lib/api/sdk.gen", () => ({
  portfolioControllerRecord: (...a: unknown[]) => record(...a),
  portfolioControllerSet: vi.fn(),
  portfolioControllerRemove: vi.fn(),
  // La fiche d'un actif lit ses opérations et ses alertes : vides ici, leurs tests sont dans asset-dialog.test.tsx.
  portfolioControllerOperations: async () => ({ data: { items: [], realizedTotal: "0" } }),
  alertsControllerList: async () => ({ data: [] }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/bot/BotStatusCard", () => ({ BotStatusCard: () => null }));
vi.mock("@/components/orders/OrdersCard", () => ({ OrdersCard: () => null }));
vi.mock("@/components/portfolio/OperationsCard", () => ({ OperationsCard: () => null }));

import { AssetsTable } from "./AssetsTable";
import { Dashboard } from "./Dashboard";

beforeEach(() => {
  current = SAMPLE;
  record.mockReset().mockResolvedValue({ data: { holding: null, realizedPnl: null } });
});

const showDashboard = () =>
  renderWithProviders(
    <PrivacyProvider>
      <Dashboard />
    </PrivacyProvider>,
  );

describe("AssetsTable : accès à la déclaration", () => {
  it("en lecture seule sans rappels : aucun bouton d'écriture", () => {
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" />);
    expect(screen.queryByRole("button", { name: "Déclarer une opération" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Modifier la position/ })).toBeNull();
  });

  it("avec des positions : un bouton pour déclarer et un « Modifier » par ligne, nommé par l'actif", () => {
    const onAdd = vi.fn();
    const onEdit = vi.fn();
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" onAdd={onAdd} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "Déclarer une opération" }));
    expect(onAdd).toHaveBeenCalledTimes(1);

    expect(screen.getAllByRole("button", { name: /Modifier la position/ })).toHaveLength(SAMPLE.assets.length);
    fireEvent.click(screen.getByRole("button", { name: "Modifier la position ETH" }));
    expect(onEdit).toHaveBeenCalledWith("ETH");
  });

  it("le tableau garde ses colonnes : le bouton « Modifier » ne s'ajoute pas comme colonne", () => {
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" onAdd={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getAllByRole("columnheader")).toHaveLength(8);
  });

  it("portefeuille vide : explique comment il se remplit et propose d'ajouter le premier actif", () => {
    const onAdd = vi.fn();
    render(<AssetsTable assets={[]} currency="USD" onAdd={onAdd} onEdit={vi.fn()} />);

    expect(screen.getByText(/Aucune position pour l’instant/)).toBeTruthy();
    expect(screen.getByText(/se remplit à la main/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Déclarer une opération" })).toBeNull(); // un seul appel à l'action
    fireEvent.click(screen.getByRole("button", { name: "Ajouter mon premier actif" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("portefeuille vide en lecture seule : pas de bouton", () => {
    render(<AssetsTable assets={[]} currency="USD" />);
    expect(screen.queryByRole("button", { name: "Ajouter mon premier actif" })).toBeNull();
  });
});

describe("AssetsTable : le nom de l'actif ouvre sa fiche", () => {
  it("sans rappel, le nom n'est pas un bouton", () => {
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" />);
    expect(screen.queryByRole("button", { name: /Voir le détail de/ })).toBeNull();
  });

  it("avec le rappel : un bouton par actif, nommé, qui donne le symbole", () => {
    const onOpen = vi.fn();
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" onOpen={onOpen} />);
    expect(screen.getAllByRole("button", { name: /Voir le détail de/ })).toHaveLength(SAMPLE.assets.length);
    fireEvent.click(screen.getByRole("button", { name: "Voir le détail de LINK" }));
    expect(onOpen).toHaveBeenCalledWith("LINK");
  });
});

describe("Dashboard : de la fiche d'un actif à la déclaration", () => {
  const openBtc = () => fireEvent.click(screen.getByRole("button", { name: "Voir le détail de BTC" }));

  it("toucher le nom d'un actif ouvre sa fiche", () => {
    showDashboard();
    openBtc();
    const dialog = screen.getByRole("dialog", { name: "BTC" });
    expect(within(dialog).getByRole("button", { name: "Acheter" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["Acheter", "Achat", /Ajoute à votre position/],
    ["Vendre", "Vente", /Retire de votre position/],
    ["Corriger", "Corriger", /Remplace la quantité/],
  ])("« %s » remplace la fiche par la déclaration, déjà sur le bon mode et le bon actif", (action, modeName, help) => {
    showDashboard();
    openBtc();
    fireEvent.click(screen.getByRole("button", { name: action }));

    expect(screen.queryByRole("dialog", { name: "BTC" })).toBeNull(); // une seule fenêtre à la fois
    const dialog = screen.getByRole("dialog", { name: "Déclarer une opération" });
    expect(within(dialog).getByRole("button", { name: modeName }).getAttribute("aria-pressed")).toBe("true");
    expect((within(dialog).getByLabelText("Actif") as HTMLInputElement).value).toBe("BTC");
    expect(within(dialog).getByText(help)).toBeTruthy();
  });

  it("acheter ou vendre propose le prix du marché de l'actif ; vendre dit combien on détient", () => {
    showDashboard();
    openBtc();
    fireEvent.click(screen.getByRole("button", { name: "Vendre" }));
    expect((screen.getByLabelText(/Prix/) as HTMLInputElement).value).toBe("67250");
    expect(screen.getByText("Vous détenez 0,842 BTC.")).toBeTruthy();
  });

  it("la correction part de la position actuelle, comme avec le crayon", () => {
    showDashboard();
    openBtc();
    fireEvent.click(screen.getByRole("button", { name: "Corriger" }));
    expect((screen.getByLabelText("Quantité") as HTMLInputElement).value).toBe("0.842");
  });

  it("l'actif corrigé ou retiré pendant que sa fiche est ouverte : la fiche disparaît au lieu de montrer une position fantôme", () => {
    const view = showDashboard();
    openBtc();
    expect(screen.getByRole("dialog", { name: "BTC" })).toBeTruthy();

    current = portfolio({ assets: SAMPLE.assets.filter((a) => a.symbol !== "BTC"), totalValue: "1" });
    view.rerender(
      <PrivacyProvider>
        <Dashboard />
      </PrivacyProvider>,
    );
    expect(screen.queryByRole("dialog", { name: "BTC" })).toBeNull();
  });
});

describe("Dashboard : de la ligne à la fenêtre", () => {
  it("« Déclarer une opération » ouvre la fenêtre sur un achat, qui se ferme avec Annuler", () => {
    showDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Déclarer une opération" }));

    const dialog = screen.getByRole("dialog", { name: "Déclarer une opération" });
    expect(within(dialog).getByRole("button", { name: "Achat" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("le crayon d'une ligne ouvre la correction de CETTE position, déjà remplie", () => {
    showDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Modifier la position BTC" }));

    const dialog = screen.getByRole("dialog", { name: "Déclarer une opération" });
    expect(within(dialog).getByRole("button", { name: "Corriger" }).getAttribute("aria-pressed")).toBe("true");
    expect((within(dialog).getByLabelText("Actif") as HTMLInputElement).value).toBe("BTC");
    expect((within(dialog).getByLabelText("Quantité") as HTMLInputElement).value).toBe("0.842");
  });

  it("d'une ligne à l'autre, la fenêtre repart des valeurs de la nouvelle ligne (pas de reste de la précédente)", () => {
    showDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Modifier la position BTC" }));
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    fireEvent.click(screen.getByRole("button", { name: "Modifier la position ETH" }));
    expect((screen.getByLabelText("Actif") as HTMLInputElement).value).toBe("ETH");
    expect((screen.getByLabelText("Quantité") as HTMLInputElement).value).toBe("6.15");
  });

  it("portefeuille vide : le premier actif s'ajoute depuis l'écran d'accueil, l'achat part tel quel", async () => {
    current = portfolio();
    showDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Ajouter mon premier actif" }));
    fireEvent.change(screen.getByLabelText("Actif"), { target: { value: "btc" } });
    fireEvent.change(screen.getByLabelText("Quantité"), { target: { value: "0,5" } });
    fireEvent.change(screen.getByLabelText(/Prix/), { target: { value: "60000" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer l'achat" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ body: { symbol: "BTC", side: "BUY", quantity: "0.5", price: "60000" } }));
    expect(screen.getByText(/Achat de 0,5 BTC enregistré/)).toBeTruthy();
  });
});
