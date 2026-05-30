// @file: Query files by consumer name — S3 scenario with substring and fuzzy matching.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { ScannedFile, ConsumerQueryResult } from '../orient.types.ts';
import { damerauLevenshtein } from './damerau-levenshtein.ts';

/**
 * @purpose Find all files whose @consumers: header contains the given consumer name.
 * @invariant Supports exact match, substring match, and fuzzy (--fuzzy) via DL distance.
 * @param files All scanned project files.
 * @param consumerNames One or more consumer names to search for.
 * @param useFuzzy When true, use Damerau-Levenshtein for fuzzy matching.
 * @returns Grouped query results per consumer name.
 */
export function queryConsumer(
  files: ScannedFile[],
  consumerNames: string[],
  useFuzzy: boolean
): ConsumerQueryResult[] {
  if (consumerNames.length === 0) return [];

  const results: ConsumerQueryResult[] = [];

  for (const cn of consumerNames) {
    const matched = files.filter((f) => {
      if (useFuzzy) {
        return f.header.consumers.some((c) => {
          const threshold = cn.length <= 5 ? 2 : 3;
          return damerauLevenshtein(cn.toLowerCase(), c.toLowerCase()) <= threshold;
        });
      }
      return f.header.consumers.some((c) => c.toLowerCase().includes(cn.toLowerCase()));
    });

    results.push({ consumerName: cn, files: matched });
  }

  return results;
}
