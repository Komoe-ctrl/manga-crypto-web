import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DigestDto } from "@/lib/api/types.gen";

const listDigests = vi.fn();
const readDigest = vi.fn();
const getSettings = vi.fn();
vi.mock("@/lib/api/sdk.gen", () => ({
  digestsControllerList: (...a: unknown[]) => listDigests(...a),
  digestsControllerRead: (...a: unknown[]) => readDigest(...a),
  notificationsControllerGetSettings: (...a: unknown[]) => getSettings(...a),
}));
vi.mock("@/lib/auth/auth-provider", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: { id: "u1", email: "a@example.com", timezone: "Europe/Paris" } },
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { renderWithProviders } from "@/test-utils";
import { digest, settings } from "@/test-fixtures";
import { DigestCard } from "./DigestCard";
import { DigestHistory } from "./DigestHistory";
import { ReportsPage } from "./ReportsPage";

const today = digest({ id: "d-today" });
const yesterday = digest({
  id: "d-yesterday",
  summary: "Légère baisse de −0,4 % pendant la nuit.",
  points: ["1 alerte non urgente regroupée (ETH −1,1 %)."],
  portfolioDeltaPct: "-0.4",
  queuedAlertsCount: 1,
  readAt: "2026-10-22T07:00:00Z",
  generatedAt: "2026-10-22T06:00:00Z",
});
const week = digest({
  id: "d-week",
  period: "WEEK",
  periodStart: "2026-10-16T06:00:00Z",
  periodEnd: "2026-10-23T06:00:00Z",
  summary: "Semaine positive : +4,8 % pour le portefeuille.",
  points: ["Meilleur actif : SOL (+11,6 %)."],
  portfolioDeltaPct: "4.8",
  queuedAlertsCount: 0,
  generatedAt: "2026-10-20T06:00:00Z",
});

const card = (props: Partial<React.ComponentProps<typeof DigestCard>> = {}) =>
  renderWithProviders(<DigestCard daily={[today, yesterday]} weekly={[week]} timeZone="Europe/Paris" nextReportTime="08:00" {...props} />);

beforeEach(() => {
  listDigests.mockReset();
  readDigest.mockReset().mockResolvedValue({ data: { ...today, readAt: "2026-10-23T07:00:00Z" } });
  getSettings.mockReset().mockResolvedValue({ data: settings() });
});

