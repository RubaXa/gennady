// @file: Query files by keyword — S4 scenario with exact, prefix, and fuzzy scoring.
// @consumers: OrientCommand
// @tasks: TSK-55

import type { ScannedFile, KeywordMatch, FileWordRef } from '../orient.types.ts';
import { damerauLevenshtein } from './damerau-levenshtein.ts';

/**
 * @purpose Search files by keyword with three-level scoring: exact (+10), prefix (+5), fuzzy (+3).
 * @invariant AND semantics across tokens; scoring: exact (+10) > prefix (+5) > fuzzy (+3).
 * @param files All scanned project files.
 * @param index Inverted word index built by buildIndex.
 * @param query Lowercased keyword query.
 * @returns Scored keyword matches sorted by relevance descending.
 */
export function queryKeyword(
  files: ScannedFile[],
  index: Map<string, Set<FileWordRef>>,
  query: string
): KeywordMatch[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const fileMap = new Map<string, ScannedFile>();
  for (const f of files) {
    fileMap.set(f.absPath, f);
  }

  const scoreMap = new Map<string, { score: number; entityName?: string }>();

  // #region START_MATCH_LOOP — invariant: each token contributes score; AND behavior across tokens
  const matchingFileSets: Set<string>[] = [];

  for (const token of tokens) {
    const tokenFileSet = new Set<string>();

    // exact — same word in index
    const exactRefs = index.get(token);
    if (exactRefs) {
      for (const ref of exactRefs) {
        tokenFileSet.add(ref.file);
        const cur = scoreMap.get(ref.file) ?? { score: 0 };
        cur.score += 10;
        if (ref.source === 'entity' && ref.entity) {
          cur.entityName = ref.entity;
        }
        scoreMap.set(ref.file, cur);
      }
    }

    // prefix — words starting with token
    for (const [word, refs] of index) {
      if (word === token) continue;
      if (!word.startsWith(token)) continue;
      for (const ref of refs) {
        tokenFileSet.add(ref.file);
        const cur = scoreMap.get(ref.file) ?? { score: 0 };
        cur.score += 5;
        if (ref.source === 'entity' && ref.entity && !cur.entityName) {
          cur.entityName = ref.entity;
        }
        scoreMap.set(ref.file, cur);
      }
    }

    // fuzzy — DL within threshold
    for (const [word, refs] of index) {
      const threshold = token.length <= 5 ? 2 : 3;
      if (
        damerauLevenshtein(token, word) <= threshold &&
        word !== token &&
        !word.startsWith(token)
      ) {
        for (const ref of refs) {
          tokenFileSet.add(ref.file);
          const cur = scoreMap.get(ref.file) ?? { score: 0 };
          cur.score += 3;
          if (ref.source === 'entity' && ref.entity && !cur.entityName) {
            cur.entityName = ref.entity;
          }
          scoreMap.set(ref.file, cur);
        }
      }
    }

    matchingFileSets.push(tokenFileSet);
  }
  // #endregion END_MATCH_LOOP

  // #region START_AND_FILTER — invariant: multi-word AND — files must match ALL tokens
  let resultFiles = new Set<string>();
  if (matchingFileSets.length > 0) {
    resultFiles = matchingFileSets[0];
    for (let i = 1; i < matchingFileSets.length; i++) {
      resultFiles = new Set([...resultFiles].filter((f) => matchingFileSets[i].has(f)));
    }
  }
  // #endregion END_AND_FILTER

  const results: KeywordMatch[] = [];
  for (const absPath of resultFiles) {
    const file = fileMap.get(absPath);
    if (!file) continue;
    const entry = scoreMap.get(absPath);
    results.push({
      file,
      score: entry?.score ?? 0,
      entityName: entry?.entityName,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
