import type { OperationDto } from "@/lib/api/types.gen";
import { formatPrice, formatQuantity, formatSigned, tone, type Tone } from "@/lib/format";

export const KIND_LABEL: Record<OperationDto["kind"], string> = {
  BUY: "Achat",
  SELL: "Vente",
  SET: "Position fixée",
  REMOVE: "Position retirée",
};

const SHOWN = (text: string) => text;

/**
 * Une opération en une phrase. Les quantités et prix sont **affichés** arrondis (voir `formatQuantity`, `formatPrice`) ;
 * les valeurs exactes restent celles de l'API. `mask` cache les montants quand l'utilisateur a masqué son affichage ;
 * l'actif et la nature de l'opération restent lisibles.
 */
export function describeOperation(operation: OperationDto, currency = "USD", mask: (text: string) => string = SHOWN): string {
  const { symbol } = operation;
  const quantity = mask(formatQuantity(operation.quantity));
  const price = mask(formatPrice(operation.price, currency));
  switch (operation.kind) {
    case "BUY":
      return `Achat de ${quantity} ${symbol} à ${price}`;
    case "SELL":
      return `Vente de ${quantity} ${symbol} à ${price}`;
    case "SET":
      return `Position ${symbol} fixée à ${quantity} (prix moyen ${price})`;
    case "REMOVE":
      return `Position ${symbol} retirée (${quantity} ${symbol} au prix moyen ${price})`;
  }
}

/** Résultat réalisé d'une vente, avec son signe ; « » pour toute autre opération. */
export function describeRealized(operation: OperationDto, currency = "USD"): string {
  return operation.realizedPnl === null ? "" : formatSigned(operation.realizedPnl, currency);
}

/** Ton du résultat réalisé : un gain en vert, une perte en orangé, le reste neutre. */
export function realizedTone(operation: OperationDto): Tone {
  return operation.realizedPnl === null ? "neutral" : tone(operation.realizedPnl);
}

/** Source affichée : « Ordre » pour les opérations nées d'un ordre exécuté, rien pour les déclarations. */
export function sourceLabel(operation: OperationDto): string | null {
  return operation.source === "ORDER" ? "Ordre" : null;
}
