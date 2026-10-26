import type { Metadata } from "next";
import { AlertsPage } from "@/components/alerts/AlertsPage";

export const metadata: Metadata = { title: "Alertes — Veille" };

export default function Page() {
  return <AlertsPage />;
}
