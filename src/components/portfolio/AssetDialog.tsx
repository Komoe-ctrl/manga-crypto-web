"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Sparkline } from "@/components/ui/Sparkline";
import type { AssetTrendDto, AssetValuationDto } from "@/lib/api/types.gen";
import { describeAlert } from "@/lib/alerts";
import { TONE_CLASS, assetBadge, assetHue, formatMoney, formatPercent, formatPrice, formatQuantity, formatSigned, formatWeight, tone } from "@/lib/format";
import type { PositionMode } from "@/lib/positions";
import { usePrivacy } from "@/lib/privacy";
import { useAlerts } from "@/lib/queries/alerts";
import { useOperations } from "@/lib/queries/operations";
import { OperationsList, RealizedTotal } from "./OperationsList";

const action =
  "min-h-11 flex-1 rounded-xl border border-line px-4 text-sm font-bold text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

interface AssetDialogProps {
  asset: AssetValuationDto;
  /** Variation et courbe ; absente pour la trésorerie en USDT ou tant que les tendances ne sont pas chargées. */
  trend?: AssetTrendDto;
  currency: string;
  onClose: () => void;
  /** Ouvre la déclaration d'une opération sur cet actif (achat, vente ou correction). */
  onAction: (mode: PositionMode) => void;
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-line bg-white/[0.04] p-3.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-[15px] font-bold tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * Fiche d'un actif : le prix et ses variations, une grande courbe, la position, les dernières opérations de cet actif avec
 * son résultat réalisé, ses alertes, et de quoi acheter, vendre ou corriger. Tout vient de données déjà chargées ou de
 * requêtes qui se relisent seules après une opération.
 */
export function AssetDialog({ asset, trend, currency, onClose, onAction }: AssetDialogProps) {
  const { mask } = usePrivacy();
  const operations = useOperations({ symbol: asset.symbol, pageSize: 5 });
  const alerts = useAlerts();
  const mine = (alerts.data ?? []).filter((alert) => alert.assetSymbol === asset.symbol);
  const change24 = trend?.change24hPct ?? null;
  const change7 = trend?.change7dPct ?? null;
  const hue = assetHue(asset.symbol);
  const pnlTone = TONE_CLASS[tone(asset.pnl)];

  return (
    <Modal titleId="asset-title" onClose={onClose}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold"
          style={{ color: `hsl(${hue} 60% 72%)`, background: `hsl(${hue} 60% 68% / 0.14)` }}
        >
          {assetBadge(asset.symbol)}
        </span>
        <div className="flex flex-col">
          <h2 id="asset-title" className="text-lg font-extrabold">
            {asset.symbol}
          </h2>
          <span className="text-[13px] tabular-nums text-muted">{formatPrice(asset.currentPrice, currency)}</span>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-white/[0.04] p-4">
        {trend && trend.sparkline.length > 1 ? (
          <Sparkline
            values={trend.sparkline}
            width={340}
            height={96}
            label={change7 ? `${asset.symbol} sur 7 jours : ${formatPercent(change7)}` : `${asset.symbol} depuis son introduction récente`}
          />
        ) : (
          <p className="text-[13px] text-muted">Pas de courbe pour cet actif (trésorerie en USDT, ou prix indisponible).</p>
        )}
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">24 h</dt>
            <dd className={`font-bold tabular-nums ${change24 ? TONE_CLASS[tone(change24)] : "text-muted"}`}>{change24 ? formatPercent(change24) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">7 jours</dt>
            <dd className={`font-bold tabular-nums ${change7 ? TONE_CLASS[tone(change7)] : "text-muted"}`}>{change7 ? formatPercent(change7) : "—"}</dd>
          </div>
        </dl>
      </div>

      <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-wider text-muted">Ma position</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        <Figure label="Quantité">{mask(formatQuantity(asset.quantity))}</Figure>
        <Figure label="Prix d’achat moyen">{mask(formatPrice(asset.avgBuyPrice, currency))}</Figure>
        <Figure label="Valeur">{mask(formatMoney(asset.value, currency))}</Figure>
        <Figure label="Part du portefeuille">{formatWeight(asset.weightPct)}</Figure>
        <div className="col-span-2 flex flex-col gap-0.5 rounded-2xl border border-line bg-white/[0.04] p-3.5">
          <dt className="text-xs text-muted">Résultat latent (depuis l’achat)</dt>
          <dd className={`text-[15px] font-bold tabular-nums ${pnlTone}`}>
            {mask(formatSigned(asset.pnl, currency))} · {formatPercent(asset.pnlPct)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onAction("BUY")} className={action}>
          Acheter
        </button>
        <button type="button" onClick={() => onAction("SELL")} className={action}>
          Vendre
        </button>
        <button type="button" onClick={() => onAction("CORRECT")} className={action}>
          Corriger
        </button>
      </div>

      <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-muted">Opérations sur {asset.symbol}</h3>
      <div className="mt-2 flex flex-col gap-2">
        {operations.isPending ? (
          <p aria-busy="true" className="text-sm text-muted">
            Chargement…
          </p>
        ) : operations.error || operations.realizedTotal === null ? (
          <p role="alert" className="text-sm text-loss">
            Impossible de charger les opérations.
          </p>
        ) : operations.items.length === 0 ? (
          <p className="text-sm text-muted">Aucune opération enregistrée sur cet actif. L’historique commence à la mise en service.</p>
        ) : (
          <>
            <RealizedTotal value={operations.realizedTotal} currency={currency} label={`Résultat réalisé sur ${asset.symbol}`} />
            <OperationsList items={operations.items} currency={currency} label={`Opérations sur ${asset.symbol}`} />
            <Link href="/historique" className="self-start text-sm font-bold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
              Tout l’historique
            </Link>
          </>
        )}
      </div>

      <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-muted">Alertes sur {asset.symbol}</h3>
      <div className="mt-2 flex flex-col gap-2">
        {alerts.isPending ? (
          <p aria-busy="true" className="text-sm text-muted">
            Chargement…
          </p>
        ) : alerts.error ? (
          <p role="alert" className="text-sm text-loss">
            Impossible de charger les alertes.
          </p>
        ) : mine.length === 0 ? (
          <p className="text-sm text-muted">
            Aucune alerte sur cet actif.{" "}
            <Link href="/alertes" className="font-bold text-accent hover:underline">
              Créer une alerte
            </Link>
          </p>
        ) : (
          <ul aria-label={`Alertes sur ${asset.symbol}`} className="flex flex-col gap-1.5 text-sm">
            {mine.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{describeAlert(alert)}</span>
                <span className="text-[13px] text-muted">{!alert.isActive ? "En pause" : alert.isTriggered ? "Déclenchée" : "Armée"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-line px-5 text-sm font-bold text-ink-soft hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent">
          Fermer
        </button>
      </div>
    </Modal>
  );
}
