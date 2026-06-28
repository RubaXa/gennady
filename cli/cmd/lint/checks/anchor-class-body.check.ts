// @file: Anchor class-body boundary check — forbids #region START / #endregion END at class/namespace body level.
// @consumers: LintCommand
// @tasks: TSK-XX

import type { LintError } from '../lint.types.ts';
import { ERR_CLI_LINT_ANCHOR_AT_CLASS_BODY } from '../lint.types.ts';
import { stripStringsAndComments } from './utils/strip-strings-comments.ts';

const ANCHOR_RE = /\/\/ #(region|endregion)\s+(START|END)_([A-Z0-9_]+)/;

/**
 * @purpose Detects #region/#endregion at class body level. Allowed only inside method bodies (brace depth >= 2) or top-level. Class-body-level forbidden.
 * @param content Source text to validate.
 * @param filePath File path for error messages.
 * @returns List of lint errors, empty when all regions are correctly placed.
 */
export function check(content: string, filePath: string): LintError[] {
  const lines = content.split('\n');
  const errors: LintError[] = [];

  let braceDepth = 0;
  const classStack: number[] = [];
  let pendingClassKeyword = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Detect class/namespace keyword — opening brace may follow on same or next line
    if (/\b(?:class|namespace)\s+\w/.test(stripStringsAndComments(line))) {
      pendingClassKeyword = true;
    }

    // Count braces on this line (outside strings/comments)
    const cleanLine = stripStringsAndComments(line);
    for (const ch of cleanLine) {
      if (ch === '{') {
        braceDepth++;
        if (pendingClassKeyword) {
          classStack.push(braceDepth);
          pendingClassKeyword = false;
        }
      } else if (ch === '}') {
        if (classStack.length > 0 && braceDepth === classStack[classStack.length - 1]) {
          classStack.pop();
        }
        braceDepth--;
      }
    }

    // Check for region on this line
    const match = line.match(ANCHOR_RE);
    if (match) {
      // At class body level if: inside a class AND braceDepth == classStack top
      if (classStack.length > 0 && braceDepth === classStack[classStack.length - 1]) {
        const name = match[3];
        const isStart = match[2] === 'START';
        const kind = isStart ? 'START' : 'END';
        const startIdx = match.index ?? 0;
        const col = startIdx + 1;

        errors.push({
          file: filePath,
          line: lineNum,
          col,
          severity: 'error',
          code: ERR_CLI_LINT_ANCHOR_AT_CLASS_BODY,
          message: `#region ${kind}_${name} at class body level — regions must not separate class members; move inside a method body or remove`,
        });
      }
    }
  }

  errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return errors;
}
