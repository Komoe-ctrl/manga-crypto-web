import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrendsDto } from "@/lib/api/types.gen";
import { MASK } from "@/lib/format";
import { PrivacyProvider, resetPrivacyForTests, usePrivacy } from "@/lib/privacy";
import { AllocationDonut } from "./AllocationDonut";
import { AssetCards } from "./AssetCards";
import { AssetsTable } from "./AssetsTable";
import { WalletHeader } from "./WalletHeader";
import { SAMPLE, asset, portfolio } from "./fixtures";

const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");
const trends: TrendsDto = {
  market: { state: "CALM", btcChange24hPct: "0.1" },
  complete: true,
  assets: [
    { symbol: "BTC", change24hPct: "2.5", change7dPct: "8.1", sparkline: ["1", "2", "3"] },
    { symbol: "ETH", change24hPct: "-3.25", change7dPct: "-1.5", sparkline: ["3", "2", "1"] },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  resetPrivacyForTests();
});

describe("AllocationDonut : la répartition en anneau", () => {
  it("un anneau nommé avec toutes les parts, et une légende en toutes lettres", () => {
    render(<AllocationDonut assets={SAMPLE.assets} />);
    const ring = screen.getByRole("img");
    expect(ring.getAttribute("aria-label")).toMatch(/^Répartition du portefeuille : BTC 73 %, ETH 27 %, LINK 8 %/);
    const legend = screen.getByRole("list");
    expect(within(legend).getAllByRole("listitem")).toHaveLength(SAMPLE.assets.length);
    expect(plain(legend.textContent)).toContain("BTC 73 %");
  });

  it("la légende va du plus gros au plus petit", () => {
    render(<AllocationDonut assets={SAMPLE.assets} />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent?.split(" ")[0])).toEqual(["BTC", "ETH", "LINK", "USDC"]);
    expect(plain(items[0].textContent)).toContain("73 %");
  });

  it("un arc par actif, le plus gros d'abord, et le nombre d'actifs au centre", () => {
    const { container } = render(<AllocationDonut assets={SAMPLE.assets} />);
    const arcs = container.querySelectorAll("circle[stroke-dasharray]");
    expect(arcs).toHaveLength(SAMPLE.assets.length);
    const lengths = [...arcs].map((c) => Number(c.getAttribute("stroke-dasharray")!.split(" ")[0]));
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("actifs")).toBeTruthy();
  });

  it("un seul actif : « actif » au singulier et un cercle plein", () => {
    const { container } = render(<AllocationDonut assets={[asset({ symbol: "BTC", weightPct: "100" })]} />);
    expect(screen.getByText("actif")).toBeTruthy();
    const [length, rest] = container.querySelector("circle[stroke-dasharray]")!.getAttribute("stroke-dasharray")!.split(" ").map(Number);
    expect(rest).toBeCloseTo(0, 5);
    expect(length).toBeGreaterThan(300);
  });

  it("rien si aucune position n'est valorisée", () => {
    const { container } = render(<AllocationDonut assets={[asset({ symbol: "X", weightPct: null })]} />);
    expect(container.firstChild).toBeNull();
    expect(render(<AllocationDonut assets={[]} />).container.firstChild).toBeNull();
  });
});

describe("WalletHeader : la carte principale", () => {
  it("montre l'anneau de répartition et la courbe passée en emplacement", () => {
    render(<WalletHeader portfolio={SAMPLE} chart={<div data-testid="courbe">courbe</div>} />);
    expect(screen.getByRole("img", { name: /Répartition du portefeuille/ })).toBeTruthy();
    expect(screen.getByTestId("courbe")).toBeTruthy();
  });

  it("sans courbe : pas d'emplacement vide", () => {
    render(<WalletHeader portfolio={SAMPLE} />);
    expect(screen.queryByTestId("courbe")).toBeNull();
  });

  it("le résultat a son sens écrit ET montré : signe, couleur et flèche", () => {
    const { container, rerender } = render(<WalletHeader portfolio={SAMPLE} />);
    const pill = screen.getByText(/depuis l’achat/).previousElementSibling!;
    expect(pill.className).toContain("text-gain");
    expect(pill.querySelector("svg")).not.toBeNull();
    expect(plain(pill.textContent)).toMatch(/^\+20,13 %/);

    rerender(<WalletHeader portfolio={portfolio({ totalPnl: "-120", totalPnlPct: "-3", totalValue: "100" })} />);
    const loss = screen.getByText(/depuis l’achat/).previousElementSibling!;
    expect(loss.className).toContain("text-loss");
    expect(plain(loss.textContent)).toMatch(/^−3,00 %/);
    expect(container.querySelector("[data-testid='wallet-total']")).not.toBeNull();
  });

  it("un résultat nul : ni couleur de gain ni flèche", () => {
    render(<WalletHeader portfolio={portfolio({ totalPnl: "0", totalPnlPct: "0", totalValue: "100" })} />);
    const pill = screen.getByText(/depuis l’achat/).previousElementSibling!;
    expect(pill.className).not.toContain("text-gain");
    expect(pill.className).not.toContain("text-loss");
    expect(pill.querySelector("svg")).toBeNull();
  });

  it("le total se teinte quand il change (prix en direct), sauf montants masqués", () => {
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
        <WalletHeader portfolio={portfolio({ totalValue: value, assets: SAMPLE.assets })} />
      </PrivacyProvider>
    );
    const { rerender } = render(ui("1000"));
    rerender(ui("1100"));
    expect(screen.getByTestId("wallet-total").querySelector("[data-tick='up']")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "masquer" }));
    rerender(ui("900"));
    expect(screen.getByTestId("wallet-total").querySelector("[data-tick]")).toBeNull();
    expect(screen.getByTestId("wallet-total").textContent).toContain(MASK);
    fireEvent.click(screen.getByRole("button", { name: "masquer" }));
  });
});

