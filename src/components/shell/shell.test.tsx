import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "@/lib/auth/auth-provider";
import type { RealtimeStatus } from "@/lib/realtime/realtime-connection";

const replace = vi.fn();
const logout = vi.fn();
let authState: AuthState = { status: "loading" };
let realtime: RealtimeStatus = "idle";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ state: authState, login: vi.fn(), logout }) }));
vi.mock("@/lib/realtime/realtime-provider", () => ({ useRealtimeStatus: () => realtime }));
vi.mock("./AppNav", () => ({ AppNav: () => null }));
vi.mock("@/components/notifications/NotificationBell", () => ({ NotificationBell: () => null }));

import { PrivacyProvider, resetPrivacyForTests } from "@/lib/privacy";
import { AppHeader } from "./AppHeader";
import { RequireAuth } from "./RequireAuth";

const user = { id: "u1", email: "client@example.com" } as never;

beforeEach(() => {
  replace.mockReset();
  logout.mockReset();
  authState = { status: "loading" };
  realtime = "idle";
  window.localStorage.clear();
  resetPrivacyForTests();
});

describe("RequireAuth", () => {
  it("pendant la vérification du cookie, n'affiche rien de protégé", () => {
    render(
      <RequireAuth>
        <p>secret</p>
      </RequireAuth>,
    );
    expect(screen.queryByText("secret")).toBeNull();
    expect(screen.getByText("Chargement…")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled(); // pas de redirection tant qu'on ne sait pas
  });

  it("sans session : renvoie vers la connexion et n'affiche rien de protégé", () => {
    authState = { status: "anonymous" };
    render(
      <RequireAuth>
        <p>secret</p>
      </RequireAuth>,
    );
    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("connecté : affiche la page, sans redirection", () => {
    authState = { status: "authenticated", user };
    render(
      <RequireAuth>
        <p>secret</p>
      </RequireAuth>,
    );
    expect(screen.getByText("secret")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("AppHeader", () => {
  const renderHeader = () =>
    render(
      <PrivacyProvider>
        <AppHeader />
      </PrivacyProvider>,
    );

  it("affiche l'identité de l'utilisateur et permet de se déconnecter", () => {
    authState = { status: "authenticated", user };
    renderHeader();
    expect(screen.getByText("client@example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Se déconnecter/ }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("l'œil masque puis réaffiche les montants, avec un libellé qui suit l'état", () => {
    authState = { status: "authenticated", user };
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Masquer les montants" }));
    expect(screen.getByRole("button", { name: "Afficher les montants" })).toBeTruthy();
  });

  it.each([
    ["open", "En direct"],
    ["connecting", "Connexion…"],
    ["reconnecting", "Reconnexion…"],
  ] as const)("état du direct « %s » : affiché comme « %s »", (status, label) => {
    authState = { status: "authenticated", user };
    realtime = status;
    renderHeader();
    expect(screen.getByRole("status").textContent).toBe(label);
  });

  it("direct inactif : rien à afficher", () => {
    authState = { status: "authenticated", user };
    renderHeader();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
