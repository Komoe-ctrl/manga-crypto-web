import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { AssetTrendDto, TrendsDto } from "@/lib/api/types.gen";
import { PrivacyProvider, resetPrivacyForTests } from "@/lib/privacy";
import { marketState, trendOf } from "@/lib/queries/trends";
import { Sparkline, sparklinePoints, sparklineTrend } from "@/components/ui/Sparkline";
import { AssetsTable } from "./AssetsTable";
import { WalletHeader } from "./WalletHeader";
import { SAMPLE, portfolio } from "./fixtures";

const trend = (over: Partial<AssetTrendDto> & Pick<AssetTrendDto, "symbol">): AssetTrendDto => ({
  change24hPct: "1.5",
  change7dPct: "-4.2",
  sparkline: ["10", "11", "9", "12"],
  ...over,
});
const trends = (over: Partial<TrendsDto> = {}): TrendsDto => ({
  market: { state: "CALM", btcChange24hPct: "-1.01" },
  assets: [],
  complete: true,
  ...over,
});

beforeEach(() => {
  window.localStorage.clear();
  resetPrivacyForTests();
});

describe("sparklinePoints", () => {
  it("trace de gauche à droite, le plus haut en haut", () => {
    const points = sparklinePoints(["1", "3", "2"], 100, 40)!.split(" ");
    expect(points).toHaveLength(3);
    const [first, middle, last] = points.map((p) => p.split(",").map(Number));
    expect(first[0]).toBeLessThan(middle[0]);
    expect(middle[0]).toBeLessThan(last[0]);
    expect(middle[1]).toBeLessThan(first[1]); // 3 est plus haut (y plus petit) que 1
    expect(middle[1]).toBeLessThan(last[1]);
    expect(first[0]).toBe(2); // marge du cadre
    expect(last[0]).toBe(98);
  });

  it("une série plate est tracée au milieu, sans division par zéro", () => {
    const ys = sparklinePoints(["5", "5", "5"], 100, 40)!.split(" ").map((p) => Number(p.split(",")[1]));
    expect(new Set(ys)).toEqual(new Set([20]));
    expect(sparklinePoints(["5", "5"], 100, 40)).not.toContain("NaN");
  });

  it("moins de deux valeurs lisibles : rien à tracer", () => {
    expect(sparklinePoints([], 100, 40)).toBeNull();
    expect(sparklinePoints(["1"], 100, 40)).toBeNull();
    expect(sparklinePoints(["1", "abc", ""], 100, 40)).toBeNull();
  });

  it("ignore une valeur illisible au milieu", () => {
    expect(sparklinePoints(["1", "x", "3"], 100, 40)!.split(" ")).toHaveLength(2);
  });
});

describe("sparklineTrend", () => {
  it("compare la dernière valeur à la première", () => {
    expect(sparklineTrend(["1", "9", "2"])).toBe("up");
    expect(sparklineTrend(["5", "1", "4"])).toBe("down");
    expect(sparklineTrend(["3", "9", "3"])).toBe("flat");
    expect(sparklineTrend(["3"])).toBeNull();
  });
});

describe("Sparkline", () => {
  it("une image nommée : le libellé dit ce que la courbe montre", () => {
    render(<Sparkline values={["1", "2"]} label="BTC sur 7 jours : +1,00 %" />);
    expect(screen.getByRole("img", { name: "BTC sur 7 jours : +1,00 %" })).toBeTruthy();
  });

  it("la couleur suit le sens, et ne porte pas seule l'information", () => {
    const { container, rerender } = render(<Sparkline values={["1", "2"]} label="a" />);
    expect(container.querySelector("polyline")!.getAttribute("class")).toContain("stroke-gain");
    rerender(<Sparkline values={["2", "1"]} label="a" />);
    expect(container.querySelector("polyline")!.getAttribute("class")).toContain("stroke-loss");
  });

  it("sans de quoi tracer : un tiret, pas de dessin ni d'image vide pour les lecteurs d'écran", () => {
    const { container } = render(<Sparkline values={["1"]} label="a" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.textContent).toBe("—");
  });
});

describe("trendOf et marketState", () => {
  it("trouve la tendance d'un actif, ou rien", () => {
    const t = trends({ assets: [trend({ symbol: "BTC" })] });
    expect(trendOf(t, "BTC")?.symbol).toBe("BTC");
    expect(trendOf(t, "ETH")).toBeUndefined();
    expect(trendOf(undefined, "BTC")).toBeUndefined();
  });

  it("l'état du marché : les trois valeurs, et jamais autre chose (null ou inconnu → rien)", () => {
    for (const state of ["UP", "DOWN", "CALM"] as const) {
      expect(marketState(trends({ market: { state, btcChange24hPct: "0" } }))).toBe(state);
    }
    // L'API peut renvoyer null (BTC injoignable) alors que le schéma généré ne l'indique pas.
    expect(marketState(trends({ market: { state: null, btcChange24hPct: null } as unknown as TrendsDto["market"] }))).toBeNull();
    expect(marketState(trends({ market: { state: "BIZARRE", btcChange24hPct: null } as unknown as TrendsDto["market"] }))).toBeNull();
    expect(marketState(undefined)).toBeNull();
  });
});

