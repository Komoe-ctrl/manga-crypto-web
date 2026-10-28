import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen } from "@/components/shell/StatusScreen";

export const metadata: Metadata = { title: "Page introuvable — Veille" };

export default function NotFound() {
  return (
    <StatusScreen icon={Compass} title="Page introuvable" description="Cette adresse n'existe pas ou a changé.">
      <Link href="/" className="flex h-12 items-center rounded-xl bg-accent px-6 text-sm font-bold text-accent-ink hover:brightness-110">
        Revenir au tableau de bord
      </Link>
    </StatusScreen>
  );
}
