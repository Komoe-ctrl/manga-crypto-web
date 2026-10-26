import type { Metadata } from "next";
import { ReportsPage } from "@/components/reports/ReportsPage";

export const metadata: Metadata = { title: "Rapports — Veille" };

export default function Page() {
  return <ReportsPage />;
}
