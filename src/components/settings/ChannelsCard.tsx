"use client";

import { Mail, Send, Smartphone } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Glass } from "@/components/ui/glass";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import type { NotificationSettingsDto } from "@/lib/api/types.gen";
import { useUpdateSettings } from "@/lib/queries/settings";
import { PushControl } from "./PushControl";
import { TestMessage } from "./TestMessage";

const field =
  "h-12 w-full rounded-xl border border-white/[0.12] bg-field px-3.5 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const TELEGRAM_ID = /^-?\d{1,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Les trois canaux par lesquels une alerte peut vous atteindre : Push, Telegram et email. */
export function ChannelsCard({ settings, accountEmail }: { settings: NotificationSettingsDto; accountEmail: string }) {
  const update = useUpdateSettings();
  const { notify } = useToast();

  /** Telegram n'a de sens qu'avec une conversation : on le dit avant d'envoyer, l'API le refuserait de toute façon. */
  const toggleTelegram = (next: boolean) => {
    if (next && !settings.telegramChatId) {
      notify("Renseignez d'abord votre identifiant de conversation Telegram.", "error");
      return;
    }
    update.mutate({ telegramEnabled: next });
  };

  return (
    <Glass aria-labelledby="channels-title" className="flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-0.5">
        <h2 id="channels-title" className="text-lg font-bold">
          Canaux de notification
        </h2>
        <span className="text-[13px] text-muted">Par où vos alertes vous atteignent.</span>
      </div>

      <Channel icon={<Smartphone className="h-[18px] w-[18px]" aria-hidden="true" />} id="push" title="Push" checked={settings.pushEnabled} onChange={(next) => update.mutate({ pushEnabled: next })}>
        <PushControl />
      </Channel>

      <Channel icon={<Send className="h-[18px] w-[18px]" aria-hidden="true" />} id="telegram" title="Telegram" checked={settings.telegramEnabled} onChange={toggleTelegram}>
        <TextSetting
          key={settings.telegramChatId ?? ""}
          id="telegram-chat"
          label="Identifiant de conversation"
          hint="Un nombre : écrivez à votre robot Telegram, puis demandez-le à @userinfobot."
          initial={settings.telegramChatId ?? ""}
          inputMode="numeric"
          validate={(value) => (value === "" || TELEGRAM_ID.test(value) ? null : "L'identifiant est un nombre.")}
          onCommit={(value) => update.mutate({ telegramChatId: value === "" ? null : value })}
        />
      </Channel>

      <Channel icon={<Mail className="h-[18px] w-[18px]" aria-hidden="true" />} id="email" title="Email" checked={settings.emailEnabled} onChange={(next) => update.mutate({ emailEnabled: next })}>
        <TextSetting
          key={settings.notificationEmail ?? ""}
          id="notification-email"
          label="Adresse de destination"
          hint={`Laissez vide pour utiliser l'adresse de votre compte (${accountEmail}).`}
          initial={settings.notificationEmail ?? ""}
          type="email"
          validate={(value) => (value === "" || EMAIL.test(value) ? null : "Saisissez une adresse e-mail valide.")}
          onCommit={(value) => update.mutate({ notificationEmail: value === "" ? null : value })}
        />
      </Channel>

      <TestMessage />
    </Glass>
  );
}

function Channel({
  icon,
  id,
  title,
  checked,
  onChange,
  children,
}: {
  icon: ReactNode;
  id: string;
  title: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-ink">{icon}</span>
          <span id={`channel-${id}`} className="text-[15px] font-bold">
            {title}
          </span>
        </div>
        <Switch checked={checked} onChange={onChange} labelledBy={`channel-${id}`} />
      </div>
      {children}
    </div>
  );
}

/** Champ texte enregistré quand on le quitte (pas à chaque frappe), avec sa validation. */
function TextSetting({
  id,
  label,
  hint,
  initial,
  type = "text",
  inputMode,
  validate,
  onCommit,
}: {
  id: string;
  label: string;
  hint: string;
  initial: string;
  type?: string;
  inputMode?: "numeric";
  validate: (value: string) => string | null;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const trimmed = value.trim();
    const problem = validate(trimmed);
    setError(problem);
    if (!problem && trimmed !== initial) onCommit(trimmed);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-soft">
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={`${id}-help`}
        className={field}
      />
      <span id={`${id}-help`} className={`text-xs ${error ? "text-loss" : "text-muted"}`} role={error ? "alert" : undefined}>
        {error ?? hint}
      </span>
    </div>
  );
}
