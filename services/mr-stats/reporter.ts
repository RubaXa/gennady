// @file: Reporter — aggregates module results into the final MrStatsReport JSON.
// @consumers: mr-stats.cmd
// @tasks: TSK-139

import type {
  MrMetadata,
  MrStatsReport,
  MrStatsCategorySimple,
  MrStatsCategoryRealCode,
  EntityDelta,
  LineDiff,
  DuplicateReport,
} from './mr-stats.types.ts';

/**
 * @purpose Create an empty simple category with all zeros.
 * @returns MrStatsCategorySimple with all fields zeroed.
 */
export function emptySimpleCategory(): MrStatsCategorySimple {
  return { files: 0, added: 0, removed: 0 };
}

/**
 * @purpose Create an empty realCode category with all zeroed extended fields.
 * @returns MrStatsCategoryRealCode with all fields zeroed.
 */
export function emptyRealCodeCategory(): MrStatsCategoryRealCode {
  return {
    files: 0,
    added: 0,
    removed: 0,
    commentLines: { added: 0, removed: 0 },
    codeLines: { added: 0, removed: 0 },
    blankLines: { added: 0, removed: 0 },
    entities: { introduced: 0, modified: 0, removed: 0 },
    duplicates: { clonesFound: 0, clonedLines: 0, percentage: 0 },
  };
}

/**
 * @purpose Compose the final MrStatsReport from all gathered data.
 * @param metadata MR metadata with full field set.
 * @param categories Map of category name → MrStatsCategorySimple or MrStatsCategoryRealCode.
 * @param categoryOrder Canonical order of category keys for deterministic JSON output.
 * @returns MrStatsReport ready for JSON serialization.
 */
export function composeReport(
  metadata: MrMetadata,
  categories: Record<string, MrStatsCategorySimple | MrStatsCategoryRealCode>,
  categoryOrder: readonly string[]
): MrStatsReport {
  // #region START_BUILD_CATEGORIES — ensure all 10 categories present in canonical order
  const ordered: Record<string, MrStatsCategorySimple | MrStatsCategoryRealCode> = {};
  for (const name of categoryOrder) {
    ordered[name] = categories[name] ?? emptySimpleCategory();
  }
  // #endregion END_BUILD_CATEGORIES

  return { mr: metadata, categories: ordered };
}

/**
 * @purpose Build a MrStatsCategoryRealCode from the individual results of extended analysis.
 * @param files File count in realCode.
 * @param added Added lines count.
 * @param removed Removed lines count.
 * @param codeLines Code line diff from cloc.
 * @param commentLines Comment line diff from cloc.
 * @param blankLines Blank line diff from cloc.
 * @param entityDelta Entity comparison result.
 * @param duplicates Duplicate detection report.
 * @returns MrStatsCategoryRealCode with all fields populated.
 */
export function buildRealCodeCategory(
  files: number,
  added: number,
  removed: number,
  codeLines: LineDiff,
  commentLines: LineDiff,
  blankLines: LineDiff,
  entityDelta: EntityDelta,
  duplicates: DuplicateReport
): MrStatsCategoryRealCode {
  return {
    files,
    added,
    removed,
    codeLines,
    commentLines,
    blankLines,
    entities: {
      introduced: entityDelta.introduced.length,
      modified: entityDelta.modified.length,
      removed: entityDelta.removed.length,
    },
    duplicates: {
      clonesFound: duplicates.clonesFound,
      clonedLines: duplicates.clonedLines,
      percentage: duplicates.percentage,
    },
  };
}
