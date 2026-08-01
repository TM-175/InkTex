/** Form controls shared by the settings and project dialogs. */

import { useId, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

interface FieldProps {
  label: string;
  description?: string;
  children: ReactNode;
  /** Stack the control beneath the label instead of beside it. */
  stacked?: boolean;
}

/** Label plus optional help text, with the control aligned to the right. */
export function Field({ label, description, children, stacked = false }: FieldProps) {
  if (stacked) {
    return (
      <div className="py-3">
        <div className="mb-2">
          <div className="text-sm font-medium text-content-primary">{label}</div>
          {description !== undefined && (
            <p className="mt-0.5 text-xs text-content-muted">{description}</p>
          )}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-content-primary">{label}</div>
        {description !== undefined && (
          <p className="mt-0.5 text-xs leading-relaxed text-content-muted">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-border-strong',
      )}
    >
      <span
        className={cn(
          'inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[1.125rem]' : 'translate-x-[0.1875rem]',
        )}
      />
    </button>
  );
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled = false,
  className,
}: SelectProps<T>) {
  return (
    <div className={cn('relative', className)}>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className={cn(
          'h-8 w-full appearance-none rounded-md border border-border-subtle bg-surface-base',
          'py-0 pr-8 pl-2.5 text-sm text-content-primary transition-colors',
          'hover:border-border-strong focus:border-accent focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-content-muted" />
    </div>
  );
}

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min: number;
  max: number;
  step?: number;
  /** Rendered inside the field, e.g. `px` or `ms`. */
  suffix?: string;
}

export function NumberInput({
  value,
  onChange,
  label,
  min,
  max,
  step = 1,
  suffix,
}: NumberInputProps) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          // An empty field parses as NaN; ignore it until a digit is typed.
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        className={cn(
          'h-8 w-20 rounded-md border border-border-subtle bg-surface-base px-2.5 text-sm',
          'text-content-primary transition-colors hover:border-border-strong',
          'focus:border-accent focus:outline-none',
        )}
      />
      {suffix !== undefined && (
        <span className="text-xs text-content-muted">{suffix}</span>
      )}
    </div>
  );
}

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  invalid?: boolean;
}

export function TextInput({
  value,
  onChange,
  label,
  placeholder,
  autoFocus = false,
  className,
  onKeyDown,
  invalid = false,
}: TextInputProps) {
  return (
    <input
      type="text"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      // eslint-disable-next-line jsx-a11y/no-autofocus -- dialogs open for typing
      autoFocus={autoFocus}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      className={cn(
        'h-8 rounded-md border bg-surface-base px-2.5 text-sm text-content-primary',
        'transition-colors placeholder:text-content-muted focus:outline-none',
        invalid
          ? 'border-rose-500 focus:border-rose-500'
          : 'border-border-subtle hover:border-border-strong focus:border-accent',
        className,
      )}
    />
  );
}

interface RadioCardsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; description?: string }[];
  label: string;
}

/** Segmented single-choice control, used for compact enum settings. */
export function RadioCards<T extends string>({
  value,
  onChange,
  options,
  label,
}: RadioCardsProps<T>) {
  const groupId = useId();

  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            id={`${groupId}-${option.value}`}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
              selected
                ? 'border-accent bg-accent-soft'
                : 'border-border-subtle hover:border-border-strong hover:bg-surface-hover',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-accent bg-accent text-white' : 'border-border-strong',
              )}
            >
              {selected && <Check className="size-2.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-content-primary">
                {option.label}
              </span>
              {option.description !== undefined && (
                <span className="mt-0.5 block text-xs text-content-muted">
                  {option.description}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Titled group of related settings. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-2">
      <h3 className="mb-1 text-[0.6875rem] font-semibold tracking-wider text-content-muted uppercase">
        {title}
      </h3>
      <div className="divide-y divide-border-subtle">{children}</div>
    </section>
  );
}
