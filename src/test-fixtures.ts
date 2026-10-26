import type { DigestDto, NotificationSettingsDto } from "@/lib/api/types.gen";

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
