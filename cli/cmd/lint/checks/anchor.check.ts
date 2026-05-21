// @file: Anchor pairing and nesting validation — stack-based algorithm for START/END structural anchors.
// @consumers: LintCommand
// @tasks: TSK-14

import type { LintError } from '../lint.types.ts';
import {
  ERR_CLI_LINT_ANCHOR_UNPAIRED_START,
  ERR_CLI_LINT_ANCHOR_UNPAIRED_END,
  ERR_CLI_LINT_ANCHOR_NESTING,
  ERR_CLI_LINT_ANCHOR_MALFORMED,
} from '../lint.types.ts';

/** @purpose Compiled regex for matching `#region START_NAME` / `#endregion END_NAME` directives per AX_ANCHOR_FORMAT. */
const ANCHOR_RE = /\/\/ #(region|endregion)\s+(START|END)_([A-Z0-9_]+)/;

/** @purpose Regex for bare `#region` / `#endregion` without START_ / END_ prefix. */
const BARE_ANCHOR_RE = /\/\/ #(region|endregion)\s*$/;

type StackEntry = {
  name: string;
  line: number;
  col: number;
};

/**
 * @purpose Validates anchor pairing and nesting in TypeScript source per DbC contract.
 * @invariant Stack-based: START_X pushes; END_X finds matching START_X in stack and reports nesting for any unclosed blocks above the match.
 * @invariant Bare #region/#endregion without START_/END_ → ERR_CLI_LINT_ANCHOR_MALFORMED. Bare #endregion auto-closes with stack top.
 * @invariant Pure function — no I/O, no exceptions. Errors returned in ascending line order.
 * @param content Source text to validate.
 * @param filePath File path for error messages.
 * @returns List of lint errors in line order, empty when anchors are correctly paired and nested.
 */
export function check(content: string, filePath: string): LintError[] {
  const lines = content.split('\n');
  const errors: LintError[] = [];
  const stack: StackEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(ANCHOR_RE);

    if (match) {
      const directive = match[2];
      const name = match[3];
      const lineNum = i + 1;
      const startIdx = match.index ?? 0;
      const directiveIdx = line.indexOf(directive, startIdx);
      const col = (directiveIdx >= 0 ? directiveIdx : startIdx) + 1;

      // #region START_PUSH_TO_STACK
      if (directive === 'START') {
        stack.push({ name, line: lineNum, col });
        continue;
      }
      // #endregion END_PUSH_TO_STACK

      // #region START_RESOLVE_END_DIRECTIVE — invariant: finds matching START in stack from top; reports nesting for unclosed blocks above match
      const matchIdx = findLastMatchingIndex(stack, (e) => e.name === name);

      if (matchIdx === -1) {
        // #region START_UNPAIRED_END
        errors.push({
          file: filePath,
          line: lineNum,
          col,
          severity: 'error',
          code: ERR_CLI_LINT_ANCHOR_UNPAIRED_END,
          message: `END_${name} without matching START_${name} — add the missing opening anchor or remove this closing one`,
        });
        // #endregion END_UNPAIRED_END
      } else {
        // #region START_NESTING_CHECK
        for (let j = stack.length - 1; j > matchIdx; j--) {
          const entry = stack[j];
          errors.push({
            file: filePath,
            line: lineNum,
            col,
            severity: 'error',
            code: ERR_CLI_LINT_ANCHOR_NESTING,
            message: `END_${name} closes parent while START_${entry.name} at line ${entry.line} is still open — close inner block first`,
          });
        }
        stack.length = matchIdx;
        // #endregion END_NESTING_CHECK
      }
      // #endregion END_RESOLVE_END_DIRECTIVE
      continue;
    }

    // #region START_BARE_ANCHOR_CHECK — invariant: bare #region/#endregion without START_/END_ is malformed
    const bareMatch = line.match(BARE_ANCHOR_RE);
    if (bareMatch) {
      const lineNum = i + 1;
      const col = (bareMatch.index ?? 0) + 1;

      if (bareMatch[1] === 'endregion') {
        // Bare #endregion — auto-close with stack top if available
        if (stack.length > 0) {
          const top = stack[stack.length - 1];
          errors.push({
            file: filePath,
            line: lineNum,
            col,
            severity: 'error',
            code: ERR_CLI_LINT_ANCHOR_MALFORMED,
            message: `#endregion without END_<NAME> — expected END_${top.name} (auto-closed by stack top START_${top.name} at line ${top.line})`,
          });
          stack.pop();
        } else {
          errors.push({
            file: filePath,
            line: lineNum,
            col,
            severity: 'error',
            code: ERR_CLI_LINT_ANCHOR_MALFORMED,
            message: `#endregion without END_<NAME> — no open block to close`,
          });
        }
      } else {
        // Bare #region
        errors.push({
          file: filePath,
          line: lineNum,
          col,
          severity: 'error',
          code: ERR_CLI_LINT_ANCHOR_MALFORMED,
          message: `#region without START_<NAME> — add START_ prefix with a block name`,
        });
      }
    }
    // #endregion END_BARE_ANCHOR_CHECK
  }

  // #region START_COLLECT_UNPAIRED_STARTS
  for (const entry of stack) {
    errors.push({
      file: filePath,
      line: entry.line,
      col: entry.col,
      severity: 'error',
      code: ERR_CLI_LINT_ANCHOR_UNPAIRED_START,
      message: `START_${entry.name} without matching END_${entry.name} — add the missing closing anchor`,
    });
  }
  // #endregion END_COLLECT_UNPAIRED_STARTS

  errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return errors;
}

function findLastMatchingIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}
