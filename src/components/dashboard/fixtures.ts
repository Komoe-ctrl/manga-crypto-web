import type { AssetValuationDto, PortfolioDto } from "@/lib/api/types.gen";

/** Une position, avec des valeurs par défaut cohérentes ; les montants sont des chaînes décimales, comme dans l'API. */
export function asset(over: Partial<AssetValuationDto> & Pick<AssetValuationDto, "symbol">): AssetValuationDto {
  return {
    quantity: "1",
    avgBuyPrice: "100",
    currentPrice: "100",
    costBasis: "100",
    value: "100",
    pnl: "0",
    pnlPct: "0",
    weightPct: "0",
    ...over,
  };
}

export function portfolio(over: Partial<PortfolioDto> = {}): PortfolioDto {
  return {
    currency: "USD",
    assets: [],
    totalValue: "0",
    totalCost: "0",
    totalPnl: "0",
    totalPnlPct: "0",
    complete: true,
    ...over,
  };
}

export const SAMPLE = portfolio({
  assets: [
    asset({ symbol: "LINK", quantity: "420", currentPrice: "14.82", value: "6224.4", costBasis: "6888", pnl: "-663.6", pnlPct: "-9.63", weightPct: "8" }),
    asset({ symbol: "BTC", quantity: "0.842", currentPrice: "67250", value: "56624.5", costBasis: "43868.2", pnl: "12756.3", pnlPct: "29.08", weightPct: "73" }),
    asset({ symbol: "USDC", quantity: "4200", currentPrice: "1", value: "4200", costBasis: "4200", pnl: "0", pnlPct: "0", weightPct: "5" }),
    asset({ symbol: "ETH", quantity: "6.15", currentPrice: "3412", value: "20983.8", costBasis: "18327", pnl: "2656.8", pnlPct: "14.5", weightPct: "27" }),
  ],
  totalValue: "88032.7",
  totalCost: "73283.2",
  totalPnl: "14749.5",
  totalPnlPct: "20.13",
});