describe("AssetCards : les positions sur téléphone", () => {
  const show = (props: Partial<React.ComponentProps<typeof AssetCards>> = {}) =>
    render(
      <PrivacyProvider>
        <AssetCards assets={SAMPLE.assets} currency="USD" trends={trends} {...props} />
      </PrivacyProvider>,
    );

  it("une carte par actif, nommée, avec sa valeur, son résultat, sa quantité et sa part", () => {
    show();
    const cards = within(screen.getByRole("list", { name: "Mes actifs" })).getAllByRole("listitem");
    expect(cards).toHaveLength(SAMPLE.assets.length);
    const btc = cards.find((c) => c.textContent?.includes("BTC"))!;
    expect(plain(btc.textContent)).toContain("56 624,50"); // la valeur
    expect(plain(btc.textContent)).toMatch(/\+12 756,30/); // le résultat
    expect(plain(btc.textContent)).toContain("0,842 BTC"); // la quantité
    expect(plain(btc.textContent)).toContain("73 % du portefeuille");
  });

  it("la variation 24 h a son signe, sa couleur et sa flèche, et est lisible à voix haute", () => {
    show();
    const eth = screen.getAllByRole("listitem").find((c) => c.textContent?.includes("ETH"))!;
    const change = within(eth).getByText("−3,25 %");
    expect(change.className).toContain("text-loss");
    expect(change.querySelector("svg")).not.toBeNull();
    expect(within(eth).getByText(/sur 24 h/).className).toContain("sr-only");
  });

  it("la courbe est nommée ; sans tendance, pas de courbe ni de variation", () => {
    show();
    expect(screen.getByRole("img", { name: "BTC sur 7 jours : +8,10 %" })).toBeTruthy();
    const link = screen.getAllByRole("listitem").find((c) => c.textContent?.includes("LINK"))!;
    expect(within(link).queryByRole("img")).toBeNull();
    expect(within(link).queryByText(/%$/)?.textContent ?? "").not.toMatch(/24/);
  });

  it("le nom est un bouton qui ouvre la fiche, le crayon corrige la position", () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    show({ onOpen, onEdit });
    fireEvent.click(screen.getByRole("button", { name: "Voir le détail de ETH" }));
    fireEvent.click(screen.getByRole("button", { name: "Modifier la position BTC" }));
    expect(onOpen).toHaveBeenCalledWith("ETH");
    expect(onEdit).toHaveBeenCalledWith("BTC");
  });

  it("sans rappels : lecture seule, aucun bouton", () => {
    show();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("le masquage cache valeur, résultat et quantité", () => {
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
        <AssetCards assets={SAMPLE.assets} currency="USD" trends={trends} />
      </PrivacyProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "masquer" }));
    const btc = screen.getAllByRole("listitem").find((c) => c.textContent?.includes("BTC"))!;
    expect(plain(btc.textContent)).toContain(MASK);
    expect(plain(btc.textContent)).not.toMatch(/56 624|12 756|0,842/);
    fireEvent.click(screen.getByRole("button", { name: "masquer" }));
  });
});

describe("AssetsTable : tableau sur ordinateur, cartes sur téléphone", () => {
  const original = window.matchMedia;
  const useNarrow = (narrow: boolean) => {
    window.matchMedia = vi.fn(
      (query: string) =>
        ({ matches: narrow, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList,
    );
  };
  afterEach(() => {
    window.matchMedia = original;
  });

  it("large : le tableau, pas de cartes", () => {
    useNarrow(false);
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" trends={trends} />);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Mes actifs" })).toBeNull();
  });

  it("étroit : les cartes, pas de tableau qui défile, et les mêmes actions", () => {
    useNarrow(true);
    const onOpen = vi.fn();
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" trends={trends} onOpen={onOpen} onEdit={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(SAMPLE.assets.length);
    fireEvent.click(screen.getByRole("button", { name: "Voir le détail de BTC" }));
    expect(onOpen).toHaveBeenCalledWith("BTC");
    expect(screen.getByRole("button", { name: "Déclarer une opération" })).toBeTruthy();
  });

  it("étroit : le filtre s'applique aussi aux cartes", () => {
    useNarrow(true);
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" />);
    fireEvent.click(screen.getByRole("button", { name: "En perte" }));
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(1); // seul LINK est en perte
    expect(cards[0].textContent).toContain("LINK");
  });

  it("étroit, portefeuille vide : l'écran d'accueil et son bouton, pas de liste vide", () => {
    useNarrow(true);
    render(<AssetsTable assets={[]} currency="USD" onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Ajouter mon premier actif" })).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("large : la variation 24 h a sa flèche et son signe, la couleur ne porte pas seule le sens", () => {
    useNarrow(false);
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" trends={trends} />);
    const eth = screen.getAllByRole("row").find((r) => r.textContent?.includes("ETH"))!;
    const change = within(eth).getByText("−3,25 %");
    expect(change.className).toContain("text-loss");
    expect(change.querySelector("svg")).not.toBeNull();
  });
});
