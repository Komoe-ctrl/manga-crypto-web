import type { AlertDto, DigestDto, NotificationSettingsDto, OperationDto, OrderDto, RiskSettingsDto, TradingStatusDto } from "@/lib/api/types.gen";

export function settings(over: Partial<NotificationSettingsDto> = {}): NotificationSettingsDto {
  return {
    nightModeEnabled: true,
    nightStartMinute: 1320,
    nightEndMinute: 420,
    digestEnabled: true,
    digestMinute: 480,
    pushEnabled: true,
    telegramEnabled: false,
    emailEnabled: false,
    telegramChatId: null,
    notificationEmail: null,
    ...over,
  };
}

export function digest(over: Partial<DigestDto> = {}): DigestDto {
  return {
    id: "d1",
    period: "TODAY",
    periodStart: "2026-10-22T20:00:00Z",
    periodEnd: "2026-10-23T06:00:00Z",
    summary: "Nuit calme. Votre portefeuille a progressé d'environ +1,2 %.",
    points: ["2 alertes non urgentes regroupées pendant la nuit.", "Volatilité du BTC sous sa moyenne."],
    portfolioDeltaPct: "1.2",
    queuedAlertsCount: 2,
    readAt: null,
    generatedAt: "2026-10-23T06:00:00Z",
    ...over,
  };
}

export function tradingStatus(over: Partial<TradingStatusDto> = {}): TradingStatusDto {
  return {
    tradingMode: "PAPER",
    tradingModeChangedAt: null,
    killSwitchActive: false,
    killSwitchAt: null,
    botPausedUntil: null,
    canTrade: true,
    blockedReason: "KILL_SWITCH",
    ...over,
  };
}

export function riskSettings(over: Partial<RiskSettingsDto> = {}): RiskSettingsDto {
  return { maxExposurePct: 10, maxDailyLossPct: 5, defaultStopLossPct: 5, defaultTakeProfitPct: 10, ...over };
}

export function order(over: Partial<OrderDto> = {}): OrderDto {
  return {
    id: "o1",
    clientOrderId: "vl-1",
    mode: "PAPER",
    symbol: "BTC/USDT",
    side: "BUY",
    type: "MARKET",
    status: "FILLED",
    origin: "MANUAL",
    quantity: "0.001",
    filledQuantity: "0.001",
    avgFillPrice: "68000",
    fee: "0.068",
    feeCurrency: "USDT",
    stopLossPrice: null,
    takeProfitPrice: null,
    failureReason: null,
    parentOrderId: null,
    createdAt: "2026-10-23T09:00:00Z",
    executedAt: "2026-10-23T09:00:01Z",
    ...over,
  };
}

export function alert(over: Partial<AlertDto> = {}): AlertDto {
  return {
    id: "a1",
    assetSymbol: "BTC",
    condition: "PRICE_DROP_PCT",
    threshold: "5",
    windowMinutes: 1440,
    channel: "PUSH",
    isActive: true,
    isCritical: false,
    isTriggered: false,
    lastTriggeredAt: null,
    createdAt: "2026-10-20T09:00:00Z",
    ...over,
  };
}

let operationCounter = 0;
/** Une opération du journal ; chaque appel a son propre identifiant et une date légèrement plus ancienne (les plus récentes d'abord). */
export function operation(over: Partial<OperationDto> = {}): OperationDto {
  operationCounter += 1;
  return {
    id: `op-${operationCounter}`,
    symbol: "BTC",
    kind: "BUY",
    source: "DECLARED",
    quantity: "0.05",
    price: "60000",
    realizedPnl: null,
    orderId: null,
    createdAt: new Date(Date.UTC(2026, 9, 27, 12, 0, 0) - operationCounter * 60_000).toISOString(),
    ...over,
  };
}
