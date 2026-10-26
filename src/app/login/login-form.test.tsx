import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginError } from "@/lib/auth/session-manager";
import type { AuthState } from "@/lib/auth/auth-provider";

const replace = vi.fn();
const login = vi.fn();
let authState: AuthState = { status: "anonymous" };

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ state: authState, login, logout: vi.fn() }) }));
// `@/lib/auth` configure le client HTTP à son importation : inutile (et indésirable) dans ce test de formulaire.
vi.mock("@/lib/auth", async () => {
  const { LoginError: Error_ } = await import("@/lib/auth/session-manager");
  return { LoginError: Error_ };
});

import { LoginForm } from "./login-form";

const fill = (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: password } });
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: /Se connecter|Connexion…/ }));

beforeEach(() => {
  replace.mockReset();
  login.mockReset();
  authState = { status: "anonymous" };
});

describe("LoginForm", () => {
  it("connecte avec l'adresse et le mot de passe saisis", async () => {
    login.mockResolvedValue(undefined);
    render(<LoginForm />);

    fill("a@example.com", "un-mot-de-passe");
    submit();

    await waitFor(() => expect(login).toHaveBeenCalledWith("a@example.com", "un-mot-de-passe"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuse une adresse invalide ou un mot de passe vide, sans appeler le serveur", async () => {
    render(<LoginForm />);

    fill("pas-une-adresse", "");
    submit();

    expect(await screen.findByText("Saisissez une adresse e-mail valide")).toBeTruthy();
    expect(screen.getByText("Saisissez votre mot de passe")).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Adresse e-mail").getAttribute("aria-invalid")).toBe("true");
  });

  it.each([
    ["invalid_credentials", "Adresse e-mail ou mot de passe incorrect."],
    ["rate_limited", "Trop de tentatives. Patientez une minute avant de réessayer."],
    ["unreachable", "Impossible de joindre le serveur. Vérifiez votre connexion."],
    ["unknown", "La connexion a échoué. Réessayez dans un instant."],
  ] as const)("échec « %s » : message clair dans une alerte", async (reason, message) => {
    login.mockRejectedValue(new LoginError(reason));
    render(<LoginForm />);

    fill("a@example.com", "x");
    submit();

    expect((await screen.findByRole("alert")).textContent).toBe(message);
  });

  it("une erreur inattendue donne le message générique, pas une page cassée", async () => {
    login.mockRejectedValue(new Error("boom"));
    render(<LoginForm />);
    fill("a@example.com", "x");
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain("La connexion a échoué");
  });

  it("l'ancien message disparaît à la tentative suivante", async () => {
    login.mockRejectedValueOnce(new LoginError("invalid_credentials")).mockResolvedValueOnce(undefined);
    render(<LoginForm />);

    fill("a@example.com", "mauvais");
    submit();
    await screen.findByRole("alert");

    fill("a@example.com", "bon");
    submit();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("ne révèle pas ce qui est faux : même message pour une adresse ou un mot de passe inconnus", async () => {
    login.mockRejectedValue(new LoginError("invalid_credentials"));
    render(<LoginForm />);
    fill("inconnu@example.com", "x");
    submit();
    expect((await screen.findByRole("alert")).textContent).not.toMatch(/adresse inconnue|compte introuvable|mot de passe seul/i);
  });

  it("le bouton est désactivé pendant l'envoi : pas de double soumission", async () => {
    let finish: () => void = () => undefined;
    login.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    render(<LoginForm />);

    fill("a@example.com", "x");
    submit();

    const button = await screen.findByRole("button", { name: "Connexion…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    finish();
    await waitFor(() => expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false));
    expect(login).toHaveBeenCalledTimes(1);
  });

  it("le mot de passe est masqué et le navigateur peut le mémoriser", () => {
    render(<LoginForm />);
    const password = screen.getByLabelText("Mot de passe") as HTMLInputElement;
    expect(password.type).toBe("password");
    expect(password.autocomplete).toBe("current-password");
    expect((screen.getByLabelText("Adresse e-mail") as HTMLInputElement).autocomplete).toBe("username");
  });

  it("déjà connecté : redirige vers le tableau de bord", () => {
    authState = { status: "authenticated", user: { id: "u1" } as never };
    render(<LoginForm />);
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("non connecté : ne redirige pas", () => {
    render(<LoginForm />);
    expect(replace).not.toHaveBeenCalled();
  });
});
