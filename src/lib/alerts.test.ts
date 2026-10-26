import { describe, expect, it } from "vitest";
import { describeAlert, formatWindow, toCreateBody, validateDraft, type AlertDraft } from "./alerts";

const draft = (over: Partial<AlertDraft> = {}): AlertDraft => ({
  condition: "PRICE_DROP_PCT",
  assetSymbol: "btc",
  threshold: "5",
  windowMinutes: 1440,
  channel: "PUSH",
  isCritical: false,
  ...over,
});

describe("formatWindow", () => {
  it.each([
    [5, "5 min"],
    [90, "90 min"],
    [60, "1 h"],
    [240, "4 h"],
    [1440, "1 jour"],
    [10080, "7 jours"],
    [null, ""],
  ])("%s min → %j", (minutes, text) => expect(formatWindow(minutes)).toBe(text));
});

describe("describeAlert", () => {
  const base = { assetSymbol: "BTC", threshold: "5", windowMinutes: 1440 };
  it("dit chaque condition en une phrase", () => {
    expect(describeAlert({ ...base, condition: "PRICE_DROP_PCT" })).toBe("BTC perd 5 % en 1 jour");
    expect(describeAlert({ ...base, condition: "PRICE_RISE_PCT", threshold: "10", windowMinutes: 60 })).toBe("BTC gagne 10 % en 1 h");
    expect(describeAlert({ ...base, condition: "PORTFOLIO_DROP_PCT", assetSymbol: null })).toBe("Le portefeuille perd 5 % en 1 jour");
  });
  it("un franchissement parle d'un prix, sans fenêtre", () => {
    const above = describeAlert({ ...base, condition: "PRICE_CROSS_ABOVE", threshold: "70000", windowMinutes: null });
    const below = describeAlert({ ...base, condition: "PRICE_CROSS_BELOW", threshold: "50000", windowMinutes: null });
    expect(above).toMatch(/^BTC dépasse .*70.*000/);
    expect(below).toMatch(/^BTC passe sous .*50.*000/);
  });
});

describe("validateDraft", () => {
  it("un brouillon correct n'a aucune erreur", () => expect(validateDraft(draft())).toEqual({}));

  it("exige un actif, sauf pour le portefeuille", () => {
    expect(validateDraft(draft({ assetSymbol: "" })).assetSymbol).toBeDefined();
    expect(validateDraft(draft({ condition: "PORTFOLIO_DROP_PCT", assetSymbol: "" }))).toEqual({});
  });

  it.each(["", "abc", "0", "-3", "1e2"])("refuse le seuil %j", (threshold) => {
    expect(validateDraft(draft({ threshold })).threshold).toBeDefined();
  });

  it("un pourcentage ne dépasse pas 100, un prix peut", () => {
    expect(validateDraft(draft({ threshold: "101" })).threshold).toMatch(/100/);
    expect(validateDraft(draft({ condition: "PRICE_CROSS_ABOVE", threshold: "250000" }))).toEqual({});
  });

  it("accepte la virgule décimale", () => expect(validateDraft(draft({ threshold: "2,5" }))).toEqual({}));
});

describe("toCreateBody : seulement ce que la condition accepte", () => {
  it("variation : actif en majuscules et fenêtre", () => {
    expect(toCreateBody(draft({ threshold: "2,5" }))).toEqual({
      condition: "PRICE_DROP_PCT",
      threshold: "2.5",
      channel: "PUSH",
      isCritical: false,
      assetSymbol: "BTC",
      windowMinutes: 1440,
    });
  });
  it("franchissement : jamais de fenêtre (l'API la refuse)", () => {
    const body = toCreateBody(draft({ condition: "PRICE_CROSS_BELOW", threshold: "50000" }));
    expect(body).not.toHaveProperty("windowMinutes");
    expect(body.assetSymbol).toBe("BTC");
  });
  it("portefeuille : jamais d'actif", () => {
    const body = toCreateBody(draft({ condition: "PORTFOLIO_DROP_PCT", isCritical: true }));
    expect(body).not.toHaveProperty("assetSymbol");
    expect(body.windowMinutes).toBe(1440);
    expect(body.isCritical).toBe(true);
  });
});
