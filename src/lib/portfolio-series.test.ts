import { describe, expect, it } from "vitest";
import type { AssetTrendDto, AssetValuationDto, TrendsDto } from "@/lib/api/types.gen";
import { asset } from "@/components/dashboard/fixtures";
import { chartGeometry, describeAge, donutSegments, nearestIndex, portfolioSeries } from "./portfolio-series";

const N = 42;
const ramp = (from: number, to: number, n = N) => Array.from({ length: n }, (_, i) => String(from + ((to - from) * i) / (n - 1)));
const trend = (symbol: string, sparkline: string[]): AssetTrendDto => ({ symbol, change24hPct: "0", change7dPct: "0", sparkline });
const trends = (assets: AssetTrendDto[]): TrendsDto => ({ market: { state: "CALM", btcChange24hPct: "0" }, assets, complete: true });
const holding = (symbol: string, quantity: string): AssetValuationDto => asset({ symbol, quantity });

describe("portfolioSeries : la valeur sur 7 jours avec les positions actuelles", () => {
  it("somme quantité × prix de l'époque pour chaque point, trésorerie en USDT comprise", () => {
    const series = portfolioSeries(
      [holding("BTC", "2"), holding("ETH", "10"), holding("USDT", "1000")],
      trends([trend("BTC", ramp(100, 200)), trend("ETH", ramp(10, 20))]),
    )!;

    expect(series.points).toHaveLength(N);
    expect(series.points[0].value).toBeCloseTo(2 * 100 + 10 * 10 + 1000); // il y a 7 jours
    expect(series.points[N - 1].value).toBeCloseTo(2 * 200 + 10 * 20 + 1000); // maintenant
    expect(series.partial).toBe(false);
    expect(series.missing).toEqual([]);
  });

  it("datation : le dernier point est « maintenant », le premier date de 167 heures, régulièrement espacés", () => {
    const { points } = portfolioSeries([holding("BTC", "1")], trends([trend("BTC", ramp(1, 2))]))!;
    expect(points[N - 1].hoursAgo).toBe(0);
    expect(points[0].hoursAgo).toBeCloseTo(167);
    const steps = points.slice(1).map((p, i) => points[i].hoursAgo - p.hoursAgo);
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(1e-9);
  });

  it("une trésorerie en USDT seule ne fait pas de courbe (rien d'honnête à tracer)", () => {
    expect(portfolioSeries([holding("USDT", "1000")], trends([]))).toBeNull();
    expect(portfolioSeries([holding("USDT", "1000"), holding("USDC", "50")], trends([]))).toBeNull();
  });

  it("sans tendances ou sans courbe utilisable : null", () => {
    expect(portfolioSeries([holding("BTC", "1")], undefined)).toBeNull();
    expect(portfolioSeries([holding("BTC", "1")], trends([trend("BTC", [])]))).toBeNull();
    expect(portfolioSeries([holding("BTC", "1")], trends([trend("BTC", ["5"])]))).toBeNull();
    expect(portfolioSeries([], trends([]))).toBeNull();
  });

  it("un actif sans courbe est laissé de côté ET signalé : la courbe est dite partielle", () => {
    const series = portfolioSeries([holding("BTC", "1"), holding("ETH", "5")], trends([trend("BTC", ramp(100, 200))]))!;
    expect(series.partial).toBe(true);
    expect(series.missing).toEqual(["ETH"]);
    expect(series.points[N - 1].value).toBeCloseTo(200); // sans les 5 ETH : on ne les invente pas
  });

  it("une courbe plus courte (actif récent) est laissée de côté plutôt que mal alignée", () => {
    const series = portfolioSeries([holding("BTC", "1"), holding("NEW", "9")], trends([trend("BTC", ramp(100, 200)), trend("NEW", ramp(1, 2, 20))]))!;
    expect(series.missing).toEqual(["NEW"]);
    expect(series.points).toHaveLength(N);
  });

  it("une valeur illisible dans une courbe, ou une quantité illisible : l'actif est écarté, pas de NaN dans le tracé", () => {
    const bad = ramp(100, 200);
    bad[10] = "abc";
    const series = portfolioSeries(
      [holding("BTC", "1"), holding("ETH", "1"), holding("SOL", "pas-un-nombre")],
      trends([trend("BTC", ramp(100, 200)), trend("ETH", bad), trend("SOL", ramp(1, 2))]),
    )!;
    expect(series.missing.sort()).toEqual(["ETH", "SOL"]);
    expect(series.points.every((p) => Number.isFinite(p.value))).toBe(true);
  });

  it("l'ordre des actifs ne change pas le résultat", () => {
    const t = trends([trend("BTC", ramp(100, 200)), trend("ETH", ramp(10, 20))]);
    const a = portfolioSeries([holding("BTC", "2"), holding("ETH", "3")], t)!;
    const b = portfolioSeries([holding("ETH", "3"), holding("BTC", "2")], t)!;
    expect(a.points.map((p) => p.value)).toEqual(b.points.map((p) => p.value));
  });
});

