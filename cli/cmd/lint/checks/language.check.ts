// @file: Language validation — detects Cyrillic characters in JSDoc contracts and file headers.
// @consumers: LintCommand
// @tasks: TSK-32

import type { LintError } from '../lint.types.ts';
import { ERR_CLI_LINT_NON_ENGLISH } from '../lint.types.ts';

const CYRILLIC_RE = /\p{Script=Cyrillic}/u;

/** @purpose Validates that JSDoc contracts and file headers use English, not Russian/Cyrillic. | @implements {LanguageCheck} in specs/cli/lint/lint.spec.md | @invariant Scans JSDoc blocks and file header lines (// @file:, // @consumers:). | @invariant Pure function — no I/O, no exceptions. | @param content Source text to validate. | @param filePath File path for error messages. | @returns List of lint errors in ascending line order, empty when no Cyrillic found. */
export function check(content: string, filePath: string): LintError[] {
  const errors: LintError[] = [];
  const lines = content.split('\n');

  const jsDocRanges = collectJsDocRanges(lines);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // #region START_CHECK_HEADER — invariant: file header lines must not contain Cyrillic
    if (trimmed.startsWith('// @file:') || trimmed.startsWith('// @consumers:')) {
      const chars = [...line];
      for (let c = 0; c < chars.length; c++) {
        if (CYRILLIC_RE.test(chars[c])) {
          errors.push({
            file: filePath,
            line: lineNum,
            col: c + 1,
            severity: 'error',
            code: ERR_CLI_LINT_NON_ENGLISH,
            message: `[LanguageCheck#check] Cyrillic character '${chars[c]}' in file header — use English only`,
          });
        }
      }
    }
    // #endregion END_CHECK_HEADER

    // #region START_CHECK_JSDOC — invariant: JSDoc comment text must not contain Cyrillic
    if (jsDocRanges.has(i)) {
      const chars = [...line];
      for (let c = 0; c < chars.length; c++) {
        if (CYRILLIC_RE.test(chars[c])) {
          errors.push({
            file: filePath,
            line: lineNum,
            col: c + 1,
            severity: 'error',
            code: ERR_CLI_LINT_NON_ENGLISH,
            message: `[LanguageCheck#check] Cyrillic character '${chars[c]}' in JSDoc contract — use English only`,
          });
          break;
        }
      }
    }
    // #endregion END_CHECK_JSDOC
  }

  return errors;
}

/**
 * @purpose Collects line indices that fall inside JSDoc blocks.
 * @param lines Source lines.
 * @returns Set of 0-based line indices within JSDoc blocks.
 */
function collectJsDocRanges(lines: string[]): Set<number> {
  const indices = new Set<number>();
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed.startsWith('/**')) {
      inBlock = true;
      indices.add(i);
      if (trimmed.endsWith('*/')) {
        inBlock = false;
      }
      continue;
    }

    if (inBlock) {
      indices.add(i);
      if (trimmed.includes('*/')) {
        inBlock = false;
      }
    }
  }

  return indices;
}
