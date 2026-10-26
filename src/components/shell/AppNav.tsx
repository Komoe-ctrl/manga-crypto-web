"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadDigests } from "@/lib/queries/digests";

const ITEMS = [
  { href: "/", label: "Tableau de bord" },
  { href: "/rapports", label: "Rapports" },
  { href: "/reglages", label: "Réglages" },
] as const;

/** Navigation principale : la page courante est annoncée (`aria-current`), les rapports non lus ont une pastille. */
export function AppNav() {
  const pathname = usePathname();
  const unread = useUnreadDigests();

  return (
    <nav aria-label="Navigation principale" className="flex flex-wrap gap-1 rounded-2xl border border-line bg-surface p-1 backdrop-blur-xl">
      {ITEMS.map(({ href, label }) => {
        const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-bold transition-colors ${
              current ? "bg-white/[0.12] text-ink" : "text-muted hover:text-ink-soft"
            }`}
          >
            {label}
            {href === "/rapports" && unread > 0 && (
              <>
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-calm" />
                <span className="sr-only">
                  {unread} non lu{unread > 1 ? "s" : ""}
                </span>
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
