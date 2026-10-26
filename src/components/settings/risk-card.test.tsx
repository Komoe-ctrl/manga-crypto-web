import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RiskSettingsDto } from "@/lib/api/types.gen";

let current: RiskSettingsDto;
const getRisk = vi.fn();
const updateRisk = vi.fn();

vi.mock("@/lib/api/sdk.gen", () => ({
  riskControllerGetSettings: (...a: unknown[]) => getRisk(...a),
  riskControllerUpdateSettings: (...a: unknown[]) => updateRisk(...a),
}));

import { renderWithProviders } from "@/test-utils";
import { riskSettings } from "@/test-fixtures";
import { RiskCard } from "./RiskCard";

beforeEach(() => {
  current = riskSettings();
  getRisk.mockReset().mockImplementation(async () => ({ data: { ...current } }));
  updateRisk.mockReset().mockImplementation(async ({ body }: { body: Partial<RiskSettingsDto> }) => {
    current = { ...current, ...body };
    return { data: { ...current } };
  });
});

const show = async () => {
  const view = renderWithProviders(<RiskCard />);
  await screen.findByRole("heading", { name: "Garde-fous du robot" });
  return view;
};
const input = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

describe("RiskCard", () => {
  it("affiche les quatre garde-fous du serveur", async () => {
    await show();
    expect(input(/Exposition maximale/).value).toBe("10");
    expect(input(/Perte journalière maximale/).value).toBe("5");
    expect(input(/Stop-loss/).value).toBe("5");
    expect(input(/Take-profit/).value).toBe("10");
  });

  it("enregistre en sortant du champ, avec un nombre, et affiche ce que l'API a retenu", async () => {
    await show();
    fireEvent.change(input(/Exposition maximale/), { target: { value: "12,5" } });
    fireEvent.blur(input(/Exposition maximale/));

    await waitFor(() => expect(updateRisk).toHaveBeenCalledTimes(1));
    expect(updateRisk).toHaveBeenCalledWith(expect.objectContaining({ body: { maxExposurePct: 12.5 } }));
    expect((await screen.findByRole("status")).textContent).toBe("Garde-fous enregistrés.");
    await waitFor(() => expect(input(/Exposition maximale/).value).toBe("12,5"));
  });

  it("Entrée valide aussi", async () => {
    await show();
    fireEvent.change(input(/Perte journalière/), { target: { value: "3" } });
    fireEvent.keyDown(input(/Perte journalière/), { key: "Enter" });
    await waitFor(() => expect(updateRisk).toHaveBeenCalledWith(expect.objectContaining({ body: { maxDailyLossPct: 3 } })));
  });

  it("valeur inchangée : aucun appel", async () => {
    await show();
    fireEvent.blur(input(/Stop-loss/));
    expect(updateRisk).not.toHaveBeenCalled();
  });

  it.each([
    ["", /Saisissez un nombre positif/],
    ["abc", /Saisissez un nombre positif/],
    ["0", /Au moins 0,01/],
    ["101", /Au plus 100/],
  ])("refuse %j sans appeler l'API", async (value, message) => {
    await show();
    fireEvent.change(input(/Exposition maximale/), { target: { value } });
    fireEvent.blur(input(/Exposition maximale/));

    expect((await screen.findByRole("alert")).textContent).toMatch(message);
    expect(input(/Exposition maximale/).getAttribute("aria-invalid")).toBe("true");
    expect(updateRisk).not.toHaveBeenCalled();
  });

  it("le take-profit peut aller jusqu'à 1000 %, pas les autres", async () => {
    await show();
    fireEvent.change(input(/Take-profit/), { target: { value: "500" } });
    fireEvent.blur(input(/Take-profit/));
    await waitFor(() => expect(updateRisk).toHaveBeenCalledWith(expect.objectContaining({ body: { defaultTakeProfitPct: 500 } })));

    fireEvent.change(input(/Take-profit/), { target: { value: "1001" } });
    fireEvent.blur(input(/Take-profit/));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Au plus 1000/);
  });

  it("refus de l'API : message affiché, valeur d'origine conservée côté serveur", async () => {
    updateRisk.mockReset().mockRejectedValue({ statusCode: 400, message: "Valeur hors limites" });
    await show();
    fireEvent.change(input(/Exposition maximale/), { target: { value: "50" } });
    fireEvent.blur(input(/Exposition maximale/));

    expect((await screen.findByRole("alert")).textContent).toBe("Valeur hors limites");
    expect(current.maxExposurePct).toBe(10);
  });

  it("chargement impossible : alerte et « Réessayer »", async () => {
    getRisk.mockReset().mockRejectedValue(new Error("hors ligne"));
    renderWithProviders(<RiskCard />);
    expect((await screen.findByRole("alert")).textContent).toContain("Impossible de charger les garde-fous.");

    getRisk.mockImplementation(async () => ({ data: { ...current } }));
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByRole("heading", { name: "Garde-fous du robot" });
  });
});
