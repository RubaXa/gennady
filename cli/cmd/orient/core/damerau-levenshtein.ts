// @file: Damerau-Levenshtein distance with adaptive threshold.
// @consumers: QueryKeyword, QueryConsumer, QueryEntity
// @tasks: TSK-55

/**
 * @purpose Compute the Damerau-Levenshtein distance between two strings.
 * @invariant Supports insertion, deletion, substitution, transposition; distance 0 for identical strings.
 * @param a First string.
 * @param b Second string.
 * @returns Edit distance (non-negative integer).
 */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  const d: number[][] = [];
  for (let i = 0; i <= m; i++) {
    d[i] = [];
    d[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      // #region START_COST_CALCULATION — invariant: substitution cost 0 for same char, 1 otherwise
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );
      // #endregion END_COST_CALCULATION

      // #region START_TRANSPOSITION_CHECK — invariant: transpose adjacent chars reduces cost
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
      // #endregion END_TRANSPOSITION_CHECK
    }
  }

  return d[m][n];
}

/**
 * @purpose Determine if two strings match within the fuzzy threshold.
 * @invariant Threshold <=2 for strings of length <=5; <=3 for length >5.
 * @param query Requested term.
 * @param candidate Indexed term to compare against.
 * @returns True when DL distance is within the applicable threshold.
 */
export function isFuzzyMatch(query: string, candidate: string): boolean {
  const distance = damerauLevenshtein(query, candidate);
  const threshold = query.length <= 5 ? 2 : 3;
  return distance <= threshold;
}

/**
 * @purpose Compute DL distance and return it with the match verdict.
 * @param query Requested term.
 * @param candidate Indexed term to compare against.
 * @returns Distance value and whether it is within the threshold.
 */
export function fuzzyDistance(
  query: string,
  candidate: string
): { distance: number; match: boolean } {
  const distance = damerauLevenshtein(query, candidate);
  const threshold = query.length <= 5 ? 2 : 3;
  return { distance, match: distance <= threshold };
}
