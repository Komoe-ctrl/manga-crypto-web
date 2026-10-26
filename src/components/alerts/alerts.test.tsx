import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertDto, CreateAlertDto, UpdateAlertDto } from "@/lib/api/types.gen";

let alerts: AlertDto[];
const listAlerts = vi.fn();
const createAlert = vi.fn();
const updateAlert = vi.fn();
const removeAlert = vi.fn();

vi.mock("@/lib/api/sdk.gen", () => ({
  alertsControllerList: (...a: unknown[]) => listAlerts(...a),
  alertsControllerCreate: (...a: unknown[]) => createAlert(...a),
  alertsControllerUpdate: (...a: unknown[]) => updateAlert(...a),
  alertsControllerRemove: (...a: unknown[]) => removeAlert(...a),
  portfolioControllerGet: async () => ({
    data: { currency: "USD", assets: [{ symbol: "USDT" }, { symbol: "DOGE" }], totalValue: "0", totalCost: "0", totalPnl: "0", totalPnlPct: null, complete: true },
  }),
}));

import { alert } from "@/test-fixtures";
import { renderWithProviders } from "@/test-utils";
import { AlertsPage } from "./AlertsPage";

beforeEach(() => {
  alerts = [];
  listAlerts.mockReset().mockImplementation(async () => ({ data: [...alerts] }));
  createAlert.mockReset().mockImplementation(async ({ body }: { body: CreateAlertDto }) => {
    const created = alert({ id: `new-${alerts.length}`, assetSymbol: body.assetSymbol ?? null, windowMinutes: body.windowMinutes ?? null, ...body } as Partial<AlertDto>);
    alerts = [created, ...alerts];
    return { data: created };
  });
  updateAlert.mockReset().mockImplementation(async ({ path, body }: { path: { id: string }; body: UpdateAlertDto }) => {
    alerts = alerts.map((a) => (a.id === path.id ? ({ ...a, ...body } as AlertDto) : a));
    return { data: alerts.find((a) => a.id === path.id) };
  });
  removeAlert.mockReset().mockImplementation(async ({ path }: { path: { id: string } }) => {
    alerts = alerts.filter((a) => a.id !== path.id);
    return { data: undefined };
  });
});

const show = async () => {
  const view = renderWithProviders(<AlertsPage />);
  await screen.findByRole("heading", { name: "Vos alertes" });
  return view;
};
const createdBody = () => (createAlert.mock.calls[0][0] as { body: CreateAlertDto }).body;
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Créer l'alerte" }));

describe("AlertsPage : liste", () => {
  it("sans alerte : explique à quoi ça sert", async () => {
    await show();
    expect(screen.getByText(/Aucune alerte\. Créez-en une/)).toBeTruthy();
  });

  it("chaque alerte est une phrase, avec son canal et son état (armée, déclenchée, en pause)", async () => {
    alerts = [
      alert({ id: "1" }),
      alert({ id: "2", condition: "PRICE_CROSS_ABOVE", threshold: "70000", windowMinutes: null, channel: "EMAIL", isTriggered: true, lastTriggeredAt: "2026-10-22T10:00:00Z" }),
      alert({ id: "3", condition: "PORTFOLIO_DROP_PCT", assetSymbol: null, isActive: false, isCritical: true }),
    ];
    await show();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("BTC perd 5 % en 1 jour")).toBeTruthy();
    expect(within(rows[0]).getByText("Armée")).toBeTruthy();
    expect(within(rows[0]).getByText("Push")).toBeTruthy();
    expect(within(rows[1]).getByText(/^BTC dépasse/)).toBeTruthy();
    expect(within(rows[1]).getByText(/^Déclenchée le/)).toBeTruthy();
    expect(within(rows[1]).getByText("E-mail")).toBeTruthy();
    expect(within(rows[2]).getByText("Le portefeuille perd 5 % en 1 jour")).toBeTruthy();
    expect(within(rows[2]).getByText("En pause")).toBeTruthy();
    expect(within(rows[2]).getByText("Critique")).toBeTruthy();
  });

  it("chargement impossible : alerte et « Réessayer »", async () => {
    listAlerts.mockReset().mockRejectedValue(new Error("hors ligne"));
    renderWithProviders(<AlertsPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Impossible de charger vos alertes.");

    listAlerts.mockImplementation(async () => ({ data: [] }));
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByText(/Aucune alerte/);
  });
});

