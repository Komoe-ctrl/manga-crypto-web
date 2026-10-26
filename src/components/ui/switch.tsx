interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Libellé lu par les lecteurs d'écran (ou `labelledBy` quand un titre visible existe déjà). */
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
}

/** Interrupteur de la maquette, accessible : rôle `switch`, état annoncé, utilisable au clavier. */
export function Switch({ checked, onChange, label, labelledBy, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-accent" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full transition-all duration-200 ${
          checked ? "left-6 bg-accent-ink" : "left-1 bg-ink-soft"
        }`}
      />
    </button>
  );
}