describe("DigestCard", () => {
  it("affiche par défaut le rapport de ce matin : synthèse, points clés, « Nouveau »", () => {
    card();
    expect(screen.getByText(/Nuit calme/)).toBeTruthy();
    expect(screen.getByText("2 alertes non urgentes regroupées pendant la nuit.")).toBeTruthy();
    expect(screen.getByText("Nouveau")).toBeTruthy();
    expect(screen.getByText(/Généré le 23 oct\., 08:00/)).toBeTruthy(); // 06:00 UTC = 08:00 à Paris
  });

  it("mentionne les alertes regroupées par le Mode Nuit, au singulier comme au pluriel", () => {
    card();
    // Le pied de carte (le point clé du rapport contient une phrase voisine : on vise la bonne).
    expect(screen.getByText(/2 alertes non urgentes regroupées · lecture/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hier" }));
    expect(screen.getByText(/1 alerte non urgente regroupée · lecture/)).toBeTruthy();
  });

  it("l'onglet « Hier » montre le deuxième rapport, déjà lu", () => {
    card();
    fireEvent.click(screen.getByRole("button", { name: "Hier" }));
    expect(screen.getByText(/Légère baisse/)).toBeTruthy();
    expect(screen.getByText("Lu")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marquer comme lu" })).toBeNull();
  });

  it("l'onglet « 7 jours » montre la synthèse hebdomadaire avec sa période", () => {
    card();
    fireEvent.click(screen.getByRole("button", { name: "7 jours" }));
    expect(screen.getByText(/Semaine positive/)).toBeTruthy();
    expect(screen.getByText(/Synthèse hebdomadaire · du 16 oct\. au 23 oct\./)).toBeTruthy();
  });

  it("« Marquer comme lu » prévient l'API avec l'identifiant du rapport affiché", async () => {
    card();
    fireEvent.click(screen.getByRole("button", { name: "Marquer comme lu" }));
    await waitFor(() => expect(readDigest).toHaveBeenCalledWith({ path: { id: "d-today" }, throwOnError: true }));
  });

  it("le bouton disparaît une fois lu (l'API ne sait pas remettre « non lu »)", () => {
    card({ daily: [{ ...today, readAt: "2026-10-23T07:00:00Z" }, yesterday] });
    expect(screen.getByText("Lu")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marquer comme lu" })).toBeNull();
  });

  it.each([
    ["Ce matin", /Aucun rapport pour l'instant\. Le prochain arrive à 07:30\./],
    ["Hier", /Aucun rapport pour l'instant/],
    ["7 jours", /arrive chaque lundi/],
  ])("sans rapport (« %s ») : un état vide qui explique quand le prochain arrive", (tab, expected) => {
    card({ daily: [], weekly: [], nextReportTime: "07:30" });
    fireEvent.click(screen.getByRole("button", { name: tab }));
    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.getByText("Aucun rapport pour cette période")).toBeTruthy();
    expect(screen.queryByText("Nouveau")).toBeNull();
  });

  it("un seul rapport : « Hier » est vide mais « Ce matin » reste affiché", () => {
    card({ daily: [today] });
    fireEvent.click(screen.getByRole("button", { name: "Hier" }));
    expect(screen.getByText(/Aucun rapport pour l'instant/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ce matin" }));
    expect(screen.getByText(/Nuit calme/)).toBeTruthy();
  });

  it("les onglets annoncent lequel est actif", () => {
    card();
    expect(screen.getByRole("button", { name: "Ce matin" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "7 jours" }));
    expect(screen.getByRole("button", { name: "7 jours" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Ce matin" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("un rapport sans points clés n'affiche pas de liste vide", () => {
    card({ daily: [{ ...today, points: [] }] });
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("DigestHistory", () => {
  const render = (digests: readonly DigestDto[]) => renderWithProviders(<DigestHistory digests={digests} timeZone="Europe/Paris" />);

  it("liste les rapports avec leur date, leur synthèse et la variation du portefeuille", () => {
    render([today, yesterday]);
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("23 oct., 08:00");
    expect(rows[0].textContent).toContain("+1,20 %");
    expect(rows[1].textContent).toContain("−0,40 %");
  });

  it("une hausse est verte, une baisse orange", () => {
    const { container } = render([today, yesterday]);
    expect(container.querySelector(".text-gain")?.textContent).toBe("+1,20 %");
    expect(container.querySelector(".text-loss")?.textContent).toBe("−0,40 %");
  });

  it("variation absente : « — », jamais « NaN »", () => {
    render([{ ...today, portfolioDeltaPct: null }]);
    expect(screen.getByText("—")).toBeTruthy();
    expect(document.body.textContent).not.toContain("NaN");
  });

  it("sans historique, explique ce qui apparaîtra", () => {
    render([]);
    expect(screen.getByText(/un rapport par matin/)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("ReportsPage", () => {
  const answer = (period: string) =>
    period === "TODAY" ? { data: { items: [today, yesterday], unreadCount: 1 } } : { data: { items: [week], unreadCount: 1 } };

  it("charge les rapports quotidiens et hebdomadaires et affiche l'ensemble", async () => {
    listDigests.mockImplementation(async ({ query }: { query: { period: string } }) => answer(query.period));
    renderWithProviders(<ReportsPage />);

    expect(await screen.findByRole("heading", { name: "Rapport automatique" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Historique des rapports" })).toBeTruthy();
    expect(listDigests).toHaveBeenCalledWith({ query: { period: "TODAY", limit: 14 }, throwOnError: true });
    expect(listDigests).toHaveBeenCalledWith({ query: { period: "WEEK", limit: 4 }, throwOnError: true });
  });

  it("l'état vide donne l'heure réglée par l'utilisateur pour le prochain rapport", async () => {
    getSettings.mockResolvedValue({ data: settings({ digestMinute: 450 }) });
    listDigests.mockResolvedValue({ data: { items: [], unreadCount: 0 } });
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText(/Le prochain arrive à 07:30/)).toBeTruthy();
  });

  it("annonce le chargement puis une erreur avec un bouton pour réessayer", async () => {
    listDigests.mockRejectedValueOnce(new TypeError("réseau coupé")).mockRejectedValueOnce(new TypeError("réseau coupé"));
    renderWithProviders(<ReportsPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Impossible de charger vos rapports");

    listDigests.mockImplementation(async ({ query }: { query: { period: string } }) => answer(query.period));
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("heading", { name: "Rapport automatique" })).toBeTruthy();
  });
});
