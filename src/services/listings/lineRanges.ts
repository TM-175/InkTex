/**
 * Line-range sets, in the `1,3-5,9` form both `minted` and `listings` use.
 *
 * The line-highlight picker works with a `Set<number>` because clicking a
 * gutter toggles one line; LaTeX wants compact ranges. These convert between
 * the two, collapsing runs so clicking lines 3 through 9 produces `3-9` rather
 * than seven separate entries.
 */

/** Parse `1,3-5` into the set of line numbers it denotes. */
export function parseLineRanges(input: string): Set<number> {
  const lines = new Set<number>();

  for (const part of input.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;

    const range = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
    if (range !== null) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      // Tolerate a reversed range rather than dropping it.
      const [low, high] = from <= to ? [from, to] : [to, from];

      // Guard against a pathological `1-999999999` locking up the UI.
      for (let line = low; line <= Math.min(high, low + 100_000); line += 1) {
        lines.add(line);
      }
      continue;
    }

    const single = Number(trimmed);
    if (Number.isInteger(single) && single > 0) lines.add(single);
  }

  return lines;
}

/** Render a set of line numbers as the shortest equivalent range list. */
export function formatLineRanges(lines: ReadonlySet<number>): string {
  const sorted = [...lines].filter((line) => Number.isInteger(line) && line > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  const parts: string[] = [];
  let start = sorted[0]!;
  let previous = start;

  const flush = (): void => {
    if (start === previous) parts.push(String(start));
    // A run of exactly two is written out; `3-4` is no shorter than `3,4` and
    // reads worse.
    else if (previous === start + 1) parts.push(`${start},${previous}`);
    else parts.push(`${start}-${previous}`);
  };

  for (const line of sorted.slice(1)) {
    if (line === previous + 1) {
      previous = line;
      continue;
    }
    flush();
    start = line;
    previous = line;
  }
  flush();

  return parts.join(',');
}

/** Toggle one line in a range string, returning the new string. */
export function toggleLine(ranges: string, line: number): string {
  const lines = parseLineRanges(ranges);

  if (lines.has(line)) lines.delete(line);
  else lines.add(line);

  return formatLineRanges(lines);
}

/** How many lines a range string covers. */
export function countLines(ranges: string): number {
  return parseLineRanges(ranges).size;
}

/**
 * A `listings` `linebackgroundcolor` expression that paints the given lines.
 *
 * `listings` has no `highlightlines` option, so feature parity with `minted`
 * means generating the conditional by hand. Continuous runs become a single
 * nested comparison rather than one test per line, which keeps the generated
 * LaTeX readable for a long selection.
 */
export function listingsHighlightExpression(ranges: string, colorName: string): string | null {
  const lines = parseLineRanges(ranges);
  if (lines.size === 0) return null;

  const sorted = [...lines].sort((a, b) => a - b);
  const conditions: string[] = [];

  let start = sorted[0]!;
  let previous = start;

  const emit = (): void => {
    if (start === previous) {
      conditions.push(`\\ifnum\\value{lstnumber}=${start}\\color{${colorName}}\\fi`);
    } else {
      conditions.push(
        `\\ifnum\\value{lstnumber}>${start - 1}\\ifnum\\value{lstnumber}<${previous + 1}` +
          `\\color{${colorName}}\\fi\\fi`,
      );
    }
  };

  for (const line of sorted.slice(1)) {
    if (line === previous + 1) {
      previous = line;
      continue;
    }
    emit();
    start = line;
    previous = line;
  }
  emit();

  return conditions.join('%\n    ');
}
