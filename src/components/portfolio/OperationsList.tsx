"use client";

import type { OperationDto } from "@/lib/api/types.gen";
import { TONE_CLASS, formatSigned, tone } from "@/lib/format";
import { describeOperation, describeRealized, realizedTone, sourceLabel } from "@/lib/operations";
import { usePrivacy } from "@/lib/privacy";
import { formatDateTime } from "@/lib/time";

/** Cumul du résultat réalisé : le signe et la couleur disent s'il s'agit d'un gain ou d'une perte. */
export function RealizedTotal({ value, currency, label = "Résultat réalisé cumulé" }: { value: string; currency: string; label?: string }) {
  const { mask } = usePrivacy();
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted">
      {label}
      <span className={`text-base font-bold tabular-nums ${TONE_CLASS[tone(value)]}`} data-testid="realized-total">
        {mask(formatSigned(value, currency))}
      </span>
    </p>
  );
}

/** Liste d'opérations : une phrase, la date, l'origine (« Ordre »), et le résultat réalisé d'une vente. */
export function OperationsList({ items, currency, label }: { items: readonly OperationDto[]; currency: string; label: string }) {
  const { mask } = usePrivacy();
  return (
    <ul aria-label={label}>
      {items.map((operation) => {
        const source = sourceLabel(operation);
        const realized = describeRealized(operation, currency);
        return (
          <li key={operation.id} className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0">
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold">{describeOperation(operation, currency, mask)}</span>
              {realized && (
                <span
                  className={`shrink-0 font-bold tabular-nums ${TONE_CLASS[realizedTone(operation)]}`}
                  aria-label={`Résultat réalisé : ${mask(realized)}`}
                >
                  {mask(realized)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 text-[13px] text-muted">
              <span>{formatDateTime(operation.createdAt)}</span>
              {source && <span>{source}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