describe("AlertsPage : activer, mettre en pause, supprimer", () => {
  it("l'interrupteur met l'alerte en pause tout de suite et l'API en est informée", async () => {
    alerts = [alert({ id: "1" })];
    let release: () => void = () => undefined;
    const real = updateAlert.getMockImplementation()!;
    updateAlert.mockImplementationOnce((arg: unknown) => new Promise((resolve) => (release = () => resolve(real(arg)))));
    await show();
    const toggle = screen.getByRole("switch", { name: "BTC perd 5 % en 1 jour" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(toggle);
    // Optimiste : l'interrupteur bouge AVANT la réponse de l'API.
    await waitFor(() => expect(screen.getByRole("switch", { name: "BTC perd 5 % en 1 jour" }).getAttribute("aria-checked")).toBe("false"));
    expect(updateAlert).toHaveBeenCalledWith(expect.objectContaining({ path: { id: "1" }, body: { isActive: false } }));

    release();
    await screen.findByText("En pause");
  });

  it("si l'API refuse : retour arrière et message", async () => {
    alerts = [alert({ id: "1" })];
    updateAlert.mockReset().mockRejectedValue({ statusCode: 400, message: "Alerte introuvable" });
    await show();

    fireEvent.click(screen.getByRole("switch", { name: "BTC perd 5 % en 1 jour" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Alerte introuvable");
    await waitFor(() => expect(screen.getByRole("switch", { name: "BTC perd 5 % en 1 jour" }).getAttribute("aria-checked")).toBe("true"));
  });

  it("suppression : confirmation d'abord, « Garder » n'appelle rien", async () => {
    alerts = [alert({ id: "1" })];
    await show();

    fireEvent.click(screen.getByRole("button", { name: /Supprimer l'alerte : BTC perd 5 %/ }));
    expect(screen.getByText("Supprimer cette alerte ?")).toBeTruthy();
    expect(removeAlert).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Garder" }));
    expect(screen.queryByText("Supprimer cette alerte ?")).toBeNull();
    expect(removeAlert).not.toHaveBeenCalled();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("suppression confirmée : l'alerte disparaît", async () => {
    alerts = [alert({ id: "1" }), alert({ id: "2", assetSymbol: "ETH" })];
    await show();

    fireEvent.click(screen.getByRole("button", { name: /Supprimer l'alerte : BTC perd 5 %/ }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, supprimer" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(removeAlert).toHaveBeenCalledWith(expect.objectContaining({ path: { id: "1" } }));
    expect(screen.getByText("ETH perd 5 % en 1 jour")).toBeTruthy();
  });

  it("suppression refusée par l'API : l'alerte revient et un message l'explique", async () => {
    alerts = [alert({ id: "1" })];
    removeAlert.mockReset().mockRejectedValue(new TypeError("Failed to fetch"));
    await show();

    fireEvent.click(screen.getByRole("button", { name: /Supprimer l'alerte/ }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, supprimer" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/Impossible de joindre le serveur/);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
  });
});

describe("AlertForm : les champs suivent la condition", () => {
  it("variation : actif, seuil en % et durée", async () => {
    await show();
    expect(screen.getByLabelText("Actif")).toBeTruthy();
    expect(screen.getByLabelText("Seuil (en %)")).toBeTruthy();
    expect(screen.getByLabelText("Sur une durée de")).toBeTruthy();
  });

  it("franchissement : un prix en USD, pas de durée", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Me prévenir quand"), { target: { value: "PRICE_CROSS_ABOVE" } });
    expect(screen.getByLabelText("Prix (en USD)")).toBeTruthy();
    expect(screen.queryByLabelText("Sur une durée de")).toBeNull();
    expect(screen.getByLabelText("Actif")).toBeTruthy();
  });

  it("portefeuille : pas d'actif", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Me prévenir quand"), { target: { value: "PORTFOLIO_DROP_PCT" } });
    expect(screen.queryByLabelText("Actif")).toBeNull();
    expect(screen.getByLabelText("Seuil (en %)")).toBeTruthy();
    expect(screen.getByLabelText("Sur une durée de")).toBeTruthy();
  });

  it("propose les actifs du portefeuille sans USDT", async () => {
    await show();
    await waitFor(() => expect([...document.querySelectorAll("#alert-symbols option")].map((o) => (o as HTMLOptionElement).value)).toContain("DOGE"));
    expect([...document.querySelectorAll("#alert-symbols option")].map((o) => (o as HTMLOptionElement).value)).not.toContain("USDT");
  });
});

describe("AlertForm : création", () => {
  it("champs vides : messages, aucun appel", async () => {
    await show();
    submit();
    expect(screen.getByText(/Choisissez un actif/)).toBeTruthy();
    expect(screen.getByText("Saisissez un pourcentage.")).toBeTruthy();
    expect(createAlert).not.toHaveBeenCalled();
  });

  it("variation : envoie exactement ce que l'API attend et ajoute l'alerte à la liste", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Actif"), { target: { value: "eth" } });
    fireEvent.change(screen.getByLabelText("Seuil (en %)"), { target: { value: "7,5" } });
    fireEvent.change(screen.getByLabelText("Sur une durée de"), { target: { value: "240" } });
    fireEvent.change(screen.getByLabelText("Canal"), { target: { value: "EMAIL" } });
    fireEvent.click(screen.getByRole("switch", { name: /Alerte critique/ }));
    submit();

    await screen.findByText("ETH perd 7.5 % en 4 h");
    expect(createdBody()).toEqual({
      condition: "PRICE_DROP_PCT",
      assetSymbol: "ETH",
      threshold: "7.5",
      windowMinutes: 240,
      channel: "EMAIL",
      isCritical: true,
    });
    expect(screen.getByText("Alerte créée.")).toBeTruthy();
  });

  it("franchissement : le corps n'a pas de fenêtre", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Me prévenir quand"), { target: { value: "PRICE_CROSS_BELOW" } });
    fireEvent.change(screen.getByLabelText("Actif"), { target: { value: "BTC" } });
    fireEvent.change(screen.getByLabelText("Prix (en USD)"), { target: { value: "50000" } });
    submit();

    await waitFor(() => expect(createAlert).toHaveBeenCalledTimes(1));
    expect(createdBody()).not.toHaveProperty("windowMinutes");
    expect(createdBody().threshold).toBe("50000");
  });

  it("après création : le formulaire est vidé mais garde la condition et le canal choisis", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Me prévenir quand"), { target: { value: "PORTFOLIO_DROP_PCT" } });
    fireEvent.change(screen.getByLabelText("Canal"), { target: { value: "TELEGRAM" } });
    fireEvent.change(screen.getByLabelText("Seuil (en %)"), { target: { value: "10" } });
    submit();

    await screen.findByText("Alerte créée.");
    expect((screen.getByLabelText("Seuil (en %)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Me prévenir quand") as HTMLSelectElement).value).toBe("PORTFOLIO_DROP_PCT");
    expect((screen.getByLabelText("Canal") as HTMLSelectElement).value).toBe("TELEGRAM");
  });

  it("refus de l'API (ex. doublon) : le message est affiché, la saisie est conservée", async () => {
    createAlert.mockReset().mockRejectedValue({ statusCode: 409, message: "Une alerte identique existe déjà" });
    await show();
    fireEvent.change(screen.getByLabelText("Actif"), { target: { value: "BTC" } });
    fireEvent.change(screen.getByLabelText("Seuil (en %)"), { target: { value: "5" } });
    submit();

    expect((await screen.findByText("Une alerte identique existe déjà")).closest("[role='alert']")).not.toBeNull();
    expect((screen.getByLabelText("Seuil (en %)") as HTMLInputElement).value).toBe("5");
  });
});
