import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PrivacyProvider, resetPrivacyForTests, usePrivacy } from "@/lib/privacy";
import { AllocationBar } from "./AllocationBar";
import { AssetsTable } from "./AssetsTable";
import { WalletHeader } from "./WalletHeader";
import { filterAssets, sortByValue } from "./asset-sort";
import { SAMPLE, asset, portfolio } from "./fixtures";

const plain = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

function Toggle() {
  const { toggle, hidden } = usePrivacy();
  return (
    <button type="button" onClick={toggle}>
      {hidden ? "afficher" : "masquer"}
    </button>
  );
}

const withPrivacy = (ui: React.ReactNode) =>
  render(
    <PrivacyProvider>
      <Toggle />
      {ui}
    </PrivacyProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  resetPrivacyForTests();
});

describe("sortByValue et filterAssets", () => {
  it("trie par valeur décroissante, les positions non valorisées en dernier", () => {
    const sorted = sortByValue([
      asset({ symbol: "AAA", value: null }),
      asset({ symbol: "SMALL", value: "10" }),
      asset({ symbol: "BIG", value: "1000" }),
      asset({ symbol: "ZZZ", value: null }),
    ]);
    expect(sorted.map((a) => a.symbol)).toEqual(["BIG", "SMALL", "AAA", "ZZZ"]);
  });

  it("à valeur égale, l'ordre alphabétique départage (affichage stable)", () => {
    expect(sortByValue([asset({ symbol: "B", value: "5" }), asset({ symbol: "A", value: "5" })]).map((a) => a.symbol)).toEqual(["A", "B"]);
  });

  it("ne modifie pas la liste d'origine", () => {
    const input = [asset({ symbol: "A", value: "1" }), asset({ symbol: "B", value: "2" })];
    sortByValue(input);
    expect(input.map((a) => a.symbol)).toEqual(["A", "B"]);
  });

  it("les filtres « en gain » et « en perte » ignorent l'équilibre et les non valorisées", () => {
    const assets = [
      asset({ symbol: "UP", pnl: "50" }),
      asset({ symbol: "DOWN", pnl: "-50" }),
      asset({ symbol: "FLAT", pnl: "0.005" }),
      asset({ symbol: "NONE", pnl: null }),
    ];
    expect(filterAssets(assets, "gain").map((a) => a.symbol)).toEqual(["UP"]);
    expect(filterAssets(assets, "loss").map((a) => a.symbol)).toEqual(["DOWN"]);
    expect(filterAssets(assets, "all")).toHaveLength(4);
  });
});

describe("WalletHeader", () => {
  it("affiche la valeur totale, le résultat et le nombre d'actifs", () => {
    render(<WalletHeader portfolio={SAMPLE} />);
    expect(plain(screen.getByTestId("wallet-total").textContent)).toBe("88 032,70 $US");
    expect(plain(document.body.textContent)).toContain("+20,13 %");
    expect(plain(document.body.textContent)).toContain("+14 749,50 $US");
    expect(screen.getByText("depuis l’achat")).toBeTruthy();
  });

  it("un gain est vert, une perte orange (jetons du thème, pas de couleur en dur)", () => {
    const { container, rerender } = render(<WalletHeader portfolio={SAMPLE} />);
    expect(container.querySelector(".text-gain")).not.toBeNull();

    rerender(<WalletHeader portfolio={portfolio({ ...SAMPLE, totalPnl: "-500", totalPnlPct: "-3" })} />);
    expect(container.querySelector(".text-loss")).not.toBeNull();
  });

  it("prévient quand un prix manque : les totaux sont partiels", () => {
    const { rerender } = render(<WalletHeader portfolio={SAMPLE} />);
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<WalletHeader portfolio={portfolio({ ...SAMPLE, complete: false })} />);
    expect(screen.getByRole("status").textContent).toContain("totaux sont partiels");
  });

  it("masque tous les montants, et seulement eux, quand l'affichage est masqué", () => {
    withPrivacy(<WalletHeader portfolio={SAMPLE} />);
    fireEvent.click(screen.getByRole("button", { name: "masquer" }));

    expect(screen.getByTestId("wallet-total").textContent).toBe("•••••");
    expect(plain(document.body.textContent)).not.toContain("88 032");
    expect(plain(document.body.textContent)).not.toContain("14 749");
    expect(plain(document.body.textContent)).toContain("+20,13 %"); // le pourcentage n'est pas un montant
  });
});

