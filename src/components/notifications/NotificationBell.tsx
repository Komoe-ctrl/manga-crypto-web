"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadNotifications } from "@/lib/queries/notifications";

/**
 * Cloche de l'en-tête : mène à la boîte de réception et affiche le nombre de non lues. Le compte est écrit dans le nom
 * accessible : la pastille seule ne dirait rien à un lecteur d'écran.
 */
export function NotificationBell() {
  const unread = useUnreadNotifications();
  const current = usePathname().startsWith("/notifications");
  const label = unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications";

  return (
    <Link
      href="/notifications"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={`relative flex h-10 w-10 items-center justify-center rounded-xl border border-line transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        current ? "bg-white/[0.1] text-ink" : "bg-surface text-ink-soft"
      }`}
    >
      <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-extrabold tabular-nums text-accent-ink ring-2 ring-canvas"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
