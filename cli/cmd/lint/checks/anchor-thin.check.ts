// @file: Anchor thinness check — validates that #region START / #endregion END blocks contain at least 2 meaningful lines.
// @consumers: LintCommand
// @tasks: TSK-XX

import type { LintError } from '../lint.types.ts';
import { ERR_CLI_LINT_ANCHOR_TOO_THIN } from '../lint.types.ts';

const ANCHOR_RE = /\/\/ #(region|endregion)\s+(START|END)_([A-Z0-9_]+)/;
const MIN_MEANINGFUL_LINES = 2;

type StackEntry = {
  name: string;
  startLine: number;
  col: number;
  meaningfulCount: number;
  hasStartAnnotation: boolean;
  hasBodyComment: boolean;
};

/**
 * @purpose Detects #region START / #endregion END blocks with fewer than 2 meaningful code lines. Regions wrapping only comments should be plain comments.
 * @invariant Meaningful line = non-empty, non-`//`-comment, non-region-marker.
 * @invariant Nested regions: code inside inner regions counts toward outer region totals.
 * @param content Source text to validate.
 * @param filePath File path for error messages.
 * @returns List of lint errors, empty when all regions have sufficient content.
 */
export function check(content: string, filePath: string): LintError[] {
  const lines = content.split('\n');
  const errors: LintError[] = [];
  const stack: StackEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(ANCHOR_RE);

    if (match && match[2] === 'START') {
      // #region START_PUSH — invariant: capture annotation text on START line
      const name = match[3];
      const startIdx = match.index ?? 0;
      const directiveIdx = line.indexOf('START', startIdx);
      const col = (directiveIdx >= 0 ? directiveIdx : startIdx) + 1;

      const trailingText = line.slice(startIdx + match[0].length).trim();
      const hasStartAnnotation = trailingText.length > 0;

      stack.push({
        name,
        startLine: i + 1,
        col,
        meaningfulCount: 0,
        hasStartAnnotation,
        hasBodyComment: false,
      });
      // #endregion END_PUSH
      continue;
    }

    if (match && match[2] === 'END') {
      // #region START_POP — invariant: find matching START, check count, pop
      const name = match[3];
      const matchIdx = findLastMatchingIndex(stack, (e) => e.name === name);

      if (matchIdx !== -1) {
        const entry = stack[matchIdx];
        if (entry.meaningfulCount < MIN_MEANINGFUL_LINES) {
          errors.push(buildError(filePath, entry));
        }
        stack.length = matchIdx;
      }
      // #endregion END_POP
      continue;
    }

    if (stack.length === 0) continue;

    if (isMeaningfulLine(line)) {
      for (const entry of stack) {
        entry.meaningfulCount++;
      }
    } else if (isCommentLine(line)) {
      stack[stack.length - 1].hasBodyComment = true;
    }
  }

  errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return errors;
}

function buildError(filePath: string, entry: StackEntry): LintError {
  const { name, startLine, col, meaningfulCount, hasStartAnnotation, hasBodyComment } = entry;

  let message: string;
  if (meaningfulCount === 0 && (hasStartAnnotation || hasBodyComment)) {
    message = `START_${name} wraps only comments — keep the comment(s) and remove the region wrapper`;
  } else if (meaningfulCount === 0) {
    message = `START_${name} is empty (0 meaningful lines) — remove the empty region`;
  } else if (hasStartAnnotation) {
    message = `START_${name} has only ${meaningfulCount} meaningful line(s) + annotation — keep the annotation as a plain comment and remove the region wrapper`;
  } else {
    message = `START_${name} has only ${meaningfulCount} meaningful line(s) — regions need at least ${MIN_MEANINGFUL_LINES} lines of code; consider removing the region`;
  }

  return {
    file: filePath,
    line: startLine,
    col,
    severity: 'error',
    code: ERR_CLI_LINT_ANCHOR_TOO_THIN,
    message,
  };
}

function findLastMatchingIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

function isMeaningfulLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  if (trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) return false;
  return true;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('//')) return false;
  return !ANCHOR_RE.test(trimmed);
}
