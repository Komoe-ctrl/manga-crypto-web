"use client";

import { useState, type RefObject } from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { TradingStatusDto } from "@/lib/api/types.gen";
import { apiErrorMessage, hasStatus } from "@/lib/api-error";
import { SIDE_LABEL, baseAsset, normalizeQuantity, normalizeSymbol, validateQuantity, validateSymbol } from "@/lib/orders";
import { useCreateOrder } from "@/lib/queries/orders";

const field =
  "h-12 w-full rounded-xl border border-white/[0.12] bg-field px-3.5 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const buttonBase =
  "min-h-11 rounded-xl px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

interface OrderDialogProps {
  /** Actifs proposés dans la liste (ceux du portefeuille, sans la monnaie de règlement). */
  symbols: string[];
  status: TradingStatusDto;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Ordre manuel en deux temps : saisie, puis **récapitulatif à confirmer**. Même en simulation, un clic malheureux
 * ne doit pas partir. L'API reste juge (kill switch, exposition, fonds) et son motif de refus est affiché tel quel.
 */
export function OrderDialog({ symbols, status, onClose, returnFocusRef }: OrderDialogProps) {
  const create = useCreateOrder();
  const { notify } = useToast();
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [errors, setErrors] = useState<{ symbol?: string; quantity?: string }>({});
  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const blocked = status.tradingMode !== "PAPER" ? "Les ordres manuels ne sont disponibles qu'en mode simulation." : !status.canTrade ? "Le robot est arrêté ou en pause : aucun ordre ne peut partir." : null;

  const review = (event: React.FormEvent) => {
    event.preventDefault();
    const next = { symbol: validateSymbol(symbol) ?? undefined, quantity: validateQuantity(quantity) ?? undefined };
    setErrors(next);
    if (!next.symbol && !next.quantity) {
      setRefusal(null);
      setConfirming(true);
    }
  };

  const send = () => {
    create.mutate(
      { symbol: normalizeSymbol(symbol), side, quantity: normalizeQuantity(quantity) },
      {
        onSuccess: (order) => {
          notify(`${SIDE_LABEL[order.side]} de ${order.quantity} ${baseAsset(order.symbol)} : ${order.status === "FILLED" ? "exécuté" : "pris en compte"}.`);
          onClose();
        },
        onError: (error) => {
          // Un refus d'un garde-fou (422) arrive avec un message déjà en français ; on revient à la saisie pour corriger.
          // Autre échec (réseau coupé…) : on ne sait pas si l'ordre est parti, on renvoie vers l'historique.
          setRefusal(
            hasStatus(error, 422)
              ? `Ordre refusé : ${apiErrorMessage(error, "garde-fou de l'API.")}`
              : `${apiErrorMessage(error, "L'ordre n'a pas pu être passé.")} Vérifiez l'historique avant de réessayer : l'ordre a pu être enregistré.`,
          );
          setConfirming(false);
        },
      },
    );
  };

  return (
    <Modal titleId="order-title" onClose={onClose} returnFocusRef={returnFocusRef}>
      <h2 id="order-title" className="text-lg font-extrabold">
        Passer un ordre de simulation
      </h2>
      <p className="mt-1 text-[13px] text-muted">Au prix du marché, aucun argent réel n’est engagé.</p>

      {blocked && (
        <p role="status" className="mt-4 rounded-xl border border-loss/30 bg-loss/10 p-3 text-sm text-loss">
          {blocked}
        </p>
      )}

      {confirming ? (
        <div className="mt-5 flex flex-col gap-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl border border-line bg-white/[0.04] p-4 text-sm">
            <dt className="text-muted">Sens</dt>
            <dd className="font-bold">{SIDE_LABEL[side]}</dd>
            <dt className="text-muted">Actif</dt>
            <dd className="font-bold">{normalizeSymbol(symbol)}</dd>
            <dt className="text-muted">Quantité</dt>
            <dd className="font-bold tabular-nums">{normalizeQuantity(quantity)}</dd>
            <dt className="text-muted">Prix</dt>
            <dd>Au prix du marché</dd>
          </dl>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={create.isPending} className={`${buttonBase} border border-line text-ink-soft hover:bg-surface`}>
              Modifier
            </button>
            <button type="button" onClick={send} disabled={create.isPending || blocked !== null} className={`${buttonBase} bg-accent text-accent-ink`}>
              {create.isPending ? "Envoi…" : "Confirmer l'ordre"}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={review} noValidate className="mt-5 flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-semibold text-ink-soft">Sens</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["BUY", "SELL"] as const).map((value) => (
                <label
                  key={value}
                  className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                    side === value ? "border-accent bg-accent/10 text-accent" : "border-line text-ink-soft"
                  }`}
                >
                  <input type="radio" name="side" value={value} checked={side === value} onChange={() => setSide(value)} className="sr-only" />
                  {SIDE_LABEL[value]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="order-symbol" className="text-[13px] font-semibold text-ink-soft">
              Actif
            </label>
            <input
              id="order-symbol"
              list="order-symbols"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              autoComplete="off"
              placeholder="BTC"
              aria-invalid={errors.symbol ? true : undefined}
              aria-describedby={errors.symbol ? "order-symbol-error" : undefined}
              className={field}
            />
            <datalist id="order-symbols">
              {symbols.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {errors.symbol && (
              <p id="order-symbol-error" role="alert" className="text-sm text-loss">
                {errors.symbol}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="order-quantity" className="text-[13px] font-semibold text-ink-soft">
              Quantité d’actif
            </label>
            <input
              id="order-quantity"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoComplete="off"
              placeholder="0,001"
              aria-invalid={errors.quantity ? true : undefined}
              aria-describedby={errors.quantity ? "order-quantity-error" : undefined}
              className={`${field} tabular-nums`}
            />
            {errors.quantity && (
              <p id="order-quantity-error" role="alert" className="text-sm text-loss">
                {errors.quantity}
              </p>
            )}
          </div>

          {refusal && (
            <p role="alert" className="rounded-xl border border-loss/30 bg-loss/10 p-3 text-sm text-loss">
              {refusal}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className={`${buttonBase} border border-line text-ink-soft hover:bg-surface`}>
              Annuler
            </button>
            <button type="submit" disabled={blocked !== null} className={`${buttonBase} bg-accent text-accent-ink`}>
              Vérifier l’ordre
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
