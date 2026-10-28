import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { AssetTrendDto, TrendsDto } from "@/lib/api/types.gen";
import { MASK } from "@/lib/format";
import { PrivacyProvider, resetPrivacyForTests, usePrivacy } from "@/lib/privacy";
import { asset } from "./fixtures";
import { PortfolioChart } from "./PortfolioChart";

const N = 42;
const ramp = (from: number, to: number) => Array.from({ length: N }, (_, i) => String(from + ((to - from) * i) / (N - 1)));
const trend = (symbol: string, sparkline: string[]): AssetTrendDto => ({ symbol, change24hPct: "0", change7dPct: "0", sparkline });
const trends = (assets: AssetTrendDto[]): TrendsDto => ({ market: { state: "CALM", btcChange24hPct: "0" }, assets, complete: true });
const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

const UP = trends([trend("BTC", ramp(100, 200))]); // la valeur double en 7 jours
const DOWN = trends([trend("BTC", ramp(200, 100))]);
const BTC = [asset({ symbol: "BTC", quantity: "1" })];

beforeEach(() => {
  window.localStorage.clear();
  resetPrivacyForTests();
});

const show = (props: Partial<React.ComponentProps<typeof PortfolioChart>> = {}) =>
  render(
    <PrivacyProvider>
      <PortfolioChart assets={BTC} trends={UP} status="ready" currency="USD" {...props} />
    </PrivacyProvider>,
  );
/** Un déplacement du pointeur avec sa position (jsdom ne garantit pas PointerEvent : un MouseEvent « pointermove » suffit à React). */
const move = (el: Element, clientX: number) => fireEvent(el, new MouseEvent("pointermove", { bubbles: true, clientX }));
const group = () => screen.getByRole("group", { name: "Valeur du portefeuille sur 7 jours" });
/** Donne au conteneur une largeur (jsdom ne fait aucune mise en page) pour que le survol sache où il est. */
const sized = (width = 600) => {
  const el = group();
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: 100, width, height: 100, x: 0, y: 0, toJSON: () => ({}) });
  return el;
};

describe("PortfolioChart : états", () => {
  it("en chargement : un emplacement décoratif, pas de texte d'erreur", () => {
    const { container } = show({ status: "loading", trends: undefined });
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByText(/indisponible/)).toBeNull();
  });

  it("tendances en échec : le dit", () => {
    show({ status: "unavailable", trends: undefined });
    expect(screen.getByText("La courbe de valeur est indisponible pour le moment.")).toBeTruthy();
  });

  it("trésorerie en USDT seule : explique pourquoi il n'y a pas de courbe", () => {
    show({ assets: [asset({ symbol: "USDT", quantity: "1000" })], trends: trends([]) });
    expect(screen.getByText(/ne contient que de la trésorerie en USDT/)).toBeTruthy();
  });
});

