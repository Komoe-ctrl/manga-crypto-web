import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NARROW, useMediaQuery } from "./use-media-query";

function Probe({ query = NARROW }: { query?: string }) {
  return <span data-testid="probe">{String(useMediaQuery(query))}</span>;
}

/** Faux `matchMedia` : une requête qui correspond ou non, et qui sait prévenir quand la fenêtre change. */
function installMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  window.matchMedia = vi.fn((query: string) => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    } as unknown as MediaQueryList;
  });
  return {
    queries,
    listeners,
    set: (next: boolean) => {
      matches = next;
      listeners.forEach((l) => l());
    },
  };
}

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

describe("useMediaQuery", () => {
  it("sans matchMedia (certains tests, vieux navigateurs) : faux, sans planter", () => {
    window.matchMedia = undefined as never;
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("false");
  });

  it("vrai quand la requête correspond, faux sinon", () => {
    installMatchMedia(true);
    const { unmount } = render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("true");
    unmount();
    installMatchMedia(false);
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("false");
  });

  it("interroge la requête demandée, et le téléphone est « moins de 768 px » (le point de rupture md de Tailwind)", () => {
    const media = installMatchMedia(false);
    render(<Probe />);
    expect(media.queries).toContain("(max-width: 767px)");
    expect(NARROW).toBe("(max-width: 767px)");
  });

  it("se met à jour quand la fenêtre change (rotation du téléphone)", () => {
    const media = installMatchMedia(false);
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("false");
    act(() => media.set(true));
    expect(screen.getByTestId("probe").textContent).toBe("true");
    act(() => media.set(false));
    expect(screen.getByTestId("probe").textContent).toBe("false");
  });

  it("arrête d'écouter quand le composant disparaît", () => {
    const media = installMatchMedia(true);
    const { unmount } = render(<Probe />);
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
