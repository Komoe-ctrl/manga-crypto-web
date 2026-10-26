import { AppHeader } from "@/components/shell/AppHeader";
import { RequireAuth } from "@/components/shell/RequireAuth";

/** Pages réservées aux utilisateurs connectés : en-tête commun et garde d'accès. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <RequireAuth>
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-6 pb-16 pt-7">
        <AppHeader />
        {children}
      </div>
    </RequireAuth>
  );
}