describe("PortfolioChart : lecture", () => {
  it("par défaut le dernier point : la valeur d'aujourd'hui, « maintenant »", () => {
    show();
    expect(plain(screen.getByText(/200,00/).textContent)).toContain("200,00");
    expect(screen.getByText("maintenant")).toBeTruthy();
  });

  it("affiche l'évolution de la période, en toutes lettres, et dit que c'est avec les positions actuelles", () => {
    show();
    expect(screen.getByText("Évolution sur 7 jours")).toBeTruthy();
    expect(plain(screen.getByText(/^\+100,00 %$/).textContent)).toBe("+100,00 %");
    expect(screen.getByText(/Avec vos positions actuelles/)).toBeTruthy();
  });

  it("une baisse : pourcentage négatif, courbe orangée (la couleur ne porte pas seule l'information)", () => {
    show({ trends: DOWN });
    expect(screen.getByText(/^−50,00 %$/).className).toContain("text-loss");
    expect(group().className).toContain("text-loss");
  });

  it("une hausse : courbe verte", () => {
    show();
    expect(group().className).toContain("text-gain");
  });

  it("le survol place le curseur : la valeur et l'ancienneté approximative du point", () => {
    show();
    move(sized(600), 0); // tout à gauche : il y a 7 jours
    // « 100,00 » apparaît aussi dans « +100,00 % » (l'évolution de la période) : la valeur lue commence par le chiffre.
    expect(plain(screen.getByText(/^100,00/).textContent)).toContain("100,00");
    expect(screen.getByText("≈ il y a 7 j")).toBeTruthy();
    expect(screen.queryByText("maintenant")).toBeNull();
  });

  it("quitter le survol revient au dernier point", () => {
    show();
    const el = sized(600);
    move(el, 0);
    fireEvent.pointerLeave(el);
    expect(screen.getByText("maintenant")).toBeTruthy();
  });

  it("au milieu : une valeur intermédiaire, environ 3 jours et demi", () => {
    show();
    move(sized(600), 300);
    expect(screen.getByText(/^≈ il y a \d j$/)).toBeTruthy();
  });

  it("sans largeur mesurable (zone repliée) : le survol ne fait rien, sans planter", () => {
    show();
    move(group(), 10);
    expect(screen.getByText("maintenant")).toBeTruthy();
  });

  it("au clavier : flèches, Début, Fin ; Tab hors du graphique rend la lecture", () => {
    show();
    const el = group();
    expect(el.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(el, { key: "Home" });
    expect(screen.getByText("≈ il y a 7 j")).toBeTruthy();
    fireEvent.keyDown(el, { key: "ArrowRight" });
    expect(screen.getByText(/^≈ il y a /)).toBeTruthy();
    fireEvent.keyDown(el, { key: "End" });
    expect(screen.getByText("maintenant")).toBeTruthy();
    fireEvent.keyDown(el, { key: "ArrowLeft" });
    expect(screen.queryByText("maintenant")).toBeNull();
    fireEvent.blur(el);
    expect(screen.getByText("maintenant")).toBeTruthy();
  });

  it("les flèches s'arrêtent aux extrémités, une autre touche ne fait rien", () => {
    show();
    const el = group();
    fireEvent.keyDown(el, { key: "ArrowRight" });
    expect(screen.getByText("maintenant")).toBeTruthy(); // déjà au dernier point
    fireEvent.keyDown(el, { key: "Home" });
    fireEvent.keyDown(el, { key: "ArrowLeft" });
    expect(screen.getByText("≈ il y a 7 j")).toBeTruthy();
    fireEvent.keyDown(el, { key: "a" });
    expect(screen.getByText("≈ il y a 7 j")).toBeTruthy();
  });

  it("la lecture est annoncée aux lecteurs d'écran à chaque déplacement", () => {
    show();
    expect(screen.getByText("maintenant").closest("p")!.getAttribute("aria-live")).toBe("polite");
  });
});

describe("PortfolioChart : honnêteté et confidentialité", () => {
  it("dit quels actifs manquent quand la courbe est partielle", () => {
    show({ assets: [...BTC, asset({ symbol: "ETH", quantity: "5" })] });
    expect(screen.getByText(/Sans ETH : courbe indisponible/)).toBeTruthy();
  });

  it("courbe complète : aucune mention « Sans »", () => {
    show();
    expect(screen.queryByText(/Sans /)).toBeNull();
  });

  it("le masquage des montants cache la valeur lue (pas le pourcentage ni l'ancienneté)", () => {
    function Hide() {
      const { toggle } = usePrivacy();
      return (
        <button type="button" onClick={toggle}>
          masquer
        </button>
      );
    }
    render(
      <PrivacyProvider>
        <Hide />
        <PortfolioChart assets={BTC} trends={UP} status="ready" currency="USD" />
      </PrivacyProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "masquer" }));
    expect(screen.getByText(MASK)).toBeTruthy();
    expect(screen.queryByText(/200,00/)).toBeNull();
    expect(screen.getByText("maintenant")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "masquer" }));
  });
});
