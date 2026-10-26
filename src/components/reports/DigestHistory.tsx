import { Glass } from "@/components/ui/glass";
import type { DigestDto } from "@/lib/api/types.gen";
import { TONE_CLASS, formatPercent, tone } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

/** Historique des rapports du matin, du plus récent au plus ancien, avec la variation du portefeuille. */
export function DigestHistory({ digests, timeZone }: { digests: readonly DigestDto[]; timeZone?: string }) {
  return (
    <Glass aria-labelledby="history-title" className="flex flex-col gap-1 p-6">
      <h2 id="history-title" className="mb-2 text-lg font-bold">
        Historique des rapports
      </h2>
      {digests.length === 0 ? (
        <p className="py-2 text-sm text-muted">Votre historique apparaîtra ici, un rapport par matin.</p>
      ) : (
        <ul>
          {digests.map((digest) => (
            <li key={digest.id} className="flex justify-between gap-3 border-t border-line py-3 text-sm">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">{formatDateTime(digest.generatedAt, timeZone)}</span>
                <span className="truncate text-[13px] text-muted">{digest.summary}</span>
              </span>
              <span className={`shrink-0 font-bold tabular-nums ${TONE_CLASS[tone(digest.portfolioDeltaPct)]}`}>
                {formatPercent(digest.portfolioDeltaPct)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
}
