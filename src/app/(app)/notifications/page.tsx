import type { Metadata } from "next";
import { NotificationsPage } from "@/components/notifications/NotificationsPage";

export const metadata: Metadata = { title: "Notifications — Veille" };

export default function Page() {
  return <NotificationsPage />;
}
