import type { AlertDto, CreateAlertDto } from "@/lib/api/types.gen";
import { formatPrice } from "@/lib/format";

export type Condition = AlertDto["condition"];

export const CONDITION_LABEL: Record<Condition, string> = {
  PRICE_DROP_PCT: "Baisse du prix",
  PRICE_RISE_PCT: "Hausse du prix",
  PRICE_CROSS_ABOVE: "Prix au-dessus de",
  PRICE_CROSS_BELOW: "Prix en dessous de",
  PORTFOLIO_DROP_PCT: "Baisse du portefeuille",
};

export const CHANNEL_NAME: Record<AlertDto["channel"], string> = { PUSH: "Push", TELEGRAM: "Telegram", EMAIL: "E-mail" };

/** Ce que demande chaque condition : un actif ? une fenêtre de temps ? un pourcentage ou un prix ? */
export const CONDITION_SHAPE: Record<Condition, { asset: boolean; window: boolean; unit: "pct" | "usd" }> = {
  PRICE_DROP_PCT: { asset: true, window: true, unit: "pct" },
  PRICE_RISE_PCT: { asset: true, window: true, unit: "pct" },
  PRICE_CROSS_ABOVE: { asset: true, window: false, unit: "usd" },
  PRICE_CROSS_BELOW: { asset: true, window: false, unit: "usd" },
  PORTFOLIO_DROP_PCT: { asset: false, window: true, unit: "pct" },
};

/** Fenêtre en minutes → « 30 min », « 2 h », « 1 jour ». */
export function formatWindow(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes % 1440 === 0) return `${minutes / 1440} jour${minutes / 1440 > 1 ? "s" : ""}`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

/** Une alerte en une phrase, lisible sans connaître l'API. */
export function describeAlert(alert: Pick<AlertDto, "assetSymbol" | "condition" | "threshold" | "windowMinutes">): string {
  const { assetSymbol: asset, condition, threshold, windowMinutes } = alert;
  const window = formatWindow(windowMinutes);
  switch (condition) {
    case "PRICE_DROP_PCT":
      return `${asset} perd ${threshold} % en ${window}`;
    case "PRICE_RISE_PCT":
      return `${asset} gagne ${threshold} % en ${window}`;
    case "PRICE_CROSS_ABOVE":
      return `${asset} dépasse ${formatPrice(threshold)}`;
    case "PRICE_CROSS_BELOW":
      return `${asset} passe sous ${formatPrice(threshold)}`;
    case "PORTFOLIO_DROP_PCT":
      return `Le portefeuille perd ${threshold} % en ${window}`;
  }
}

/** Fenêtres proposées (l'API accepte de 5 minutes à 7 jours). */
export const WINDOW_CHOICES = [
  { minutes: 60, label: "1 heure" },
  { minutes: 240, label: "4 heures" },
  { minutes: 1440, label: "24 heures" },
  { minutes: 10080, label: "7 jours" },
] as const;

const DECIMAL = /^\d+(?:\.\d{1,8})?$/;

export interface AlertDraft {
  condition: Condition;
  assetSymbol: string;
  threshold: string;
  windowMinutes: number;
  channel: AlertDto["channel"];
  isCritical: boolean;
}

export type AlertDraftErrors = Partial<Record<"assetSymbol" | "threshold", string>>;

/** Validation locale légère ; l'API reste l'autorité (elle refuse aussi les doublons et les valeurs absurdes). */
export function validateDraft(draft: AlertDraft): AlertDraftErrors {
  const shape = CONDITION_SHAPE[draft.condition];
  const errors: AlertDraftErrors = {};
  if (shape.asset && !/^[A-Z0-9]{2,12}$/.test(draft.assetSymbol.trim().toUpperCase())) {
    errors.assetSymbol = "Choisissez un actif (2 à 12 lettres ou chiffres).";
  }
  const threshold = draft.threshold.trim().replace(",", ".");
  if (threshold === "") errors.threshold = shape.unit === "pct" ? "Saisissez un pourcentage." : "Saisissez un prix.";
  else if (!DECIMAL.test(threshold) || /^0+(?:\.0*)?$/.test(threshold)) errors.threshold = "Saisissez un nombre supérieur à zéro.";
  else if (shape.unit === "pct" && Number(threshold) > 100) errors.threshold = "Un pourcentage ne dépasse pas 100.";
  return errors;
}

/** Corps envoyé à l'API : seuls les champs que la condition accepte (elle refuse une fenêtre pour un franchissement). */
export function toCreateBody(draft: AlertDraft): CreateAlertDto {
  const shape = CONDITION_SHAPE[draft.condition];
  return {
    condition: draft.condition,
    threshold: draft.threshold.trim().replace(",", "."),
    channel: draft.channel,
    isCritical: draft.isCritical,
    ...(shape.asset ? { assetSymbol: draft.assetSymbol.trim().toUpperCase() } : {}),
    ...(shape.window ? { windowMinutes: draft.windowMinutes } : {}),
  };
}
