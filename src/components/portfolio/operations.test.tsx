import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeOperationsServer } from "@/test-operations-server";

const server = fakeOperationsServer();
vi.mock("@/lib/api/sdk.gen", () => ({
  portfolioControllerOperations: (...a: unknown[]) => server.handler(...(a as [])),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { operation } from "@/test-fixtures";
import { renderWithProviders } from "@/test-utils";
import { OperationsCard } from "./OperationsCard";

const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

beforeEach(() => {
  server.handler.mockClear();
  server.state.all = [];
});

describe("OperationsCard", () => {
  it("chargement : un message annoncé comme occupé", () => {
    renderWithProviders(<OperationsCard currency="USD" />);
    expect(screen.getByText("Chargement de l’historique…").closest("[aria-busy='true']")).not.toBeNull();
  });

  it("sans opération : l'explique, sans cumul ni liste, mais le lien vers l'historique reste", async () => {
    renderWithProviders(<OperationsCard currency="USD" />);
    expect(await screen.findByText(/Aucune opération enregistrée pour l’instant/)).toBeTruthy();
    expect(screen.queryByTestId("realized-total")).toBeNull();
    expect(screen.getByRole("link", { name: "Tout l’historique" }).getAttribute("href")).toBe("/historique");
  });

  it("ne demande que les 8 plus récentes", async () => {
    server.state.all = Array.from({ length: 12 }, () => operation());
    renderWithProviders(<OperationsCard currency="USD" />);
    const list = await screen.findByRole("list", { name: "Dernières opérations" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    expect(server.handler).toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ limit: 8 }) }));
  });

  it("montre le cumul réalisé de tout le journal (pas seulement des 8 lignes affichées)", async () => {
    // 12 ventes de +10 : seules 8 sont affichées, le cumul porte sur les 12.
    server.state.all = Array.from({ length: 12 }, () => operation({ kind: "SELL", realizedPnl: "10" }));
    renderWithProviders(<OperationsCard currency="USD" />);
    expect(plain((await screen.findByTestId("realized-total")).textContent)).toMatch(/^\+120,00/);
  });

  it("chargement impossible : alerte et « Réessayer »", async () => {
    server.handler.mockRejectedValueOnce(new Error("hors ligne"));
    renderWithProviders(<OperationsCard currency="USD" />);
    expect((await screen.findByRole("alert")).textContent).toContain("Impossible de charger l’historique des opérations.");

    server.state.all = [operation()];
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(screen.getByRole("list", { name: "Dernières opérations" })).toBeTruthy());
  });
});
