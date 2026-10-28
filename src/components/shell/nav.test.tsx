import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
let unread = 0;
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/queries/digests", () => ({ useUnreadDigests: () => unread }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AppNav } from "./AppNav";

beforeEach(() => {
  pathname = "/";
  unread = 0;
});

describe("AppNav", () => {
  it("propose les quatre pages, vers les bonnes adresses", () => {
    render(<AppNav />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => [l.getAttribute("aria-label") ?? l.textContent?.trim(), l.getAttribute("href")])).toEqual([
      ["Tableau de bord", "/"],
      ["Alertes", "/alertes"],
      ["Rapports", "/rapports"],
      ["Réglages", "/reglages"],
    ]);
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeTruthy();
  });

  it.each([
    ["/", "Tableau de bord"],
    ["/rapports", "Rapports"],
    ["/reglages", "Réglages"],
  ])("sur %s, seule la page « %s » est annoncée comme courante", (path, label) => {
    pathname = path;
    render(<AppNav />);
    const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.getAttribute("aria-label") ?? l.textContent?.trim())).toEqual([label]);
  });

  it("le tableau de bord n'est pas « courant » sur les autres pages (« / » est le début de toutes les adresses)", () => {
    pathname = "/rapports";
    render(<AppNav />);
    expect(screen.getByRole("link", { name: "Tableau de bord" }).getAttribute("aria-current")).toBeNull();
  });

  it("une pastille et un texte pour lecteur d'écran signalent les rapports non lus", () => {
    unread = 2;
    render(<AppNav />);
    expect(screen.getByRole("link", { name: /Rapports/ }).textContent).toContain("2 non lus");
  });

  it("singulier pour un seul rapport non lu, aucune pastille quand tout est lu", () => {
    unread = 1;
    const { unmount } = render(<AppNav />);
    expect(screen.getByRole("link", { name: /Rapports/ }).textContent).toContain("1 non lu");
    expect(screen.getByRole("link", { name: /Rapports/ }).textContent).not.toContain("non lus");
    unmount();

    unread = 0;
    render(<AppNav />);
    expect(screen.getByRole("link", { name: /Rapports/ }).textContent).not.toContain("non lu");
  });

  it("les autres liens n'ont jamais de pastille", () => {
    unread = 3;
    render(<AppNav />);
    expect(screen.getByRole("link", { name: "Réglages" }).textContent?.trim()).toBe("Réglages");
  });
});

describe("AppNav : variante du haut (ordinateur)", () => {
  it("les liens restent sur une ligne, chacun avec une icône décorative", () => {
    render(<AppNav variant="top" />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("whitespace-nowrap");
      const icon = link.querySelector("svg");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("affiche le libellé complet « Tableau de bord »", () => {
    render(<AppNav variant="top" />);
    expect(screen.getByRole("link", { name: "Tableau de bord" }).textContent).toBe("Tableau de bord");
  });
});

describe("AppNav : variante du bas (téléphone)", () => {
  it("est fixée en bas de l'écran, avec une icône par lien", () => {
    render(<AppNav variant="bottom" />);
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    expect(nav.className).toContain("fixed");
    expect(nav.className).toContain("bottom-0");
    expect(nav.className).toContain("safe-area-inset-bottom");
    for (const link of screen.getAllByRole("link")) expect(link.querySelector("svg")).not.toBeNull();
  });

  it("le nom accessible reste « Tableau de bord » ; « Accueil » n'est qu'un affichage court, caché aux lecteurs d'écran", () => {
    render(<AppNav variant="bottom" />);
    const home = screen.getByRole("link", { name: "Tableau de bord" });
    expect(home.getAttribute("aria-label")).toBe("Tableau de bord");
    const shown = [...home.querySelectorAll("span")].find((span) => span.textContent === "Accueil");
    expect(shown?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("link", { name: "Accueil" })).toBeNull();
  });

  it("signale les rapports non lus", () => {
    unread = 2;
    render(<AppNav variant="bottom" />);
    expect(screen.getByRole("link", { name: /Rapports/ }).textContent).toContain("2 non lus");
  });
});
