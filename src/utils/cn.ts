/**
 * Conditional class name join.
 *
 * A dependency-free stand-in for `clsx` — falsy entries are dropped so
 * `cn('base', active && 'ring')` reads naturally in JSX.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
