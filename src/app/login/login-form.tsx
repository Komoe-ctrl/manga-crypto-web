"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Glass } from "@/components/ui/glass";
import { LoginError, type LoginFailure } from "@/lib/auth";
import { useAuth } from "@/lib/auth/auth-provider";

const schema = z.object({
  email: z.email("Saisissez une adresse e-mail valide"),
  password: z.string().min(1, "Saisissez votre mot de passe"),
});
type Values = z.infer<typeof schema>;

const MESSAGES: Record<LoginFailure, string> = {
  invalid_credentials: "Adresse e-mail ou mot de passe incorrect.",
  rate_limited: "Trop de tentatives. Patientez une minute avant de réessayer.",
  unreachable: "Impossible de joindre le serveur. Vérifiez votre connexion.",
  unknown: "La connexion a échoué. Réessayez dans un instant.",
};

const field =
  "h-12 w-full rounded-xl border border-white/[0.12] bg-field px-3.5 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function LoginForm() {
  const { state, login } = useAuth();
  const router = useRouter();
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  // Déjà connecté (ou connexion réussie) : on va au tableau de bord.
  useEffect(() => {
    if (state.status === "authenticated") router.replace("/");
  }, [state.status, router]);

  const onSubmit = async ({ email, password }: Values) => {
    setFailure(null);
    try {
      await login(email, password);
    } catch (error) {
      setFailure(error instanceof LoginError ? error.reason : "unknown");
    }
  };

  return (
    <Glass aria-labelledby="login-title" className="flex flex-col gap-6 p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-accent">
          <Eye className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <h1 id="login-title" className="text-lg font-extrabold tracking-tight">
            Veille
          </h1>
          <span className="text-xs text-muted">Connexion à votre portefeuille</span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-semibold text-ink-soft">
            Adresse e-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            aria-invalid={errors.email ? "true" : "false"}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={field}
            {...register("email")}
          />
          {errors.email && (
            <span id="email-error" className="text-xs text-loss">
              {errors.email.message}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-semibold text-ink-soft">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={errors.password ? "true" : "false"}
            aria-describedby={errors.password ? "password-error" : undefined}
            className={field}
            {...register("password")}
          />
          {errors.password && (
            <span id="password-error" className="text-xs text-loss">
              {errors.password.message}
            </span>
          )}
        </div>

        {failure && (
          <p role="alert" className="text-sm text-loss">
            {MESSAGES[failure]}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="h-12 rounded-xl bg-accent text-sm font-bold text-accent-ink hover:brightness-110 disabled:opacity-60"
        >
          {isSubmitting ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </Glass>
  );
}
