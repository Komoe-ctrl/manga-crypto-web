import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const record = vi.fn();
const setAsset = vi.fn();
const removeAsset = vi.fn();
vi.mock("@/lib/api/sdk.gen", () => ({
  portfolioControllerRecord: (...a: unknown[]) => record(...a),
  portfolioControllerSet: (...a: unknown[]) => setAsset(...a),
  portfolioControllerRemove: (...a: unknown[]) => removeAsset(...a),
}));

import { asset } from "@/components/dashboard/fixtures";
import { renderWithProviders } from "@/test-utils";
import { PositionDialog } from "./PositionDialog";

const HOLDINGS = [
  asset({ symbol: "BTC", quantity: "0.05", avgBuyPrice: "60000.5", currentPrice: "80000" }),
  asset({ symbol: "ETH", quantity: "1.2", avgBuyPrice: "2500", currentPrice: "2300" }),
];
const onClose = vi.fn();

beforeEach(() => {
  onClose.mockClear();
  record.mockReset().mockResolvedValue({ data: { holding: { symbol: "BTC", quantity: "0.06", avgBuyPrice: "62000" }, realizedPnl: null } });
  setAsset.mockReset().mockResolvedValue({ data: { symbol: "BTC", quantity: "1", avgBuyPrice: "1" } });
  removeAsset.mockReset().mockResolvedValue({ data: undefined });
});

const show = (symbol?: string, holdings = HOLDINGS) =>
  renderWithProviders(<PositionDialog holdings={holdings} currency="USD" symbol={symbol} onClose={onClose} />);
const symbolField = () => screen.getByLabelText("Actif") as HTMLInputElement;
const quantityField = () => screen.getByLabelText("Quantité") as HTMLInputElement;
const priceField = () => screen.getByLabelText(/Prix/) as HTMLInputElement;
const mode = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const fill = (symbol: string, quantity: string, price: string) => {
  fireEvent.change(symbolField(), { target: { value: symbol } });
  fireEvent.change(quantityField(), { target: { value: quantity } });
  fireEvent.change(priceField(), { target: { value: price } });
};
const submit = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const bodyOf = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0][0] as { body: unknown; path?: unknown };

