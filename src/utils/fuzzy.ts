/**
 * Subsequence fuzzy matching for the command palette and quick-open.
 *
 * Scoring favours, in order: consecutive runs, matches at word boundaries,
 * matches in the file name over the directory, and shorter candidates. That
 * ordering is what makes typing `mtex` surface `main.tex` above
 * `chapters/methodology/text.tex`.
 */

export interface FuzzyMatch {
  /** Higher is better. */
  score: number;
  /** Indices in the target that matched, for highlighting. */
  indices: number[];
}

const BOUNDARY = /[\s/\-_.]/;

/**
 * Match `query` against `target`, case-insensitively.
 *
 * @returns null when `target` does not contain the query as a subsequence.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const needle = query.trim().toLowerCase();
  if (needle === '') return { score: 0, indices: [] };

  const haystack = target.toLowerCase();
  const indices: number[] = [];

  let score = 0;
  let cursor = 0;
  let previousIndex = -1;

  for (const character of needle) {
    const found = haystack.indexOf(character, cursor);
    if (found === -1) return null;

    // Consecutive characters are a much stronger signal than scattered ones.
    if (found === previousIndex + 1) {
      score += 8;
    } else {
      // Penalise the gap, but never enough to reject a valid match.
      score -= Math.min(found - previousIndex - 1, 6);
    }

    // A match right after a separator usually starts a meaningful word.
    const preceding = found > 0 ? target[found - 1] : undefined;
    if (found === 0 || (preceding !== undefined && BOUNDARY.test(preceding))) {
      score += 10;
    }

    indices.push(found);
    previousIndex = found;
    cursor = found + 1;
  }

  // Prefer matches concentrated in the file name rather than the directory.
  const lastSlash = target.lastIndexOf('/');
  if (lastSlash !== -1) {
    const inName = indices.filter((index) => index > lastSlash).length;
    score += inName * 4;
  }

  // All else equal, a shorter target is the better answer.
  score -= Math.floor(target.length / 12);

  return { score, indices };
}

/** Filter and rank `items` by a fuzzy match on the field `key` returns. */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  key: (item: T) => string,
  limit = 100,
): { item: T; match: FuzzyMatch }[] {
  if (query.trim() === '') {
    return items.slice(0, limit).map((item) => ({ item, match: { score: 0, indices: [] } }));
  }

  const scored: { item: T; match: FuzzyMatch }[] = [];

  for (const item of items) {
    const match = fuzzyMatch(query, key(item));
    if (match !== null) scored.push({ item, match });
  }

  scored.sort((a, b) => b.match.score - a.match.score);
  return scored.slice(0, limit);
}
