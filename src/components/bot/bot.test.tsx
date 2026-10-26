import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TradingStatusDto } from "@/lib/api/types.gen";

let current: TradingStatusDto;
const getStatus = vi.fn();
const activate = vi.fn();
const deactivate = vi.fn();

vi.mock("@/lib/api/sdk.gen", () => ({
  riskControllerStatus: (...a: unknown[]) => getStatus(...a),
  riskControllerActivateKillSwitch: (...a: unknown[]) => activate(...a),
  riskControllerDeactivateKillSwitch: (...a: unknown[]) => deactivate(...a),
}));

import { renderWithProviders } from "@/test-utils";
import { tradingStatus } from "@/test-fixtures";
import { BotStatusCard, describeStatus } from "./BotStatusCard";

const stopped = () => tradingStatus({ killSwitchActive: true, killSwitchAt: "2026-10-23T09:00:00Z", canTrade: false, blockedReason: "KILL_SWITCH" });

beforeEach(() => {
  current = tradingStatus();
  getStatus.mockReset().mockImplementation(async () => ({ data: { ...current } }));
  activate.mockReset().mockImplementation(async () => {
    current = stopped();
    return { data: { ...current } };
  });
  deactivate.mockReset().mockImplementation(async () => {
    current = tradingStatus();
    return { data: { ...current } };
  });
});

const show = async () => {
  const view = renderWithProviders(<BotStatusCard />);
  await screen.findByRole("heading", { level: 2 });
  return view;
};

describe("describeStatus", () => {
  it("actif en simulation : le dit, sans argent réel", () => {
    expect(describeStatus(tradingStatus()).detail).toMatch(/aucun argent réel/);
  });
  it("actif en réel : le dit aussi", () => {
    expect(describeStatus(tradingStatus({ tradingMode: "LIVE" })).detail).toMatch(/argent réel/);
  });
  it("kill switch : arrêté, avec la date", () => {
    const text = describeStatus(stopped());
    expect(text.title).toBe("Le robot est arrêté");
    expect(text.detail).toMatch(/Aucun ordre ne part/);
    expect(text.tone).toBe("stopped");
  });
  it("pause pour perte journalière : en pause, avec la reprise", () => {
    const text = describeStatus(tradingStatus({ canTrade: false, blockedReason: "PAUSED_DAILY_LOSS", botPausedUntil: "2026-10-24T00:00:00Z" }));
    expect(text.title).toBe("Le robot est en pause");
    expect(text.detail).toMatch(/Perte journalière maximale atteinte\. Reprise automatique/);
  });
});

describe("BotStatusCard", () => {
  it("robot actif en simulation : état, mode et bouton d'arrêt d'urgence", async () => {
    await show();
    expect(screen.getByRole("heading", { name: "Le robot est actif" })).toBeTruthy();
    expect(screen.getByText("Simulation")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Arrêt d'urgence" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Réactiver le robot" })).toBeNull();
  });

  it("l'arrêt d'urgence est immédiat : un seul clic, sans confirmation", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Arrêt d'urgence" }));

    await screen.findByRole("heading", { name: "Le robot est arrêté" });
    expect(activate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Réactiver le robot" })).toBeTruthy();
    expect((await screen.findByRole("status")).textContent).toMatch(/Robot arrêté/);
  });

  it("jamais optimiste : tant que l'API n'a pas confirmé, le robot est affiché actif", async () => {
    let release: () => void = () => undefined;
    activate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            current = stopped();
            resolve({ data: { ...current } });
          };
        }),
    );
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Arrêt d'urgence" }));

    expect(await screen.findByRole("button", { name: "Arrêt en cours…" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Le robot est actif" })).toBeTruthy();

    release();
    await screen.findByRole("heading", { name: "Le robot est arrêté" });
  });

  it("si l'arrêt n'est pas confirmé : message d'erreur clair, le robot reste affiché actif", async () => {
    activate.mockReset().mockRejectedValue(new TypeError("Failed to fetch"));
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Arrêt d'urgence" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Impossible de joindre le serveur/);
    expect(screen.getByRole("heading", { name: "Le robot est actif" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Arrêt d'urgence" })).toBeTruthy();
  });

  it("la reprise demande une confirmation, et « Rester à l’arrêt » n'appelle rien", async () => {
    current = stopped();
    await show();

    fireEvent.click(screen.getByRole("button", { name: "Réactiver le robot" }));
    expect(screen.getByText(/Reprendre le trading automatique/)).toBeTruthy();
    expect(deactivate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Rester à l’arrêt" }));
    expect(screen.queryByText(/Reprendre le trading automatique/)).toBeNull();
    expect(deactivate).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Le robot est arrêté" })).toBeTruthy();
  });

  it("reprise confirmée : le robot redevient actif", async () => {
    current = stopped();
    await show();

    fireEvent.click(screen.getByRole("button", { name: "Réactiver le robot" }));
    fireEvent.click(screen.getByRole("button", { name: "Oui, reprendre" }));

    await screen.findByRole("heading", { name: "Le robot est actif" });
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Reprendre le trading automatique/)).toBeNull();
  });

  it("en pause pour perte journalière : la pause est dite comme telle, et l'arrêt d'urgence reste possible", async () => {
    current = tradingStatus({ canTrade: false, blockedReason: "PAUSED_DAILY_LOSS", botPausedUntil: "2026-10-24T00:00:00Z" });
    await show();
    expect(screen.getByRole("heading", { name: "Le robot est en pause" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Arrêt d'urgence" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Réactiver le robot" })).toBeNull(); // la pause n'est pas un kill switch
  });

  it("mode réel : badge « Réel »", async () => {
    current = tradingStatus({ tradingMode: "LIVE" });
    await show();
    expect(screen.getByText("Réel")).toBeTruthy();
  });

  it("chargement impossible : alerte et « Réessayer »", async () => {
    getStatus.mockReset().mockRejectedValue(new Error("hors ligne"));
    renderWithProviders(<BotStatusCard />);
    expect((await screen.findByRole("alert")).textContent).toContain("Impossible de charger l’état du robot.");

    getStatus.mockImplementation(async () => ({ data: { ...current } }));
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Le robot est actif" })).toBeTruthy());
  });
});
