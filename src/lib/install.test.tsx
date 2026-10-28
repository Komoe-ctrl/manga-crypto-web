import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectPlatform, resetInstallForTests, startInstallCapture, useInstall } from "./install";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

describe("detectPlatform", () => {
  it("iPhone, Android, ordinateur", () => {
    expect(detectPlatform(IPHONE)).toBe("ios");
    expect(detectPlatform(ANDROID)).toBe("android");
    expect(detectPlatform(WINDOWS)).toBe("desktop");
    expect(detectPlatform(MAC, 0)).toBe("desktop");
  });
  it("un iPad récent se présente comme un Mac : on le reconnaît à son écran tactile", () => {
    expect(detectPlatform(MAC, 5)).toBe("ios");
    expect(detectPlatform(MAC, 1)).toBe("desktop"); // un seul point de contact : un Mac avec un pavé tactile
  });
  it("un agent utilisateur vide ou inconnu : ordinateur", () => {
    expect(detectPlatform("")).toBe("desktop");
    expect(detectPlatform("curl/8")).toBe("desktop");
  });
});

function Probe() {
  const { standalone, canPrompt, platform, prompt } = useInstall();
  return (
    <div>
      <span data-testid="state">{JSON.stringify({ standalone, canPrompt, platform })}</span>
      <button type="button" onClick={() => void prompt().then((o) => (document.body.dataset.outcome = String(o)))}>
        installer
      </button>
    </div>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent!) as { standalone: boolean; canPrompt: boolean; platform: string };

/** Un `beforeinstallprompt` comme Chrome l'envoie : annulable, avec `prompt()` et le choix de l'utilisateur. */
function promptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  event.prompt = vi.fn(async () => undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

let stop: (() => void) | undefined;
const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  resetInstallForTests();
  delete document.body.dataset.outcome;
  stop = startInstallCapture();
});
afterEach(() => {
  stop?.();
  window.matchMedia = originalMatchMedia;
  Reflect.deleteProperty(navigator, "standalone");
  vi.restoreAllMocks();
});

describe("useInstall : l'invite d'installation du navigateur", () => {
  it("au départ : rien à proposer, ordinateur, pas installée", () => {
    render(<Probe />);
    expect(state()).toEqual({ standalone: false, canPrompt: false, platform: "desktop" });
  });

  it("garde l'invite du navigateur (elle ne vient qu'une fois) et empêche l'affichage automatique", () => {
    render(<Probe />);
    const event = promptEvent();
    act(() => void window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true); // on la montrera dans les Réglages, pas au hasard d'une page
    expect(state().canPrompt).toBe(true);
  });

  it("l'invite arrivée AVANT l'ouverture de l'écran est retrouvée (capturée dès le départ)", () => {
    act(() => void window.dispatchEvent(promptEvent()));
    render(<Probe />); // l'écran des Réglages s'ouvre après
    expect(state().canPrompt).toBe(true);
  });

  it("installer : ouvre l'invite, rend le choix, et l'invite ne sert qu'une fois", async () => {
    render(<Probe />);
    const event = promptEvent("accepted");
    act(() => void window.dispatchEvent(event));

    await act(async () => {
      screen.getByRole("button", { name: "installer" }).click();
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(document.body.dataset.outcome).toBe("accepted");
    expect(state().canPrompt).toBe(false);

    await act(async () => {
      screen.getByRole("button", { name: "installer" }).click();
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(document.body.dataset.outcome).toBe("null"); // plus d'invite
  });

  it("l'utilisateur refuse : le choix est rendu tel quel", async () => {
    render(<Probe />);
    act(() => void window.dispatchEvent(promptEvent("dismissed")));
    await act(async () => {
      screen.getByRole("button", { name: "installer" }).click();
    });
    expect(document.body.dataset.outcome).toBe("dismissed");
  });

  it("sans invite : installer ne fait rien et le dit (null)", async () => {
    render(<Probe />);
    await act(async () => {
      screen.getByRole("button", { name: "installer" }).click();
    });
    expect(document.body.dataset.outcome).toBe("null");
  });

  it("une fois installée (événement appinstalled), l'invite disparaît", () => {
    render(<Probe />);
    act(() => void window.dispatchEvent(promptEvent()));
    expect(state().canPrompt).toBe(true);
    act(() => void window.dispatchEvent(new Event("appinstalled")));
    expect(state().canPrompt).toBe(false);
  });

  it("arrêter l'écoute retire bien les deux écouteurs", () => {
    render(<Probe />);
    stop?.();
    const event = promptEvent();
    act(() => void window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(state().canPrompt).toBe(false);
    stop = startInstallCapture(); // pour le nettoyage du test suivant
  });
});

describe("useInstall : déjà installée ?", () => {
  it("ouverte comme une application (display-mode: standalone)", () => {
    window.matchMedia = vi.fn((query: string) => ({ matches: query === "(display-mode: standalone)", media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList);
    render(<Probe />);
    expect(state().standalone).toBe(true);
  });

  it("sur iPhone, Safari le dit par navigator.standalone", () => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    render(<Probe />);
    expect(state().standalone).toBe(true);
  });

  it("dans un onglet ordinaire : non", () => {
    window.matchMedia = vi.fn((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList);
    render(<Probe />);
    expect(state().standalone).toBe(false);
  });

  it("la plateforme vient de l'agent utilisateur", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    render(<Probe />);
    expect(state().platform).toBe("ios");
  });
});
