import type { OrderDto } from "@/lib/api/types.gen";

/**
 * Messages du WebSocket de l'API (`crypto-api/docs/SPEC.md`, section 8). L'OpenAPI ne décrit pas les WebSocket : ces
 * types sont écrits à la main, à partir de ce contrat. Les montants des ordres sont des chaînes décimales.
 */

export interface RiskEvent {
  tradingMode: "PAPER" | "LIVE";
  killSwitchActive: boolean;
  botPausedUntil: string | null;
  canTrade: boolean;
  blockedReason: "KILL_SWITCH" | "PAUSED_DAILY_LOSS" | null;
}

export interface NotificationEvent {
  id: string;
  title: string;
  body: string;
  critical: boolean;
  /** `DISPATCHED` (envoyée), `HELD` (retenue par le Mode Nuit)… */
  status: string;
  createdAt: string;
}

export type ServerMessage =
  | { event: "ready"; data: { expiresAt: string | null } }
  | { event: "error"; data: { code: string } }
  | { event: "order"; data: OrderDto }
  | { event: "risk"; data: RiskEvent }
  | { event: "notification"; data: NotificationEvent };

const KNOWN = new Set(["ready", "error", "order", "risk", "notification"]);

/**
 * Lit un message du serveur. Renvoie `null` pour tout ce qui n'est pas un message connu et bien formé : un événement
 * qu'une version future de l'API ajouterait, ou un message illisible, ne doit jamais casser l'application.
 */
export function parseMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { event, data } = value as { event?: unknown; data?: unknown };
  if (typeof event !== "string" || !KNOWN.has(event)) return null;
  if (typeof data !== "object" || data === null) return null;
  return value as ServerMessage;
}

/** Codes de fermeture de l'API (SPEC section 8). */
export const CLOSE = {
  UNAUTHORIZED: 4401,
  AUTH_TIMEOUT: 4408,
  TOO_MANY_CONNECTIONS: 4429,
} as const;
