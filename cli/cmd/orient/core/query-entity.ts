// @file: Query exported entities by name — S6 scenario with exact and fuzzy matching.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { ScannedFile, EntityMatch } from '../orient.types.ts';
import { damerauLevenshtein } from './damerau-levenshtein.ts';

/**
 * @purpose Find exported entities by name — exact match or fuzzy via DL distance.
 * @invariant Only exported entities are matched — class methods are NOT included.
 * @invariant Fuzzy threshold: <=2 for short (<=5 chars), <=3 for long (>5).
 * @param files All scanned project files.
 * @param entityNames One or more entity names to search for.
 * @param useFuzzy When true, use DL for fuzzy matching.
 * @returns Matched entities with their file and contract info.
 */
export function queryEntity(
  files: ScannedFile[],
  entityNames: string[],
  useFuzzy: boolean
): EntityMatch[] {
  if (entityNames.length === 0) return [];

  const results: EntityMatch[] = [];

  for (const f of files) {
    for (const exp of f.exports) {
      for (const name of entityNames) {
        if (!useFuzzy && exp.name === name) {
          results.push({
            name: exp.name,
            kind: exp.kind,
            filePath: f.absPath,
            contract: exp.contract,
            fuzzy: false,
          });
          continue;
        }

        if (useFuzzy) {
          const threshold = name.length <= 5 ? 2 : 3;
          const distance = damerauLevenshtein(name.toLowerCase(), exp.name.toLowerCase());
          if (distance <= threshold) {
            results.push({
              name: exp.name,
              kind: exp.kind,
              filePath: f.absPath,
              contract: exp.contract,
              fuzzy: true,
              distance,
            });
          }
        }
      }
    }
  }

  return results;
}
