import { describe, expect, it } from "vitest";
import type { OperationDto } from "@/lib/api/types.gen";
import { MASK } from "./format";
import { describeOperation, describeRealized, realizedTone, sourceLabel } from "./operations";

const op = (over: Partial<OperationDto> = {}): OperationDto => ({
  id: "1",
  symbol: "BTC",
  kind: "BUY",
  source: "DECLARED",
  quantity: "0.05",
  price: "60000",
  realizedPnl: null,
  orderId: null,
  createdAt: "2026-10-27T10:00:00Z",
  ...over,
});
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("describeOperation", () => {
  it("un achat et une vente : quantité, actif, prix", () => {
    expect(plain(describeOperation(op()))).toMatch(/^Achat de 0,05 BTC à 60 000,00/);
    expect(plain(describeOperation(op({ kind: "SELL", quantity: "1.5", price: "2300.5" })))).toMatch(/^Vente de 1,5 BTC à 2 300,50/);
  });

  it("une correction : la position fixée et son prix moyen", () => {
    expect(plain(describeOperation(op({ kind: "SET", quantity: "1.2", price: "2500", symbol: "ETH" })))).toMatch(
      /^Position ETH fixée à 1,2 \(prix moyen 2 500,00/,
    );
  });

  it("un retrait : ce qui a été retiré", () => {
    expect(plain(describeOperation(op({ kind: "REMOVE", quantity: "8", price: "150", symbol: "SOL" })))).toMatch(
      /^Position SOL retirée \(8 SOL au prix moyen 150,00/,
    );
  });

  it("une très petite quantité ne s'affiche jamais « 0 »", () => {
    expect(describeOperation(op({ quantity: "0.00001234" }))).toContain("0,00001234 BTC");
  });

  it("le masquage cache les montants (quantité, prix) mais laisse lisibles l'actif et la nature", () => {
    const hidden = describeOperation(op(), "USD", () => MASK);
    expect(hidden).toBe(`Achat de ${MASK} BTC à ${MASK}`);
    expect(hidden).not.toMatch(/0,05|60/);
  });
});

describe("résultat réalisé", () => {
  it("un gain a son signe plus, une perte son vrai signe moins", () => {
    expect(plain(describeRealized(op({ kind: "SELL", realizedPnl: "150" })))).toMatch(/^\+150,00/);
    expect(plain(describeRealized(op({ kind: "SELL", realizedPnl: "-49.8" })))).toMatch(/^−49,80/);
  });
  it("rien pour une opération sans résultat", () => expect(describeRealized(op())).toBe(""));

  it("la couleur : gain, perte, neutre", () => {
    expect(realizedTone(op({ realizedPnl: "10" }))).toBe("gain");
    expect(realizedTone(op({ realizedPnl: "-10" }))).toBe("loss");
    expect(realizedTone(op({ realizedPnl: "0" }))).toBe("neutral");
    expect(realizedTone(op())).toBe("neutral");
  });
});

describe("origine", () => {
  it("« Ordre » seulement pour une opération née d'un ordre exécuté", () => {
    expect(sourceLabel(op({ source: "ORDER", orderId: "o1" }))).toBe("Ordre");
    expect(sourceLabel(op())).toBeNull();
  });
});
