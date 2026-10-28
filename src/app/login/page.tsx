import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion — Veille" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-semibold text-accent">Votre portefeuille veille pour vous</p>
        <p className="text-balance text-sm text-muted">Suivi, alertes et rapport du matin : Veille vous prévient, sans que vous ayez à surveiller les marchés.</p>
      </div>
      <LoginForm />
      <p className="text-center text-xs text-muted">Veille ne donne pas de conseil financier. Accès sur invitation.</p>
    </main>
  );
}
