"use client";

import { useState, type RefObject } from "react";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import type { AssetValuationDto } from "@/lib/api/types.gen";
import { apiErrorMessage, hasStatus } from "@/lib/api-error";
import { formatQuantity, formatSigned } from "@/lib/format";
import {
  MODE_HELP,
  MODE_OPTIONS,
  describeRealized,
  normalizeAssetSymbol,
  normalizeDecimal,
  validateAssetSymbol,
  validateDecimal,
  type PositionMode,
} from "@/lib/positions";
import { useRecordTransaction, useRemovePosition, useSetPosition } from "@/lib/queries/positions";

const field =
  "h-12 w-full rounded-xl border border-white/[0.12] bg-field px-3.5 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const buttonBase =
  "min-h-11 rounded-xl px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";
const SUBMIT_LABEL: Record<PositionMode, string> = { BUY: "Enregistrer l'achat", SELL: "Enregistrer la vente", CORRECT: "Enregistrer la correction" };
const COMMON = ["BTC", "ETH", "SOL", "USDT"];

interface PositionDialogProps {
  holdings: readonly AssetValuationDto[];
  currency: string;
  /** Ouverture depuis une ligne : l'actif est connu, on propose directement de corriger sa position. */
  symbol?: string;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

type Errors = Partial<Record<"symbol" | "quantity" | "price", string>>;

/** Valeurs de départ d'un mode pour un actif : la correction part de la position actuelle, un achat ou une vente du prix du marché. */
function defaults(mode: PositionMode, held: AssetValuationDto | undefined): { quantity: string; price: string } {
  if (mode === "CORRECT") return { quantity: held?.quantity ?? "", price: held?.avgBuyPrice ?? "" };
  return { quantity: "", price: held?.currentPrice ?? "" };
}

/**
 * Déclarer un achat ou une vente, corriger une position ou la retirer. Le portefeuille est **déclaratif** (l'application
 * ne lit pas encore les soldes de la plateforme) : cette fenêtre est le seul moyen d'y mettre ce que l'on possède.
 */
export function PositionDialog({ holdings, currency, symbol: initialSymbol, onClose, returnFocusRef }: PositionDialogProps) {
  const { notify } = useToast();
  const record = useRecordTransaction();
  const set = useSetPosition();
  const remove = useRemovePosition();

  const initialHeld = initialSymbol ? holdings.find((h) => h.symbol === initialSymbol) : undefined;
  const initialMode: PositionMode = initialHeld ? "CORRECT" : "BUY";
  const [mode, setMode] = useState<PositionMode>(initialMode);
  const [symbol, setSymbol] = useState(initialSymbol ?? "");
  const [quantity, setQuantity] = useState(defaults(initialMode, initialHeld).quantity);
  const [price, setPrice] = useState(defaults(initialMode, initialHeld).price);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const normalizedSymbol = normalizeAssetSymbol(symbol);
  const held = holdings.find((h) => h.symbol === normalizedSymbol);
  const busy = record.isPending || set.isPending || remove.isPending;
  const symbols = [...new Set([...holdings.map((h) => h.symbol), ...COMMON])];

  const changeMode = (next: PositionMode) => {
    setMode(next);
    setErrors({});
    setServerError(null);
    setConfirmingRemove(false);
    const start = defaults(next, held);
    setQuantity(start.quantity);
    setPrice(start.price);
  };

  const fail = (error: unknown) =>
    setServerError(hasStatus(error, 404) ? "Cette position n'existe plus." : apiErrorMessage(error, "Impossible d'enregistrer cette opération."));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found: Errors = {
      symbol: validateAssetSymbol(symbol) ?? undefined,
      quantity: validateDecimal(quantity, "quantité") ?? undefined,
      price: validateDecimal(price, "prix") ?? undefined,
    };
    setErrors(found);
    setServerError(null);
    if (found.symbol || found.quantity || found.price) return;

    const q = normalizeDecimal(quantity);
    const p = normalizeDecimal(price);
    const shown = `${formatQuantity(q)} ${normalizedSymbol}`;
    if (mode === "CORRECT") {
      set.mutate(
        { symbol: normalizedSymbol, quantity: q, avgBuyPrice: p },
        {
          onSuccess: () => {
            notify(`Position ${normalizedSymbol} mise à jour.`);
            onClose();
          },
          onError: fail,
        },
      );
      return;
    }
    record.mutate(
      { symbol: normalizedSymbol, side: mode, quantity: q, price: p },
      {
        onSuccess: (result) => {
          notify(
            mode === "BUY"
              ? `Achat de ${shown} enregistré.`
              : `Vente de ${shown} enregistrée.${describeRealized(result.realizedPnl, (v) => formatSigned(v, currency))}`,
          );
          onClose();
        },
        onError: fail,
      },
    );
  };

