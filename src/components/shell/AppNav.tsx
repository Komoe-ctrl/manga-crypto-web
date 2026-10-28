"use client";

import { Bell, FileText, LayoutDashboard, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadDigests } from "@/lib/queries/digests";

interface NavItem {
  href: string;
  label: string;
  /** Libellé court de la barre du bas (téléphone), où « Tableau de bord » ne tient pas. Le nom accessible reste `label`. */
  short?: string;
  icon: LucideIcon;
}

const ITEMS: readonly NavItem[] = [
  { href: "/", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard },
  { href: "/alertes", label: "Alertes", icon: Bell },
  { href: "/rapports", label: "Rapports", icon: FileText },
  { href: "/reglages", label: "Réglages", icon: Settings },
];

/** Ordinateur : les liens dans l'en-tête. Téléphone : la barre fixée en bas de l'écran, comme une application. */
export type NavVariant = "top" | "bottom";

/**
 * Navigation principale : la page courante est annoncée (`aria-current`), les rapports non lus ont une pastille, et
 * chaque lien a son icône (décorative : le texte porte le sens). Un seul exemplaire est affiché à la fois, selon la
 * largeur : jamais deux navigations dans la page.
 */
export function AppNav({ variant = "top" }: { variant?: NavVariant }) {
  const pathname = usePathname();
  const unread = useUnreadDigests();
  const bottom = variant === "bottom";

  return (
    <nav
      aria-label="Navigation principale"
      className={
        bottom
          ? "fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-canvas/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
          : "flex gap-1 rounded-2xl border border-line bg-surface p-1"
      }
    >
      <div className={bottom ? "mx-auto grid max-w-lg grid-cols-4" : "contents"}>
        {ITEMS.map(({ href, label, short, icon: Icon }) => {
          const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const showDot = href === "/rapports" && unread > 0;
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              aria-label={bottom && short ? label : undefined}
              className={
                bottom
                  ? `relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent ${
                      current ? "text-accent" : "text-muted active:text-ink-soft"
                    }`
                  : `flex min-h-10 items-center gap-2 whitespace-nowrap rounded-[10px] px-4 text-sm font-bold transition-colors ${
                      current ? "bg-white/[0.1] text-ink" : "text-muted hover:text-ink-soft"
                    }`
              }
            >
              {bottom && current && <span aria-hidden="true" className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-accent" />}
              <span className="relative">
                <Icon className={bottom ? "h-[22px] w-[22px]" : `h-4 w-4 ${current ? "text-accent" : ""}`} aria-hidden="true" />
                {showDot && bottom && <span aria-hidden="true" className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-calm ring-2 ring-canvas" />}
              </span>
              <span aria-hidden={bottom && short ? "true" : undefined}>{bottom ? (short ?? label) : label}</span>
              {showDot && (
                <>
                  {!bottom && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-calm" />}
                  <span className="sr-only">
                    {unread} non lu{unread > 1 ? "s" : ""}
                  </span>
                </>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
