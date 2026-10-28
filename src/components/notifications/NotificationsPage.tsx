"use client";

import { Bell, Check, CheckCheck, Moon, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageColumn, PageHeader } from "@/components/shell/PageHeader";
import { Glass } from "@/components/ui/glass";
import { CardError, CardLoading } from "@/components/ui/query-state";
import type { NotificationDto } from "@/lib/api/types.gen";
import { useAuth } from "@/lib/auth/auth-provider";
import { CHANNEL_LABEL, describeFailure } from "@/lib/delivery";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/lib/queries/notifications";
import { formatDateTime } from "@/lib/time";

const FILTER =
  "min-h-10 rounded-[10px] px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Boîte de réception : tout ce que Veille a envoyé, ce qui a été retenu pour la nuit, et ce qui n'est pas encore lu. */
export function NotificationsPage() {
  return (
    <PageColumn>
      <PageHeader icon={Bell} title="Notifications" description="Tout ce que Veille vous a envoyé, et où c'est arrivé." />
      <NotificationsContent />
    </PageColumn>
  );
}

function NotificationsContent() {
  const { state } = useAuth();
  const timeZone = state.status === "authenticated" ? state.user.timezone : undefined;
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { items, unreadCount, isPending, error, refetch, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotifications({
    unreadOnly,
  });
  const markAll = useMarkAllNotificationsRead();

  return (
    <Glass aria-labelledby="notifications-title" className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="notifications-title" className="text-lg font-bold">
          Boîte de réception
          {unreadCount > 0 && (
            <span className="ml-2 text-sm font-semibold text-accent">
              {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={unreadCount === 0 || markAll.isPending}
          className="flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.12] px-4 text-sm font-bold text-ink-soft hover:bg-white/[0.07] disabled:opacity-50"
        >
          <CheckCheck className="h-4 w-4" aria-hidden="true" />
          Tout marquer comme lu
        </button>
      </div>

      <div role="group" aria-label="Filtre" className="flex w-fit gap-1 rounded-2xl border border-line bg-surface p-1">
        {([false, true] as const).map((only) => (
          <button
            key={String(only)}
            type="button"
            aria-pressed={unreadOnly === only}
            onClick={() => setUnreadOnly(only)}
            className={`${FILTER} ${unreadOnly === only ? "bg-white/[0.1] text-ink" : "text-muted hover:text-ink-soft"}`}
          >
            {only ? "Non lues" : "Toutes"}
          </button>
        ))}
      </div>

      {markAll.isError && (
        <p role="alert" className="text-sm text-loss">
          Impossible de tout marquer comme lu. Réessayez.
        </p>
      )}

      {isPending ? (
        <CardLoading>Chargement de vos notifications…</CardLoading>
      ) : error ? (
        <CardError onRetry={() => void refetch()} retrying={isFetching}>
          Impossible de charger vos notifications.
        </CardError>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-4 text-sm text-muted">
          <Bell className="h-6 w-6 text-calm" aria-hidden="true" />
          <p>{unreadOnly ? "Tout est lu." : "Rien pour l'instant. Les alertes et le rapport du matin apparaîtront ici."}</p>
        </div>
      ) : (
        <ul aria-label="Notifications">
          {items.map((item) => (
            <NotificationRow key={item.id} item={item} timeZone={timeZone} />
          ))}
        </ul>
      )}

      {hasNextPage && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="min-h-11 self-center rounded-xl border border-line px-5 text-sm font-bold text-ink-soft hover:bg-surface disabled:opacity-60"
        >
          {isFetchingNextPage ? "Chargement…" : "Charger plus"}
        </button>
      )}
    </Glass>
  );
}

function NotificationRow({ item, timeZone }: { item: NotificationDto; timeZone?: string }) {
  const markRead = useMarkNotificationRead();
  const unread = item.readAt === null;

  return (
    <li className="flex flex-col gap-2 border-t border-line py-4 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {unread && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-accent">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
                Non lue
              </span>
            )}
            {item.critical && <span className="rounded-full bg-loss/15 px-2 py-0.5 text-xs font-bold text-loss">Critique</span>}
            <span>{item.title}</span>
          </p>
          {item.body && <p className="text-sm text-ink-soft">{item.body}</p>}
          <p className="text-xs text-muted">{formatDateTime(item.createdAt, timeZone)}</p>
        </div>
        {unread && (
          <button
            type="button"
            onClick={() => markRead.mutate(item.id)}
            disabled={markRead.isPending}
            aria-label={`Marquer comme lue : ${item.title}`}
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-[13px] font-bold text-ink-soft hover:bg-surface disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline" aria-hidden="true">
              Marquer comme lue
            </span>
          </button>
        )}
      </div>
      <Where item={item} />
    </li>
  );
}

/** Où la notification est arrivée : retenue pour la nuit, reprise dans le rapport, ou canal par canal avec la raison d'un échec. */
function Where({ item }: { item: NotificationDto }) {
  if (item.status === "HELD") {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted">
        <Moon className="h-4 w-4 shrink-0 text-calm" aria-hidden="true" />
        Retenue par le Mode Nuit : elle sera reprise dans votre rapport du matin.
      </p>
    );
  }
  if (item.status === "DIGESTED") {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted">
        <Moon className="h-4 w-4 shrink-0 text-calm" aria-hidden="true" />
        <span>
          Reprise dans votre rapport du matin.{" "}
          <Link href="/rapports" className="font-semibold text-accent underline-offset-2 hover:underline">
            Voir les rapports
          </Link>
        </span>
      </p>
    );
  }
  if (item.deliveries.length === 0) return <p className="text-[13px] text-muted">Aucun canal n’était activé : visible ici seulement.</p>;
  return (
    <ul aria-label="Envoi par canal" className="flex flex-col gap-1">
      {item.deliveries.map((delivery) => (
        <li key={delivery.channel} className="flex items-start gap-2 text-[13px]">
          {delivery.status === "SENT" ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-gain" aria-hidden="true" />
          ) : (
            <X className="mt-0.5 h-4 w-4 shrink-0 text-loss" aria-hidden="true" />
          )}
          <span className="text-ink-soft">
            <strong className="font-semibold">{CHANNEL_LABEL[delivery.channel]}</strong>
            {delivery.status === "SENT" ? " : envoyé" : ` : non envoyé. ${describeFailure(delivery.reason)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
