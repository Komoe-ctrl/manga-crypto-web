import { describe, expect, it } from "vitest";
import { baseAsset, describeFailure, normalizeQuantity, normalizeSymbol, statusTone, validateQuantity, validateSymbol } from "./orders";

describe("validateQuantity", () => {
  it.each(["0.001", "1", "12,5", "0,000000000000000001", " 3 "])("accepte %j", (value) => {
    expect(validateQuantity(value)).toBeNull();
  });

  it.each([
    ["", /Saisissez/],
    ["abc", /invalide/],
    ["-1", /invalide/],
    ["1e3", /invalide/],
    ["1.2.3", /invalide/],
    ["0", /supérieure à zéro/],
    ["0.000", /supérieure à zéro/],
    ["0,0", /supérieure à zéro/],
    ["0.0000000000000000001", /invalide/], // 19 décimales : l'API n'en accepte que 18
  ])("refuse %j", (value, message) => {
    expect(validateQuantity(value)).toMatch(message);
  });

  it("ne passe jamais par un nombre à virgule : la valeur envoyée garde tous ses chiffres", () => {
    expect(normalizeQuantity(" 0,123456789012345678 ")).toBe("0.123456789012345678");
    expect(normalizeQuantity("1.10")).toBe("1.10");
  });
});

describe("baseAsset", () => {
  it("ramène la paire de l’API à l’actif", () => {
    expect(baseAsset("BTC/USDT")).toBe("BTC");
    expect(baseAsset("ETH")).toBe("ETH");
  });
});

describe("symboles", () => {
  it("normalise en majuscules", () => expect(normalizeSymbol(" btc ")).toBe("BTC"));
  it("accepte un actif", () => expect(validateSymbol("eth")).toBeNull());
  it("refuse le vide, les caractères étranges et la monnaie de règlement", () => {
    expect(validateSymbol("")).toMatch(/Choisissez/);
    expect(validateSymbol("BTC/USDT")).toMatch(/invalide/);
    expect(validateSymbol("usdt")).toMatch(/USDT/);
  });
});

describe("describeFailure", () => {
  it("traduit les codes de l'API", () => {
    expect(describeFailure("kill_switch")).toMatch(/kill switch/);
    expect(describeFailure("insufficient_funds")).toBe("Fonds insuffisants.");
    expect(describeFailure("exposure_exceeded")).toMatch(/Exposition maximale/);
  });
  it("ne montre jamais un code inconnu tel quel", () => {
    const text = describeFailure("code_du_futur");
    expect(text).not.toContain("code_du_futur");
    expect(text).toMatch(/non reconnu/);
  });
  it("sans motif : le dit", () => expect(describeFailure(null)).toMatch(/non précisé/));
});

describe("statusTone", () => {
  it("un refus ou un échec se voit, l'attente reste neutre", () => {
    expect(statusTone("FILLED")).toBe("gain");
    expect(statusTone("REJECTED")).toBe("loss");
    expect(statusTone("FAILED")).toBe("loss");
    expect(statusTone("PENDING")).toBe("neutral");
    expect(statusTone("CANCELLED")).toBe("neutral");
  });
});