describe("chartGeometry", () => {
  it("le plus haut en haut, le plus bas en bas, de gauche à droite avec la marge", () => {
    const g = chartGeometry([10, 30, 20], 100, 50, 4);
    expect(g.xs[0]).toBe(4);
    expect(g.xs[2]).toBe(96);
    expect(g.ys[1]).toBe(4); // 30 : le plus haut
    expect(g.ys[0]).toBe(46); // 10 : le plus bas
    expect(g.ys[2]).toBeGreaterThan(g.ys[1]);
    expect(g.ys[2]).toBeLessThan(g.ys[0]);
  });

  it("une série plate est tracée au milieu, sans division par zéro", () => {
    const g = chartGeometry([5, 5, 5], 100, 50);
    expect(new Set(g.ys)).toEqual(new Set([25]));
    expect(g.line).not.toContain("NaN");
  });

  it("la zone sous la courbe se ferme sur le bas du cadre, de bord à bord", () => {
    const g = chartGeometry([1, 2, 3], 100, 50, 4);
    const points = g.area.split(" ");
    expect(points[0]).toBe("4.0,50");
    expect(points.at(-1)).toBe("96.0,50");
    expect(points).toHaveLength(5); // départ, 3 points, arrivée
  });

  it("un seul point ne plante pas", () => {
    expect(chartGeometry([7], 100, 50).line).not.toContain("NaN");
  });
});

describe("nearestIndex", () => {
  it("le point le plus proche, borné aux extrémités", () => {
    expect(nearestIndex(0, 600, 42)).toBe(0);
    expect(nearestIndex(600, 600, 42)).toBe(41);
    expect(nearestIndex(-50, 600, 42)).toBe(0);
    expect(nearestIndex(9999, 600, 42)).toBe(41);
    expect(nearestIndex(300, 600, 42)).toBe(Math.round(20.5)); // le milieu
  });
  it("une série de 0 ou 1 point, ou une largeur nulle : 0", () => {
    expect(nearestIndex(100, 600, 1)).toBe(0);
    expect(nearestIndex(100, 600, 0)).toBe(0);
    expect(nearestIndex(100, 0, 42)).toBe(0);
  });
});

describe("describeAge", () => {
  it.each([
    [0, "maintenant"],
    [1.4, "maintenant"],
    [5, "il y a 5 h"],
    [47, "il y a 47 h"],
    [72, "il y a 3 j"],
    [167, "il y a 7 j"],
  ])("%s h → %s", (hours, text) => expect(describeAge(hours)).toBe(text));
});

describe("donutSegments", () => {
  const R = 50;
  const C = 2 * Math.PI * R;

  it("un arc par part, proportionnel, les décalages s'enchaînent", () => {
    const segments = donutSegments(
      [
        { symbol: "A", pct: 60 },
        { symbol: "B", pct: 40 },
      ],
      R,
      0,
    );
    expect(segments[0].length).toBeCloseTo(0.6 * C);
    expect(segments[1].length).toBeCloseTo(0.4 * C);
    expect(segments[0].offset).toBe(-0);
    expect(segments[1].offset).toBeCloseTo(-0.6 * C);
  });

  it("un petit intervalle sépare les arcs, sans jamais en faire disparaître un", () => {
    const segments = donutSegments(
      [
        { symbol: "A", pct: 99.99 },
        { symbol: "B", pct: 0.01 },
      ],
      R,
      2,
    );
    expect(segments[1].length).toBeGreaterThanOrEqual(0.5);
    expect(segments[0].length).toBeCloseTo((99.99 / 100) * C - 2);
  });

  it("une part unique est un cercle plein, sans intervalle", () => {
    const [only] = donutSegments([{ symbol: "A", pct: 100 }], R, 2);
    expect(only.length).toBeCloseTo(C);
  });

  it("les parts n'ont pas besoin de faire 100 : elles sont ramenées au total", () => {
    const segments = donutSegments(
      [
        { symbol: "A", pct: 30 },
        { symbol: "B", pct: 30 },
      ],
      R,
      0,
    );
    expect(segments[0].length + segments[1].length).toBeCloseTo(C);
  });

  it("aucune part, ou un total nul : rien", () => {
    expect(donutSegments([], R)).toEqual([]);
    expect(donutSegments([{ symbol: "A", pct: 0 }], R)).toEqual([]);
  });
});
