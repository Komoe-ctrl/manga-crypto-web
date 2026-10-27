"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadDigests } from "@/lib/queries/digests";

interface NavItem {
  href: string;
  label: string;
  /** Libellé court sous 640 px, où « Tableau de bord » ne tient pas sur la barre. Le nom accessible reste `label`. */
  short?: string;
}

const ITEMS: readonly NavItem[] = [
  { href: "/", label: "Tableau de bord", short: "Accueil" },
  { href: "/alertes", label: "Alertes" },
  { href: "/rapports", label: "Rapports" },
  { href: "/reglages", label: "Réglages" },
];

/** Navigation principale : la page courante est annoncée (`aria-current`), les rapports non lus ont une pastille. */
export function AppNav() {
  const pathname = usePathname();
  const unread = useUnreadDigests();

  return (
    // Une seule ligne, même sur téléphone : texte et marges réduits sous 640 px, défilement horizontal en dernier recours.
    <nav aria-label="Navigation principale" className="flex w-full gap-0.5 overflow-x-auto rounded-2xl border border-line bg-surface p-1 backdrop-blur-xl sm:w-auto sm:gap-1">
      {ITEMS.map(({ href, label, short }) => {
        const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            aria-label={short ? label : undefined}
            className={`flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] px-2 text-[13px] font-bold transition-colors sm:px-4 sm:text-sm ${
              current ? "bg-white/[0.12] text-ink" : "text-muted hover:text-ink-soft"
            }`}
          >
            {short ? (
              <>
                <span aria-hidden="true" className="sm:hidden">
                  {short}
                </span>
                <span aria-hidden="true" className="hidden sm:inline">
                  {label}
                </span>
              </>
            ) : (
              label
            )}
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
