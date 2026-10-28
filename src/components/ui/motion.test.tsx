import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PrivacyProvider, resetPrivacyForTests, usePrivacy } from "@/lib/privacy";
import { CardLoading } from "./query-state";
import { Skeleton } from "./Skeleton";
import { Ticker } from "./Ticker";

beforeEach(() => {
  window.localStorage.clear();
  resetPrivacyForTests();
});

const view = (value: string | null | undefined) => (
  <PrivacyProvider>
    <Ticker value={value} className="chiffre">
      {String(value)}
    </Ticker>
  </PrivacyProvider>
);

describe("Ticker : un chiffre qui bouge se teinte doucement", () => {
  it("au premier affichage : aucune teinte", () => {
    const { container } = render(view("100"));
    const span = container.querySelector("span.chiffre")!;
    expect(span.className).not.toMatch(/tick-/);
    expect(span.getAttribute("data-tick")).toBeNull();
  });

  it("une hausse : teinte verte", () => {
    const { container, rerender } = render(view("100"));
    rerender(view("101.5"));
    const span = container.querySelector("span.chiffre")!;
    expect(span.className).toContain("tick-up");
    expect(span.getAttribute("data-tick")).toBe("up");
    expect(span.textContent).toBe("101.5");
  });

  it("une baisse : teinte orangée", () => {
    const { container, rerender } = render(view("100"));
    rerender(view("99"));
    expect(container.querySelector("span.chiffre")!.getAttribute("data-tick")).toBe("down");
  });

  it("une valeur inchangée : rien, et on garde le même élément", () => {
    const { container, rerender } = render(view("100"));
    const before = container.querySelector("span.chiffre");
    rerender(view("100"));
    expect(container.querySelector("span.chiffre")).toBe(before);
    expect(before!.getAttribute("data-tick")).toBeNull();
  });

  it("chaque nouvelle variation relance l'animation (nouvel élément) ", () => {
    const { container, rerender } = render(view("100"));
    rerender(view("101"));
    const first = container.querySelector("span.chiffre");
    rerender(view("102"));
    expect(container.querySelector("span.chiffre")).not.toBe(first);
    expect(container.querySelector("span.chiffre")!.getAttribute("data-tick")).toBe("up");
  });

  it("passer d'une valeur absente à une valeur, ou l'inverse : pas de teinte (rien à comparer)", () => {
    const { container, rerender } = render(view(null));
    rerender(view("100"));
    expect(container.querySelector("span.chiffre")!.getAttribute("data-tick")).toBeNull();
    rerender(view(undefined));
    expect(container.querySelector("span.chiffre")!.getAttribute("data-tick")).toBeNull();
  });

  it("une valeur qui n'est pas un nombre ne teinte pas", () => {
    const { container, rerender } = render(view("abc"));
    rerender(view("def"));
    expect(container.querySelector("span.chiffre")!.getAttribute("data-tick")).toBeNull();
  });

  it("montants masqués : aucune teinte (elle révélerait le sens de la variation)", () => {
    function Hide() {
      const { toggle } = usePrivacy();
      return (
        <button type="button" onClick={toggle}>
          masquer
        </button>
      );
    }
    const ui = (value: string) => (
      <PrivacyProvider>
        <Hide />
        <Ticker value={value} className="chiffre">
          {value}
        </Ticker>
      </PrivacyProvider>
    );
    const { container, rerender } = render(ui("100"));
    fireEvent.click(screen.getByRole("button", { name: "masquer" }));
    rerender(ui("150"));
    expect(container.querySelector("span.chiffre")!.className).not.toMatch(/tick-/);
    act(() => fireEvent.click(screen.getByRole("button", { name: "masquer" }))); // rétablit la préférence
  });
});

describe("Skeleton et CardLoading", () => {
  it("le squelette respire lentement et s'arrête pour qui demande moins de mouvement", () => {
    const { container } = render(<Skeleton className="h-5" />);
    expect(container.firstElementChild!.className).toContain("animate-pulse");
    expect(container.firstElementChild!.className).toContain("motion-reduce:animate-none");
  });

  it("CardLoading : annoncé comme occupé par son texte, les blocs sont décoratifs", () => {
    const { container } = render(<CardLoading>Chargement de vos ordres…</CardLoading>);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.getByText("Chargement de vos ordres…").className).toContain("sr-only");
    const blocks = container.querySelectorAll("[aria-hidden='true']");
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });
});
