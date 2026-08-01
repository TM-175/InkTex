import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Rendered before the label. */
  icon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-strong active:bg-accent-strong disabled:hover:bg-accent',
  secondary:
    'bg-surface-hover text-content-primary hover:bg-surface-active border border-border-subtle',
  ghost: 'text-content-secondary hover:bg-surface-hover hover:text-content-primary',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:hover:bg-rose-600',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also shown as the native tooltip. */
  label: string;
  children: ReactNode;
  active?: boolean;
}

/** Square, icon-only button used throughout the toolbars. */
export function IconButton({
  label,
  active = false,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-35',
        active
          ? 'bg-accent-soft text-accent'
          : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
