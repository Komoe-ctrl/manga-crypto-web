interface SegmentedProps<T extends string> {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** Choix exclusif en boutons (« Tous / En gain / En perte ») : accessible au clavier, état annoncé par `aria-pressed`. */
export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`min-h-10 flex-1 rounded-[10px] px-3.5 text-[13px] font-bold transition-colors ${
            value === key ? "bg-white/[0.12] text-ink" : "text-muted hover:text-ink-soft"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