  const confirmRemove = () =>
    remove.mutate(normalizedSymbol, {
      onSuccess: () => {
        notify(`Position ${normalizedSymbol} retirée.`);
        onClose();
      },
      onError: (error) => {
        setConfirmingRemove(false);
        fail(error);
      },
    });

  return (
    <Modal titleId="position-title" onClose={onClose} returnFocusRef={returnFocusRef}>
      <h2 id="position-title" className="text-lg font-extrabold">
        Déclarer une opération
      </h2>
      <p className="mt-1 text-[13px] text-muted">{MODE_HELP[mode]}</p>

      <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-4">
        <Segmented label="Type d'opération" value={mode} onChange={changeMode} options={MODE_OPTIONS} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="position-symbol" className="text-[13px] font-semibold text-ink-soft">
            Actif
          </label>
          <input
            id="position-symbol"
            list="position-symbols"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            autoComplete="off"
            placeholder="BTC"
            aria-invalid={errors.symbol ? true : undefined}
            aria-describedby={errors.symbol ? "position-symbol-error" : undefined}
            className={field}
          />
          <datalist id="position-symbols">
            {symbols.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {errors.symbol && (
            <p id="position-symbol-error" role="alert" className="text-sm text-loss">
              {errors.symbol}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="position-quantity" className="text-[13px] font-semibold text-ink-soft">
            Quantité
          </label>
          <input
            id="position-quantity"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            autoComplete="off"
            placeholder="0,05"
            aria-invalid={errors.quantity ? true : undefined}
            aria-describedby={errors.quantity ? "position-quantity-error" : "position-quantity-hint"}
            className={`${field} tabular-nums`}
          />
          {errors.quantity ? (
            <p id="position-quantity-error" role="alert" className="text-sm text-loss">
              {errors.quantity}
            </p>
          ) : (
            mode === "SELL" && (
              <p id="position-quantity-hint" className="text-xs text-muted">
                {held ? `Vous détenez ${formatQuantity(held.quantity)} ${held.symbol}.` : normalizedSymbol ? "Vous ne détenez pas cet actif." : "Choisissez d’abord l’actif."}
              </p>
            )
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="position-price" className="text-[13px] font-semibold text-ink-soft">
            {mode === "CORRECT" ? "Prix d’achat moyen (USD)" : "Prix unitaire (USD)"}
          </label>
          <input
            id="position-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            autoComplete="off"
            placeholder="60000"
            aria-invalid={errors.price ? true : undefined}
            aria-describedby={errors.price ? "position-price-error" : undefined}
            className={`${field} tabular-nums`}
          />
          {errors.price && (
            <p id="position-price-error" role="alert" className="text-sm text-loss">
              {errors.price}
            </p>
          )}
        </div>

        {serverError && (
          <p role="alert" className="rounded-xl border border-loss/30 bg-loss/10 p-3 text-sm text-loss">
            {serverError}
          </p>
        )}

        {confirmingRemove ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white/[0.04] p-4">
            <p className="text-sm text-ink-soft">
              Retirer {normalizedSymbol} de votre portefeuille ? Cela n’efface pas l’historique de vos ordres.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={confirmRemove} disabled={busy} className={`${buttonBase} bg-loss/15 text-loss hover:bg-loss/25`}>
                Oui, retirer
              </button>
              <button type="button" onClick={() => setConfirmingRemove(false)} className={`${buttonBase} border border-line text-ink-soft hover:bg-surface`}>
                Garder
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {mode === "CORRECT" && held ? (
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                disabled={busy}
                className="min-h-11 rounded-xl px-2 text-sm font-semibold text-muted hover:text-loss focus-visible:outline-2 focus-visible:outline-accent"
              >
                Retirer cette position
              </button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onClose} className={`${buttonBase} border border-line text-ink-soft hover:bg-surface`}>
                Annuler
              </button>
              <button type="submit" disabled={busy} className={`${buttonBase} bg-accent text-accent-ink`}>
                {busy ? "Enregistrement…" : SUBMIT_LABEL[mode]}
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