describe("AssetsTable : variations et courbes", () => {
  const withTrends = trends({
    assets: [
      trend({ symbol: "BTC", change24hPct: "2.5", change7dPct: "8.1", sparkline: ["1", "2", "3"] }),
      trend({ symbol: "ETH", change24hPct: "-3.25", change7dPct: "-1.5", sparkline: ["3", "2", "1"] }),
      trend({ symbol: "LINK", change24hPct: "0", change7dPct: "0", sparkline: ["2", "2"] }),
    ],
  });
  // Le symbole apparaît deux fois par ligne (pastille et nom) : on retrouve la ligne qui le contient.
  const row = (symbol: string) => screen.getAllByRole("row").find((tr) => within(tr).queryAllByText(symbol).length > 0) as HTMLElement;

  it("chaque ligne montre sa variation sur 24 h (signe et couleur) et sa courbe nommée", () => {
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" trends={withTrends} />);

    expect(within(row("BTC")).getByText("+2,50 %").className).toContain("text-gain");
    expect(within(row("ETH")).getByText("−3,25 %").className).toContain("text-loss");
    expect(within(row("BTC")).getByRole("img", { name: "BTC sur 7 jours : +8,10 %" })).toBeTruthy();
    expect(within(row("ETH")).getByRole("img", { name: "ETH sur 7 jours : −1,50 %" })).toBeTruthy();
  });

  it("un stablecoin ou un actif sans tendance : des tirets, sans courbe", () => {
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" trends={withTrends} />);
    const usdc = row("USDC");
    expect(within(usdc).queryByRole("img")).toBeNull();
    expect(within(usdc).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("sans variation sur 7 jours (actif récent) : la courbe ne prétend pas couvrir 7 jours", () => {
    const recent = trends({ assets: [trend({ symbol: "BTC", change7dPct: null, sparkline: ["1", "2", "3"] })] });
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" trends={recent} />);
    const label = within(row("BTC")).getByRole("img").getAttribute("aria-label")!;
    expect(label).not.toContain("7 jours");
    expect(label).toContain("BTC");
  });

  it("trace vide (source en panne pour cet actif) : tirets, et le tableau reste complet", () => {
    const empty = trends({ complete: false, assets: [trend({ symbol: "BTC", change24hPct: null, change7dPct: null, sparkline: [] })] });
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" trends={empty} />);
    expect(within(row("BTC")).queryByRole("img")).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(SAMPLE.assets.length + 1);
    expect(screen.getByRole("status").textContent).toBe("Certaines courbes sont indisponibles pour le moment.");
  });

  it("tendances pas encore chargées : le tableau s'affiche, sans message d'erreur", () => {
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" />);
    expect(screen.getAllByRole("row")).toHaveLength(SAMPLE.assets.length + 1);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("tendances en échec : un message calme, le portefeuille reste affiché", () => {
    render(<AssetsTable assets={SAMPLE.assets} currency="USD" trendsFailed />);
    expect(screen.getByRole("status").textContent).toBe("Les variations et courbes sont indisponibles pour le moment.");
    expect(screen.getAllByText("BTC").length).toBeGreaterThan(0);
  });

  it("pas de message de courbes pour un portefeuille vide", () => {
    render(<AssetsTable assets={[]} currency="USD" trendsFailed />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("le masquage des montants ne cache pas les variations (ce sont des pourcentages, pas des montants)", () => {
    render(
      <PrivacyProvider>
        <AssetsTable assets={SAMPLE.assets} currency="USD" trends={withTrends} />
      </PrivacyProvider>,
    );
    expect(within(row("BTC")).getByText("+2,50 %")).toBeTruthy();
  });
});

describe("WalletHeader : état du marché", () => {
  const market = (state: "UP" | "DOWN" | "CALM" | null, btc: string | null = "-1.01") => ({ state, btcChange24hPct: btc });

  it.each([
    ["UP", "Marché en hausse", "text-gain"],
    ["DOWN", "Marché en baisse", "text-loss"],
    ["CALM", "Marché calme", "text-calm"],
  ] as const)("%s : « %s »", (state, label, cls) => {
    render(<WalletHeader portfolio={SAMPLE} market={market(state)} />);
    const pill = screen.getByText(new RegExp(label));
    expect(pill.className).toContain(cls);
    expect(pill.textContent).toMatch(/BTC −1,01 % sur 24 h/);
  });

  it("dit que c'est descriptif et non un conseil", () => {
    render(<WalletHeader portfolio={SAMPLE} market={market("UP", "3")} />);
    expect(screen.getByText(/Marché en hausse/).getAttribute("title")).toMatch(/pas un conseil/);
  });

  it("sans variation du BTC : l'état seul", () => {
    render(<WalletHeader portfolio={SAMPLE} market={market("CALM", null)} />);
    expect(screen.getByText("Marché calme").textContent).not.toContain("BTC");
  });

  it("état inconnu, ou pas de données : rien n'est affiché (on ne devine pas)", () => {
    const { rerender } = render(<WalletHeader portfolio={portfolio()} market={market(null)} />);
    expect(screen.queryByText(/Marché/)).toBeNull();
    rerender(<WalletHeader portfolio={portfolio()} />);
    expect(screen.queryByText(/Marché/)).toBeNull();
  });
});
