import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderDto, TradingStatusDto } from "@/lib/api/types.gen";

let status: TradingStatusDto;
let orders: OrderDto[];
const listOrders = vi.fn();
const createOrder = vi.fn();

vi.mock("@/lib/api/sdk.gen", () => ({
  ordersControllerList: (...a: unknown[]) => listOrders(...a),
  ordersControllerCreate: (...a: unknown[]) => createOrder(...a),
  riskControllerStatus: async () => ({ data: { ...status } }),
  portfolioControllerGet: async () => ({
    data: {
      currency: "USD",
      assets: [{ symbol: "USDT" }, { symbol: "DOGE" }],
      totalValue: "0",
      totalCost: "0",
      totalPnl: "0",
      totalPnlPct: null,
      complete: true,
    },
  }),
}));

import { MASK } from "@/lib/format";
import { PrivacyProvider, usePrivacy } from "@/lib/privacy";
import { renderWithProviders } from "@/test-utils";
import { order, tradingStatus } from "@/test-fixtures";
import { OrdersCard } from "./OrdersCard";

beforeEach(() => {
  status = tradingStatus();
  orders = [];
  listOrders.mockReset().mockImplementation(async () => ({ data: { items: [...orders] } }));
  createOrder.mockReset().mockImplementation(async ({ body }: { body: { symbol: string; side: "BUY" | "SELL"; quantity: string } }) => {
    const created = order({ id: "new", ...body, symbol: `${body.symbol}/USDT` }); // comme l’API : la paire
    orders = [created, ...orders];
    return { data: created };
  });
});

const show = async () => {
  const view = renderWithProviders(
    <PrivacyProvider>
      <OrdersCard />
    </PrivacyProvider>,
  );
  await screen.findByRole("heading", { name: "Derniers ordres" });
  return view;
};
const openDialog = async () => {
  const opener = screen.getByRole("button", { name: "Passer un ordre" });
  await waitFor(() => expect((opener as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(opener);
  return screen.findByRole("dialog", { name: "Passer un ordre de simulation" });
};
const fill = (symbol: string, quantity: string) => {
  fireEvent.change(screen.getByLabelText("Actif"), { target: { value: symbol } });
  fireEvent.change(screen.getByLabelText("Quantité d’actif"), { target: { value: quantity } });
};
const body = () => (createOrder.mock.calls[0][0] as { body: unknown }).body;

describe("OrdersCard : historique", () => {
  it("sans ordre : un état vide qui explique", async () => {
    await show();
    expect(screen.getByText(/Aucun ordre pour l’instant/)).toBeTruthy();
  });

  it("liste les ordres avec sens, statut, origine et mode", async () => {
    orders = [
      order({ id: "1", symbol: "BTC/USDT", side: "BUY", status: "FILLED", origin: "MANUAL" }),
      order({ id: "2", symbol: "ETH/USDT", side: "SELL", status: "FILLED", origin: "STOP_LOSS", quantity: "0.5" }),
      order({ id: "3", symbol: "SOL/USDT", side: "BUY", status: "PENDING", origin: "SIGNAL", avgFillPrice: null }),
    ];
    await show();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText(/Achat BTC/)).toBeTruthy();
    expect(rows[0].textContent).not.toContain("USDT"); // la paire est ramenée à l’actif
    expect(within(rows[0]).getByText("Exécuté")).toBeTruthy();
    expect(within(rows[0]).getByText("Manuel")).toBeTruthy();
    expect(within(rows[0]).getByText("Simulation")).toBeTruthy();
    expect(within(rows[1]).getByText(/Vente ETH/)).toBeTruthy();
    expect(within(rows[1]).getByText("Stop-loss")).toBeTruthy();
    expect(within(rows[2]).getByText("En attente")).toBeTruthy();
    expect(within(rows[2]).getByText("Signal du moteur")).toBeTruthy();
  });

  it("un ordre refusé affiche son motif en français, jamais le code", async () => {
    orders = [order({ status: "REJECTED", failureReason: "insufficient_funds", avgFillPrice: null })];
    await show();
    expect(screen.getByText("Refusé")).toBeTruthy();
    expect(screen.getByText("Fonds insuffisants.")).toBeTruthy();
    expect(screen.queryByText(/insufficient_funds/)).toBeNull();
  });

  it("un motif inconnu reste lisible", async () => {
    orders = [order({ status: "FAILED", failureReason: "code_du_futur", avgFillPrice: null })];
    await show();
    expect(screen.queryByText(/code_du_futur/)).toBeNull();
    expect(screen.getByText(/Motif non reconnu/)).toBeTruthy();
  });

  it("le masquage des montants cache aussi les quantités et les prix d'exécution", async () => {
    orders = [order({ quantity: "0.001", avgFillPrice: "68000" })];
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
        <OrdersCard />
      </PrivacyProvider>,
    );
    await screen.findByText(/Achat BTC/);
    expect(screen.getByText(/Achat BTC/).textContent).toMatch(/0[,.]001/);
    expect(screen.getByText(/68/).textContent).toMatch(/68/);

    fireEvent.click(screen.getByRole("button", { name: "masquer" }));
    expect(screen.getByText(/Achat BTC/).textContent).toContain(MASK);
    expect(screen.getByText(/Achat BTC/).textContent).not.toMatch(/0[,.]001/);
    expect(screen.queryByText(/68[\s  ]?000/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "masquer" })); // la préférence vit en mémoire de module : on la rétablit pour les tests suivants
    expect(screen.getByText(/Achat BTC/).textContent).not.toContain(MASK);
  });

  it("chargement impossible : alerte et « Réessayer »", async () => {
    listOrders.mockReset().mockRejectedValue(new Error("hors ligne"));
    renderWithProviders(<OrdersCard />);
    expect((await screen.findByRole("alert")).textContent).toContain("Impossible de charger vos ordres.");

    listOrders.mockImplementation(async () => ({ data: { items: [] } }));
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByText(/Aucun ordre pour l’instant/);
  });
});

