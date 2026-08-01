/**
 * Split a user-entered flag string into argv, honouring shell-style quoting.
 *
 * Used for the "extra compiler arguments" setting so a value like
 * `-shell-escape -jobname="my paper"` becomes two arguments rather than three.
 */
export function parseShellArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let hasContent = false;

  for (const character of input) {
    if (escaped) {
      current += character;
      escaped = false;
      hasContent = true;
      continue;
    }

    // Backslash escapes outside single quotes, where it is literal.
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      hasContent = true;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      // An empty quoted string is still an argument.
      hasContent = true;
      continue;
    }

    if (/\s/.test(character)) {
      if (hasContent) {
        args.push(current);
        current = '';
        hasContent = false;
      }
      continue;
    }

    current += character;
    hasContent = true;
  }

  if (hasContent) args.push(current);
  return args;
}
