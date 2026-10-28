import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationDto } from "@/lib/api/types.gen";

const list = vi.fn();
const read = vi.fn();
const readAll = vi.fn();
let pathname = "/";
vi.mock("@/lib/api/sdk.gen", () => ({
  notificationsControllerList: (...a: unknown[]) => list(...a),
  notificationsControllerRead: (...a: unknown[]) => read(...a),
  notificationsControllerReadAll: (...a: unknown[]) => readAll(...a),
}));
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth/auth-provider", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { id: "u1", email: "a@example.com", timezone: "Europe/Paris" },
    },
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { renderWithProviders } from "@/test-utils";
import { NotificationBell } from "./NotificationBell";
import { NotificationsPage } from "./NotificationsPage";

const notification = (over: Partial<NotificationDto> = {}): NotificationDto => ({
  id: "n1",
  title: "BTC −5 % en 24 h",
  body: "Le Bitcoin a baissé de 5 %.",
  critical: false,
  status: "DISPATCHED",
  deliveries: [{ channel: "PUSH", status: "SENT" }],
  readAt: null,
  digestId: null,
  createdAt: "2026-10-28T07:30:00Z",
  ...over,
});

const reply = (items: NotificationDto[], unreadCount = items.filter((i) => i.readAt === null).length) => ({ data: { items, unreadCount } });

beforeEach(() => {
  pathname = "/";
  list.mockReset().mockResolvedValue(reply([]));
  read.mockReset().mockResolvedValue({
    data: notification({ readAt: "2026-10-28T08:00:00Z" }),
  });
  readAll.mockReset().mockResolvedValue({ data: {} });
});

describe("NotificationBell", () => {
  it("écrit le nombre de non lues dans le nom accessible", async () => {
    list.mockResolvedValue(reply([notification()], 3));
    renderWithProviders(<NotificationBell />);
    expect((await screen.findByRole("link", { name: "Notifications, 3 non lues" })).getAttribute("href")).toBe("/notifications");
  });

  it("singulier pour une seule, aucun compteur quand tout est lu, plafonné à 99+", async () => {
    list.mockResolvedValue(reply([], 1));
    const first = renderWithProviders(<NotificationBell />);
    expect(await screen.findByRole("link", { name: "Notifications, 1 non lue" })).toBeTruthy();
    first.unmount();

    list.mockResolvedValue(reply([], 0));
    const second = renderWithProviders(<NotificationBell />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("link", { name: "Notifications" }).textContent).toBe("");
    second.unmount();

    list.mockResolvedValue(reply([], 250));
    renderWithProviders(<NotificationBell />);
    expect((await screen.findByRole("link", { name: "Notifications, 250 non lues" })).textContent).toBe("99+");
  });

  it("n'interroge que le compte : une notification, seulement les non lues", async () => {
    renderWithProviders(<NotificationBell />);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(list.mock.calls[0][0].query).toEqual({ limit: 1, unread: true });
  });

  it("annonce la page courante", async () => {
    pathname = "/notifications";
    renderWithProviders(<NotificationBell />);
    expect((await screen.findByRole("link", { name: "Notifications" })).getAttribute("aria-current")).toBe("page");
  });
});

describe("NotificationsPage", () => {
  it("affiche le titre de page et un état vide expliqué", async () => {
    renderWithProviders(<NotificationsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Notifications" })).toBeTruthy();
    expect(await screen.findByText(/Rien pour l'instant/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: /Tout marquer comme lu/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("liste titre, texte, état non lu, critique et canal d'envoi", async () => {
    list.mockResolvedValue(
      reply([
        notification({ critical: true }),
        notification({
          id: "n2",
          title: "Rapport",
          readAt: "2026-10-28T08:00:00Z",
        }),
      ]),
    );
    renderWithProviders(<NotificationsPage />);
    const rows = within(await screen.findByRole("list", { name: "Notifications" }))
      .getAllByRole("listitem", {})
      .filter((li) => li.querySelector("p"));
    expect(rows[0].textContent).toContain("Non lue");
    expect(rows[0].textContent).toContain("Critique");
    expect(rows[0].textContent).toContain("Push : envoyé");
    expect(screen.getByText("1 non lue")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Marquer comme lue :/ })).toHaveLength(1);
  });

  it("explique un échec d'envoi par la raison, en français", async () => {
    list.mockResolvedValue(
      reply([
        notification({
          deliveries: [
            {
              channel: "TELEGRAM",
              status: "FAILED",
              reason: "telegram_no_chat",
            },
          ],
        }),
      ]),
    );
    renderWithProviders(<NotificationsPage />);
    expect(await screen.findByText(/non envoyé\. Aucune conversation Telegram renseignée\./)).toBeTruthy();
  });

  it("dit qu'une notification est retenue par le Mode Nuit, puis reprise dans le rapport avec un lien", async () => {
    list.mockResolvedValue(
      reply([
        notification({ id: "h", status: "HELD", deliveries: [] }),
        notification({
          id: "d",
          status: "DIGESTED",
          digestId: "dg1",
          deliveries: [],
        }),
      ]),
    );
    renderWithProviders(<NotificationsPage />);
    expect(await screen.findByText(/Retenue par le Mode Nuit/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voir les rapports" }).getAttribute("href")).toBe("/rapports");
  });

  it("sans canal activé, le dit au lieu de rester muet", async () => {
    list.mockResolvedValue(reply([notification({ deliveries: [] })]));
    renderWithProviders(<NotificationsPage />);
    expect(await screen.findByText(/Aucun canal n.était activé/)).toBeTruthy();
  });

  it("marque une notification comme lue puis relit la boîte", async () => {
    list.mockResolvedValue(reply([notification()]));
    renderWithProviders(<NotificationsPage />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Marquer comme lue : BTC −5 % en 24 h",
      }),
    );
    await waitFor(() => expect(read).toHaveBeenCalledWith(expect.objectContaining({ path: { id: "n1" } })));
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1));
  });

  it("« Tout marquer comme lu » appelle l'API", async () => {
    list.mockResolvedValue(reply([notification()]));
    renderWithProviders(<NotificationsPage />);
    const button = await screen.findByRole("button", {
      name: /Tout marquer comme lu/,
    });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(readAll).toHaveBeenCalledOnce());
  });

  it("le filtre « Non lues » redemande à l'API seulement les non lues", async () => {
    renderWithProviders(<NotificationsPage />);
    await screen.findByText(/Rien pour l'instant/);
    fireEvent.click(screen.getByRole("button", { name: "Non lues" }));
    await waitFor(() => expect(list.mock.calls.some((c) => c[0].query.unread === true)).toBe(true));
    expect(await screen.findByText("Tout est lu.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Non lues" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("charge la page suivante depuis la date de la dernière notification lue", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) =>
      notification({
        id: `n${i}`,
        title: `Notif ${i}`,
        createdAt: `2026-10-28T07:${String(59 - i).padStart(2, "0")}:00Z`,
      }),
    );
    list.mockResolvedValueOnce(reply(page1, 20)).mockResolvedValueOnce(reply([notification({ id: "old", title: "Ancienne" })], 20));
    renderWithProviders(<NotificationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Charger plus" }));
    expect(await screen.findByText("Ancienne")).toBeTruthy();
    expect(list.mock.calls[1][0].query.before).toBe(page1[19].createdAt);
    expect(screen.queryByRole("button", { name: "Charger plus" })).toBeNull();
  });

  it("un échec de chargement propose de réessayer", async () => {
    list.mockRejectedValue(new Error("réseau"));
    renderWithProviders(<NotificationsPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Impossible de charger vos notifications.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });
});
