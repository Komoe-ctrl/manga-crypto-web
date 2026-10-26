import { describe, expect, it } from "vitest";
import { trimSlash, toWebSocketUrl } from "./config";
import {
  MASK,
  assetBadge,
  assetHue,
  formatMoney,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatSigned,
  formatWeight,
  toNumber,
  tone,
} from "./format";

/** Intl sépare les milliers par une espace insécable fine : on normalise pour comparer. */
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("toNumber", () => {
  it.each([
    ["12.5", 12.5],
    [12.5, 12.5],
    ["0", 0],
    ["-3.2", -3.2],
  ])("%j → %j", (input, expected) => expect(toNumber(input)).toBe(expected));

  it.each([null, undefined, "", "abc", Number.NaN, Number.POSITIVE_INFINITY])("%j → null", (input) => {
    expect(toNumber(input as never)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formate à la française avec la devise du compte", () => {
    expect(plain(formatMoney("1234.5", "USD"))).toBe("1 234,50 $US");
    expect(plain(formatMoney("1234.5", "EUR"))).toBe("1 234,50 €");
  });

  it("accepte un nombre de décimales", () => {
    expect(plain(formatMoney("1234.567", "USD", 0))).toBe("1 235 $US");
  });

  it("une valeur absente s'affiche « — », jamais « NaN » ni « 0 »", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney("abc")).toBe("—");
  });
});

describe("formatSigned", () => {
  it("le signe est toujours explicite, avec un vrai signe moins", () => {
    expect(plain(formatSigned("12.3"))).toBe("+12,30 $US");
    expect(plain(formatSigned("-12.3"))).toBe("−12,30 $US");
    expect(plain(formatSigned("0"))).toBe("+0,00 $US");
  });

  it("une valeur absente s'affiche « — »", () => expect(formatSigned(null)).toBe("—"));
});

describe("formatPercent", () => {
  it("deux décimales, virgule française, signe explicite", () => {
    expect(formatPercent("1.8")).toBe("+1,80 %");
    expect(formatPercent("-0.6")).toBe("−0,60 %");
    expect(formatPercent("0")).toBe("+0,00 %");
  });

  it("une valeur absente s'affiche « — »", () => expect(formatPercent(null)).toBe("—"));
});

describe("formatWeight", () => {
  it("arrondi à l'unité, sans signe", () => {
    expect(formatWeight("52.4")).toBe("52 %");
    expect(formatWeight("0.4")).toBe("0 %");
    expect(formatWeight(null)).toBe("—");
  });
});

describe("formatQuantity", () => {
  it("jusqu'à quatre décimales, sans zéros inutiles", () => {
    expect(formatQuantity("0.84200000")).toBe("0,842");
    expect(plain(formatQuantity("4200"))).toBe("4 200");
    expect(formatQuantity("0.123456")).toBe("0,1235");
    expect(formatQuantity(null)).toBe("—");
  });
});

describe("formatPrice", () => {
  it("quatre décimales sous 10 $, deux au-dessus", () => {
    expect(plain(formatPrice("0.4431"))).toBe("0,4431 $US");
    expect(plain(formatPrice("9.99"))).toBe("9,9900 $US");
    expect(plain(formatPrice("67250"))).toBe("67 250,00 $US");
    expect(plain(formatPrice("10"))).toBe("10,00 $US");
  });

  it("un prix indisponible s'affiche « — »", () => expect(formatPrice(null)).toBe("—"));
});

describe("tone", () => {
  it.each([
    ["12", "gain"],
    ["-12", "loss"],
    ["0.009", "neutral"], // moins d'un centime : l'interface reste calme
    ["-0.009", "neutral"],
    ["0.01", "gain"],
    ["0", "neutral"],
    [null, "neutral"],
  ])("%j → %s", (value, expected) => expect(tone(value)).toBe(expected));
});

describe("assetHue", () => {
  it("est stable : un symbole garde sa teinte", () => {
    expect(assetHue("BTC")).toBe(assetHue("BTC"));
  });

  it("reste dans le cercle des teintes et distingue les symboles courants", () => {
    const hues = ["BTC", "ETH", "SOL", "LINK", "USDC"].map(assetHue);
    for (const hue of hues) expect(hue).toBeGreaterThanOrEqual(0);
    for (const hue of hues) expect(hue).toBeLessThan(360);
    expect(new Set(hues).size).toBe(hues.length);
  });
});

describe("MASK", () => {
  it("ne révèle ni la valeur ni sa longueur", () => {
    expect(MASK).toBe("•••••");
  });
});

describe("config", () => {
  it("trimSlash retire les barres finales", () => {
    expect(trimSlash("http://x/")).toBe("http://x");
    expect(trimSlash("http://x///")).toBe("http://x");
    expect(trimSlash("http://x")).toBe("http://x");
  });

  it.each([
    ["http://localhost:3001", "ws://localhost:3001"],
    ["https://api.exemple.fr/", "wss://api.exemple.fr"],
    ["ws://localhost:3001", "ws://localhost:3001"],
    ["wss://api.exemple.fr", "wss://api.exemple.fr"],
  ])("toWebSocketUrl(%s) → %s", (input, expected) => {
    expect(toWebSocketUrl(input)).toBe(expected);
  });
});

describe("assetBadge", () => {
  it.each([
    ["BTC", "BTC"],
    ["ETH", "ETH"],
    ["SOL", "SOL"],
    ["LINK", "LI"],
    ["USDC", "US"],
    ["PEPE", "PE"],
    ["OP", "OP"],
  ])("%s → %s", (symbol, badge) => expect(assetBadge(symbol)).toBe(badge));
});