describe("AllocationBar", () => {
  it("affiche une légende par actif, du plus gros au plus petit", () => {
    render(<AllocationBar assets={SAMPLE.assets} />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent?.split(" ")[0])).toEqual(["BTC", "ETH", "LINK", "USDC"]);
    expect(plain(items[0].textContent)).toContain("73 %");
  });

  it("n'affiche rien quand aucune position n'a de poids", () => {
    const { container } = render(<AllocationBar assets={[asset({ symbol: "X", weightPct: null })]} />);
    expect(container.firstChild).toBeNull();
  });

  it("n'affiche rien pour un portefeuille vide", () => {
    const { container } = render(<AllocationBar assets={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("AssetsTable", () => {
  const rowsText = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[0].textContent);

  it("liste les positions triées par valeur", () => {
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" />);
    expect(rowsText()).toEqual(["BTCBTC", "ETHETH", "LILINK", "USUSDC"]);
    expect(screen.getByText(/4 actifs · triés par valeur/)).toBeTruthy();
  });

  it("affiche prix, valeur, résultat et part de chaque actif", () => {
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" />);
    const btc = screen.getAllByRole("row")[1];
    const text = plain(btc.textContent);
    expect(text).toContain("0,842"); // quantité
    expect(text).toContain("67 250,00 $US"); // prix
    expect(text).toContain("56 624,50 $US"); // valeur
    expect(text).toContain("+12 756,30 $US"); // P&L
    expect(text).toContain("+29,08 %");
    expect(text).toContain("73 %"); // part
  });

  it("filtre « En gain » puis « En perte »", () => {
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" />);

    fireEvent.click(screen.getByRole("button", { name: "En gain" }));
    expect(rowsText()).toEqual(["BTCBTC", "ETHETH"]);
    expect(screen.getByRole("button", { name: "En gain" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "En perte" }));
    expect(rowsText()).toEqual(["LILINK"]);
    expect(screen.getByText(/1 actif · triés/)).toBeTruthy(); // singulier

    fireEvent.click(screen.getByRole("button", { name: "Tous" }));
    expect(rowsText()).toHaveLength(4);
  });

  it("un filtre sans résultat l'explique au lieu d'afficher un tableau vide", () => {
    render(<AssetsTable assets={[asset({ symbol: "BTC", pnl: "10" })]} currency="USD" />);
    fireEvent.click(screen.getByRole("button", { name: "En perte" }));
    expect(screen.getByText("Aucun actif ne correspond à ce filtre.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("un portefeuille vide invite à déclarer des positions", () => {
    render(<AssetsTable assets={[]} currency="USD" />);
    expect(screen.getByText(/Aucune position pour l’instant/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("une position sans prix s'affiche « — » et non « 0 » ou « NaN »", () => {
    render(
      <AssetsTable
        assets={[asset({ symbol: "ODD", currentPrice: null, value: null, pnl: null, pnlPct: null, weightPct: null })]}
        currency="USD"
      />,
    );
    const text = screen.getAllByRole("row")[1].textContent ?? "";
    expect(text).not.toContain("NaN");
    expect(text.match(/—/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("masque quantités, valeurs et résultats, mais pas les prix du marché", () => {
    withPrivacy(<AssetsTable assets={SAMPLE.assets} currency="USD" />);
    fireEvent.click(screen.getByRole("button", { name: "masquer" }));

    const text = plain(screen.getAllByRole("row")[1].textContent);
    expect(text).not.toContain("0,842");
    expect(text).not.toContain("56 624");
    expect(text).not.toContain("12 756");
    expect(text).toContain("•••••");
    expect(text).toContain("67 250,00 $US"); // le prix du BTC est public
  });

  it("le tableau est accessible : intitulés de colonnes et titre de section", () => {
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" />);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Actif", "Quantité", "Prix", "24 h", "7 jours", "Valeur", "P&L", "Part"]);
    expect(screen.getByRole("heading", { name: "Mes actifs" })).toBeTruthy();
  });
});