describe("PositionDialog : ouverture", () => {
  it("sans actif : un achat, expliqué", () => {
    show();
    expect(screen.getByRole("dialog", { name: "Déclarer une opération" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Achat" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/recalcule votre prix d'achat moyen/)).toBeTruthy();
    expect(symbolField().value).toBe("");
  });

  it("depuis une ligne : « Corriger » avec la position actuelle, valeurs exactes de l'API", () => {
    show("BTC");
    expect(screen.getByRole("button", { name: "Corriger" }).getAttribute("aria-pressed")).toBe("true");
    expect(symbolField().value).toBe("BTC");
    expect(quantityField().value).toBe("0.05");
    expect(priceField().value).toBe("60000.5");
    expect(screen.getByLabelText("Prix d’achat moyen (USD)")).toBeTruthy();
    expect(screen.getByText(/Remplace la quantité et le prix d'achat moyen/)).toBeTruthy();
  });

  it("propose les actifs détenus et quelques classiques, USDT compris", () => {
    show();
    const values = [...document.querySelectorAll("#position-symbols option")].map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(expect.arrayContaining(["BTC", "ETH", "SOL", "USDT"]));
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("PositionDialog : validation avant envoi", () => {
  it("champs vides : trois messages, aucun appel", () => {
    show();
    submit(/Enregistrer l'achat/);
    expect(screen.getByText("Choisissez un actif.")).toBeTruthy();
    expect(screen.getByText("Saisissez une quantité.")).toBeTruthy();
    expect(screen.getByText("Saisissez un prix.")).toBeTruthy();
    expect(symbolField().getAttribute("aria-invalid")).toBe("true");
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    ["0", "La quantité doit être supérieure à zéro."],
    ["abc", "Quantité invalide : un nombre positif, 18 décimales au plus."],
    ["0.0000000000000000001", "Quantité invalide : un nombre positif, 18 décimales au plus."],
  ])("quantité %j refusée sans appeler l'API", (value, message) => {
    show();
    fill("BTC", value, "60000");
    submit(/Enregistrer l'achat/);
    expect(screen.getByText(message)).toBeTruthy();
    expect(record).not.toHaveBeenCalled();
  });

  it("un prix nul est refusé", () => {
    show();
    fill("BTC", "1", "0");
    submit(/Enregistrer l'achat/);
    expect(screen.getByText("Le prix doit être supérieur à zéro.")).toBeTruthy();
    expect(record).not.toHaveBeenCalled();
  });
});

describe("PositionDialog : achat", () => {
  it("envoie exactement ce que l'API attend (majuscules, point décimal, chaînes), annonce et ferme", async () => {
    show();
    fill("btc", "0,06", "62000");
    submit(/Enregistrer l'achat/);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(bodyOf(record).body).toEqual({ symbol: "BTC", side: "BUY", quantity: "0.06", price: "62000" });
    expect(typeof (bodyOf(record).body as { quantity: unknown }).quantity).toBe("string");
    expect(screen.getByText(/Achat de 0,06 BTC enregistré\./)).toBeTruthy();
  });

  it("garde tous les chiffres d'une quantité à 18 décimales", async () => {
    show();
    fill("ETH", "0,123456789012345678", "2300,5");
    submit(/Enregistrer l'achat/);
    await waitFor(() => expect(record).toHaveBeenCalled());
    expect(bodyOf(record).body).toMatchObject({ quantity: "0.123456789012345678", price: "2300.5" });
  });

  it("de la trésorerie (USDT) peut se déclarer", async () => {
    show();
    fill("usdt", "500", "1");
    submit(/Enregistrer l'achat/);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodyOf(record).body).toEqual({ symbol: "USDT", side: "BUY", quantity: "500", price: "1" });
  });

  it("pas de double envoi : le bouton annonce l'enregistrement et est inactif", async () => {
    let release: () => void = () => undefined;
    record.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: { holding: null, realizedPnl: null } });
        }),
    );
    show();
    fill("BTC", "1", "1");
    submit(/Enregistrer l'achat/);

    const busy = (await screen.findByRole("button", { name: "Enregistrement…" })) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(record).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("PositionDialog : vente", () => {
  it("dit combien on détient, envoie une vente, annonce le résultat réalisé", async () => {
    record.mockResolvedValueOnce({ data: { holding: { symbol: "BTC", quantity: "0.04", avgBuyPrice: "60000.5" }, realizedPnl: "123.45" } });
    show();
    mode("Vente");
    fireEvent.change(symbolField(), { target: { value: "btc" } });
    expect(screen.getByText("Vous détenez 0,05 BTC.")).toBeTruthy();
    fireEvent.change(quantityField(), { target: { value: "0.01" } });
    fireEvent.change(priceField(), { target: { value: "80000" } });
    submit(/Enregistrer la vente/);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodyOf(record).body).toEqual({ symbol: "BTC", side: "SELL", quantity: "0.01", price: "80000" });
    expect(screen.getByText(/Vente de 0,01 BTC enregistrée\. Résultat réalisé : \+123,45/)).toBeTruthy();
  });

  it("un actif non détenu : le dit avant l'envoi", () => {
    show();
    mode("Vente");
    fireEvent.change(symbolField(), { target: { value: "SOL" } });
    expect(screen.getByText("Vous ne détenez pas cet actif.")).toBeTruthy();
  });

  it("vente supérieure à la quantité détenue : le refus de l'API est affiché, rien n'est perdu", async () => {
    record.mockRejectedValueOnce({ statusCode: 422, message: "Quantité insuffisante pour cette vente" });
    show();
    mode("Vente");
    fill("BTC", "9", "80000");
    submit(/Enregistrer la vente/);

    expect((await screen.findByText("Quantité insuffisante pour cette vente")).closest("[role='alert']")).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(quantityField().value).toBe("9");
  });

  it("réseau coupé : un message qui dit quoi faire", async () => {
    record.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    show();
    fill("BTC", "1", "1");
    submit(/Enregistrer l'achat/);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Impossible de joindre le serveur/);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("PositionDialog : les champs suivent le mode", () => {
  it("passer à un achat propose le prix du marché de l'actif choisi, à la correction la position actuelle", () => {
    show();
    fireEvent.change(symbolField(), { target: { value: "ETH" } });
    mode("Vente");
    expect(priceField().value).toBe("2300");
    expect(quantityField().value).toBe("");
    mode("Corriger");
    expect(quantityField().value).toBe("1.2");
    expect(priceField().value).toBe("2500");
  });

  it("changer de mode efface les messages d'erreur", () => {
    show();
    submit(/Enregistrer l'achat/);
    expect(screen.getByText("Choisissez un actif.")).toBeTruthy();
    mode("Vente");
    expect(screen.queryByText("Choisissez un actif.")).toBeNull();
  });
});

describe("PositionDialog : correction et retrait", () => {
  it("corriger envoie la quantité et le prix moyen exacts pour cet actif", async () => {
    show("BTC");
    fireEvent.change(quantityField(), { target: { value: "0,07" } });
    fireEvent.change(priceField(), { target: { value: "61000,25" } });
    submit(/Enregistrer la correction/);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(setAsset).toHaveBeenCalledWith(expect.objectContaining({ path: { symbol: "BTC" }, body: { quantity: "0.07", avgBuyPrice: "61000.25" } }));
    expect(record).not.toHaveBeenCalled();
    expect(screen.getByText("Position BTC mise à jour.")).toBeTruthy();
  });

  it("corriger un actif absent le crée (import initial)", async () => {
    show();
    mode("Corriger");
    fill("sol", "10", "150");
    expect(screen.queryByRole("button", { name: "Retirer cette position" })).toBeNull(); // rien à retirer
    submit(/Enregistrer la correction/);
    await waitFor(() => expect(setAsset).toHaveBeenCalled());
    expect(setAsset).toHaveBeenCalledWith(expect.objectContaining({ path: { symbol: "SOL" }, body: { quantity: "10", avgBuyPrice: "150" } }));
  });

  it("retirer demande confirmation ; « Garder » n'appelle rien", () => {
    show("BTC");
    fireEvent.click(screen.getByRole("button", { name: "Retirer cette position" }));
    expect(screen.getByText(/Retirer BTC de votre portefeuille \?/)).toBeTruthy();
    expect(screen.getByText(/n’efface pas l’historique de vos ordres/)).toBeTruthy();
    expect(removeAsset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Garder" }));
    expect(screen.queryByText(/Retirer BTC de votre portefeuille/)).toBeNull();
    expect(removeAsset).not.toHaveBeenCalled();
  });

  it("retrait confirmé : la position est retirée, annoncé, la fenêtre se ferme", async () => {
    show("BTC");
    fireEvent.click(screen.getByRole("button", { name: "Retirer cette position" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, retirer" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(removeAsset).toHaveBeenCalledWith(expect.objectContaining({ path: { symbol: "BTC" } }));
    expect(screen.getByText("Position BTC retirée.")).toBeTruthy();
  });

  it("retrait d'une position déjà disparue (404) : message en français, pas « Not Found »", async () => {
    removeAsset.mockRejectedValueOnce({ statusCode: 404, message: "Not Found" });
    show("BTC");
    fireEvent.click(screen.getByRole("button", { name: "Retirer cette position" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, retirer" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Cette position n'existe plus.");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Oui, retirer" })).toBeNull(); // la confirmation est refermée
  });

  it("modification simultanée refusée par l'API (409) : son message est affiché", async () => {
    setAsset.mockRejectedValueOnce({ statusCode: 409, message: "La position a été modifiée en parallèle, réessayez" });
    show("BTC");
    submit(/Enregistrer la correction/);
    expect((await screen.findByRole("alert")).textContent).toContain("modifiée en parallèle");
  });
});

describe("PositionDialog : fermeture", () => {
  it("Annuler et Échap ferment sans rien envoyer", () => {
    show();
    fill("BTC", "1", "1");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(record).not.toHaveBeenCalled();
  });
});
