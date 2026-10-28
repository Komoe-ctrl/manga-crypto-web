import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetInstallForTests, startInstallCapture } from "@/lib/install";
import { renderWithProviders } from "@/test-utils";
import { InstallCard } from "./InstallCard";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

let stop: (() => void) | undefined;
const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  resetInstallForTests();
  stop = startInstallCapture();
});
afterEach(() => {
  stop?.();
  window.matchMedia = originalMatchMedia;
  Reflect.deleteProperty(navigator, "standalone");
  vi.restoreAllMocks();
});

const as = (userAgent: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);

function promptEvent(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  event.prompt = vi.fn(async () => undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe("InstallCard : l'aide à l'installation sur téléphone", () => {
  it("iPhone : le geste Safari, et pourquoi c'est aussi nécessaire pour les alertes", () => {
    as(IPHONE);
    renderWithProviders(<InstallCard />);
    expect(screen.getByRole("heading", { name: "Application sur téléphone" })).toBeTruthy();
    expect(screen.getByText(/Dans Safari : touchez Partager, puis « Sur l’écran d’accueil »/)).toBeTruthy();
    expect(screen.getByText(/recevoir les alertes \(iOS 16\.4 ou plus récent\)/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull(); // Safari n'a pas d'invite : on explique, on ne simule pas un bouton
  });

  it("Android : le menu de Chrome", () => {
    as(ANDROID);
    renderWithProviders(<InstallCard />);
    expect(screen.getByText(/Dans Chrome : ouvrez le menu/)).toBeTruthy();
  });

  it("ordinateur : l'icône de la barre d'adresse", () => {
    as(WINDOWS);
    renderWithProviders(<InstallCard />);
    expect(screen.getByText(/l’icône d’installation, à droite de la barre d’adresse/)).toBeTruthy();
  });

  it("déjà installée : le dit, sans instructions ni bouton", () => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    renderWithProviders(<InstallCard />);
    expect(screen.getByText("Veille est installée sur cet appareil.")).toBeTruthy();
    expect(screen.queryByText(/Dans Safari|Dans Chrome/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("le navigateur propose l'installation : un bouton, qui ouvre son invite et confirme", async () => {
    as(WINDOWS);
    renderWithProviders(<InstallCard />);
    expect(screen.queryByRole("button", { name: "Installer l’application" })).toBeNull();

    const event = promptEvent("accepted");
    act(() => void window.dispatchEvent(event));
    fireEvent.click(await screen.findByRole("button", { name: "Installer l’application" }));

    await waitFor(() => expect(event.prompt).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole("status")).textContent).toBe("Veille est en cours d’installation.");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Installer l’application" })).toBeNull()); // l'invite ne sert qu'une fois
  });

  it("l'utilisateur refuse l'invite : pas de message de réussite, le texte d'aide reste", async () => {
    as(WINDOWS);
    renderWithProviders(<InstallCard />);
    const event = promptEvent("dismissed");
    act(() => void window.dispatchEvent(event));
    fireEvent.click(await screen.findByRole("button", { name: "Installer l’application" }));

    await waitFor(() => expect(event.prompt).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/icône d’installation/)).toBeTruthy();
  });
});
