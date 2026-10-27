import { describe, expect, it } from "vitest";
import { MODE_HELP, MODE_OPTIONS, describeRealized, normalizeAssetSymbol, normalizeDecimal, validateAssetSymbol, validateDecimal } from "./positions";

describe("validateDecimal : les règles de l'API", () => {
  it.each(["0.05", "1", "12,5", " 3 ", "60000", "0.000000000000000001", "12345678901234567890", "99999999999999999999.123456789012345678"])(
    "accepte %j",
    (value) => {
      expect(validateDecimal(value, "quantité")).toBeNull();
      expect(validateDecimal(value, "prix")).toBeNull();
    },
  );

  it.each([
    ["", /Saisissez une quantité/],
    ["   ", /Saisissez une quantité/],
    ["abc", /invalide/],
    ["-1", /invalide/],
    ["1e3", /invalide/],
    ["1.2.3", /invalide/],
    ["0.0000000000000000001", /invalide/], // 19 décimales
    ["123456789012345678901", /invalide/], // 21 chiffres entiers
    ["0", /supérieure à zéro/],
    ["0.00", /supérieure à zéro/],
    ["0,0", /supérieure à zéro/],
  ])("refuse la quantité %j", (value, message) => {
    expect(validateDecimal(value, "quantité")).toMatch(message);
  });

  it("le message dit de quoi il s'agit : un prix n'est pas une quantité", () => {
    expect(validateDecimal("", "prix")).toBe("Saisissez un prix.");
    expect(validateDecimal("0", "prix")).toBe("Le prix doit être supérieur à zéro.");
    expect(validateDecimal("x", "prix")).toMatch(/^Prix invalide/);
    expect(validateDecimal("x", "quantité")).toMatch(/^Quantité invalide/);
  });

  it("ne passe jamais par un nombre à virgule : tous les chiffres sont gardés", () => {
    expect(normalizeDecimal(" 0,123456789012345678 ")).toBe("0.123456789012345678");
    expect(normalizeDecimal("60000.10")).toBe("60000.10");
    expect(normalizeDecimal("0.1")).toBe("0.1");
  });
});

describe("symboles d'actif", () => {
  it("normalise en majuscules", () => expect(normalizeAssetSymbol(" btc ")).toBe("BTC"));
  it("accepte 2 à 12 lettres ou chiffres, USDT compris (la trésorerie se déclare aussi)", () => {
    for (const s of ["btc", "ETH", "usdt", "1INCH", "AB", "ABCDEFGHIJKL"]) expect(validateAssetSymbol(s)).toBeNull();
  });
  it("refuse le vide, un caractère étranger, trop court, trop long", () => {
    expect(validateAssetSymbol("")).toMatch(/Choisissez/);
    expect(validateAssetSymbol("BTC/USDT")).toMatch(/invalide/);
    expect(validateAssetSymbol("B")).toMatch(/invalide/);
    expect(validateAssetSymbol("ABCDEFGHIJKLM")).toMatch(/invalide/);
    expect(validateAssetSymbol("bt c")).toMatch(/invalide/);
  });
});

describe("modes", () => {
  it("trois modes, chacun expliqué en une phrase", () => {
    expect(MODE_OPTIONS.map(([key]) => key)).toEqual(["BUY", "SELL", "CORRECT"]);
    expect(MODE_HELP.BUY).toMatch(/recalcule votre prix d'achat moyen/);
    expect(MODE_HELP.SELL).toMatch(/gain réalisé/);
    expect(MODE_HELP.CORRECT).toMatch(/Remplace/);
  });
  it("le résultat réalisé n'est annoncé que si l'API en donne un", () => {
    expect(describeRealized(null, (v) => v)).toBe("");
    expect(describeRealized("12.5", (v) => `+${v}`)).toBe(" Résultat réalisé : +12.5.");
  });
});
