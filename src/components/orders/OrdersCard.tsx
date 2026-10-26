"use client";

import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Glass } from "@/components/ui/glass";
import { CardError, CardLoading } from "@/components/ui/query-state";
import type { OrderDto } from "@/lib/api/types.gen";
import { TONE_CLASS, formatPrice, formatQuantity } from "@/lib/format";
import { ORIGIN_LABEL, SIDE_LABEL, STATUS_LABEL, baseAsset, describeFailure, statusTone } from "@/lib/orders";
import { usePrivacy } from "@/lib/privacy";
import { useOrders } from "@/lib/queries/orders";
import { usePortfolio } from "@/lib/queries/portfolio";
import { useTradingStatus } from "@/lib/queries/risk";
import { formatDateTime } from "@/lib/time";
import { OrderDialog } from "./OrderDialog";

const DEFAULT_SYMBOLS = ["BTC", "ETH", "SOL"];

function OrderRow({ order }: { order: OrderDto }) {
  const { mask } = usePrivacy();
  const tone = statusTone(order.status);
  const failed = order.status === "REJECTED" || order.status === "FAILED";
  return (
    <li className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">
          {SIDE_LABEL[order.side]} {baseAsset(order.symbol)} <span className="font-normal tabular-nums text-ink-soft">{mask(formatQuantity(order.quantity))}</span>
        </span>
        <span className={`text-sm font-bold ${TONE_CLASS[tone]}`}>{STATUS_LABEL[order.status]}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 text-[13px] text-muted">
        <span>{formatDateTime(order.createdAt)}</span>
        <span>{ORIGIN_LABEL[order.origin]}</span>
        {order.mode === "PAPER" && <span>Simulation</span>}
        {order.avgFillPrice && <span className="tabular-nums">à {mask(formatPrice(order.avgFillPrice))}</span>}
      </div>
      {failed && <p className="text-[13px] text-loss">{describeFailure(order.failureReason)}</p>}
    </li>
  );
}

/** Derniers ordres et accès au dialogue d'ordre manuel. */
export function OrdersCard() {
  const orders = useOrders();
  const status = useTradingStatus();
  const portfolio = usePortfolio();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  if (orders.isPending) return <CardLoading>Chargement de vos ordres…</CardLoading>;
  if (orders.error || !orders.data) {
    return (
      <CardError onRetry={() => void orders.refetch()} retrying={orders.isFetching}>
        Impossible de charger vos ordres.
      </CardError>
    );
  }

  const held = (portfolio.data?.assets ?? []).map((a) => a.symbol).filter((s) => s !== "USDT");
  const symbols = [...new Set([...held, ...DEFAULT_SYMBOLS])];
  const items = orders.data.items;

  return (
    <Glass aria-labelledby="orders-title" className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="orders-title" className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Derniers ordres
        </h2>
        <button
          ref={opener}
          type="button"
          onClick={() => setOpen(true)}
          disabled={!status.data}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-bold text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Passer un ordre
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">Aucun ordre pour l’instant. Les achats et ventes du robot ou les vôtres apparaîtront ici.</p>
      ) : (
        <ul>
          {items.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </ul>
      )}

      {open && status.data && <OrderDialog symbols={symbols} status={status.data} onClose={() => setOpen(false)} returnFocusRef={opener} />}
    </Glass>
  );
}