describe("OrderDialog : saisie", () => {
  it("propose les actifs du portefeuille (sans USDT) et quelques classiques", async () => {
    await show();
    await openDialog();
    const options = [...document.querySelectorAll("#order-symbols option")].map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(expect.arrayContaining(["DOGE", "BTC", "ETH", "SOL"]));
    expect(options).not.toContain("USDT");
  });

  it("champs vides : deux messages, aucun appel", async () => {
    await show();
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Vérifier l’ordre" }));

    expect(screen.getByText("Choisissez un actif.")).toBeTruthy();
    expect(screen.getByText("Saisissez une quantité.")).toBeTruthy();
    expect(screen.getByLabelText("Actif").getAttribute("aria-invalid")).toBe("true");
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("quantité nulle ou mal écrite : refusée avant l'envoi", async () => {
    await show();
    await openDialog();
    fill("BTC", "0");
    fireEvent.click(screen.getByRole("button", { name: "Vérifier l’ordre" }));
    expect(screen.getByText("La quantité doit être supérieure à zéro.")).toBeTruthy();

    fill("BTC", "beaucoup");
    fireEvent.click(screen.getByRole("button", { name: "Vérifier l’ordre" }));
    expect(screen.getByText(/Quantité invalide/)).toBeTruthy();
    expect(createOrder).not.toHaveBeenCalled();
  });
});

describe("OrderDialog : confirmation et envoi", () => {
  it("un récapitulatif à confirmer avant tout envoi, et on peut le modifier", async () => {
    await show();
    await openDialog();
    fill("btc", "0,25");
    fireEvent.click(screen.getByRole("button", { name: "Vérifier l’ordre" }));

    expect(createOrder).not.toHaveBeenCalled();
    expect(screen.getByText("Achat")).toBeTruthy();
    expect(screen.getByText("BTC")).toBeTruthy();
    expect(screen.getByText("0.25")).toBeTruthy();
    expect(screen.getByText("Au prix du marché")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect((screen.getByLabelText("Actif") as HTMLInputElement).value).toBe("btc"); // la saisie est conservée
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("confirmé : l'ordre part tel quel (majuscules, point décimal, chaîne), le dialogue se ferme, l'historique se met à jour", async () => {
    await show();
    await openDialog();
    fireEvent.click(screen.getByLabelText("Vente"));
    fill("eth", "1,5");
    fireEvent.click(screen.getByRole("button", { name: "Vérifier l’ordre" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'ordre" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(body()).toEqual({ symbol: "ETH", side: "SELL", quantity: "1.5" });
    expect(typeof (body() as { quantity: unknown }).quantity).toBe("string");
    expect(await screen.findByText(/Vente ETH/)).toBeTruthy();
    expect(screen.getByText(/Vente de 1\.5 ETH : exécuté/)).toBeTruthy();
  });

  it("pas de double envoi : le bouton est inactif pendant l'envoi", async () => {
    let release: () => void = () => undefined;
    createOrder.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: order() });
        }),
    );
    await show();
    await openDialog();
    fill("BTC", "0.001");
    fireEvent.click(screen.getByRole("button", { name: "Vérifier l’ordre" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'ordre" }));

    const sending = await screen.findByRole("button", { name: "Envoi…" });
    expect((sending as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sending);
    expect(createOrder).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("refus d'un garde-fou (422) : le motif de l'API est affiché, retour à la saisie, l'historique est relu", async () => {
    createOrder.mockReset().mockImplementation(async () => {
      orders = [order({ id: "refused", status: "REJECTED", failureReason: "insufficient_funds", avgFillPrice: null })];
      throw { statusCode: 422, message: "Fonds insuffisants", order: orders[0] };
    });
    await show();
    await openDialog();
    fill("BTC", "100");
    fireEvent.click(screen.getByRole("button", { name: "Vérifier l’ordre" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'ordre" }));

    const refusal = await screen.findByText(/Ordre refusé : Fonds insuffisants/);
    expect(refusal.closest("[role='alert']")).not.toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText("Quantité d’actif") as HTMLInputElement).value).toBe("100");
    // L'ordre refusé est enregistré par l'API : l'historique le montre.
    expect(await screen.findByText("Refusé")).toBeTruthy();
  });

  it("réseau coupé : on ne dit PAS « refusé » (l'ordre a pu partir) et on renvoie vers l'historique", async () => {
    createOrder.mockReset().mockRejectedValue(new TypeError("Failed to fetch"));
    await show();
    await openDialog();
    fill("BTC", "0.001");
    fireEvent.click(screen.getByRole("button", { name: "Vérifier l’ordre" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l'ordre" }));

    const message = await screen.findByText(/Impossible de joindre le serveur/);
    expect(message.textContent).toMatch(/Vérifiez l'historique avant de réessayer/);
    expect(message.textContent).not.toMatch(/Ordre refusé/);
  });
});

describe("OrderDialog : cas bloqués et clavier", () => {
  it("robot arrêté : le dit et empêche l'envoi", async () => {
    status = tradingStatus({ killSwitchActive: true, canTrade: false, blockedReason: "KILL_SWITCH" });
    await show();
    await openDialog();
    expect(screen.getByRole("status").textContent).toMatch(/arrêté ou en pause/);
    expect((screen.getByRole("button", { name: "Vérifier l’ordre" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("mode réel : les ordres manuels sont refusés d'emblée", async () => {
    status = tradingStatus({ tradingMode: "LIVE" });
    await show();
    await openDialog();
    expect(screen.getByRole("status").textContent).toMatch(/uniquement|qu'en mode simulation/);
    expect((screen.getByRole("button", { name: "Vérifier l’ordre" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Échap ferme le dialogue et rend le focus au bouton d'origine", async () => {
    await show();
    const opener = screen.getByRole("button", { name: "Passer un ordre" });
    const dialog = await openDialog();
    expect(dialog.contains(document.activeElement)).toBe(true); // le focus entre dans le dialogue

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("« Annuler » ferme sans rien envoyer", async () => {
    await show();
    await openDialog();
    fill("BTC", "1");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(createOrder).not.toHaveBeenCalled();
  });
});
