// @file: DisablesCheck — enforce TypeScript / linter disable comments cite a Decision Log entry (policy D-007).
// @consumers: LintCommand
// @tasks: TSK-51

import type { LintError } from '../lint.types.ts';
import { ERR_CLI_LINT_UNAUTHORIZED_DISABLE } from '../lint.types.ts';

/** @purpose Regex matching one disable marker name (without comment opener). The opener is detected separately via a string-aware state machine. */
const MARKER_RE = /@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable(?:-next-line|-line)?(?:-[a-z-]+)?\b/;

/** @purpose Regex matching a Decision Log reference. Case-insensitive on the `D` letter; requires `-` followed by ≥1 digit. */
const D_REF_RE = /\bd-\d+\b/i;

/**
 * @purpose Find the column where a `//` or `/*` comment opens on the given line, ignoring openers inside string literals.
 * @invariant Tracks single-quote, double-quote, and backtick string state with a simple escape rule (`\` cancels the next char). Does NOT model template-literal interpolation `${...}` — acceptable MVP simplification.
 * @param line Source line to scan.
 * @returns 0-based index of the comment opener, or `-1` if none outside a string.
 */
function findCommentOpener(line: string): number {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    const prev = i > 0 ? line[i - 1] : '';
    if (!inSingle && !inDouble && !inBacktick) {
      if (c === '/' && (line[i + 1] === '/' || line[i + 1] === '*')) return i;
      if (c === "'") inSingle = true;
      else if (c === '"') inDouble = true;
      else if (c === '`') inBacktick = true;
    } else if (prev !== '\\') {
      if (inSingle && c === "'") inSingle = false;
      else if (inDouble && c === '"') inDouble = false;
      else if (inBacktick && c === '`') inBacktick = false;
    }
  }
  return -1;
}

/**
 * @purpose Validates that every TypeScript / linter disable marker in source is accompanied by a Decision Log reference (`D-\d+`) in the same comment line.
 * @implements {DisablesCheck} in specs/cli/lint/lint.spec.md
 * @invariant Marker is counted ONLY when preceded by `//` or `/*` on the same line — string literals containing marker text are not flagged.
 * @invariant `D-\d+` is searched anywhere on the same line as the marker; multi-line block comments are NOT extended (MVP simplification — see lint.spec.md DisablesCheck DbC).
 * @invariant Pure function — no I/O, no exceptions. Errors returned in ascending line order.
 * @param content Source text to validate.
 * @param filePath File path for error messages.
 * @returns List of lint errors in line order; empty when every disable carries a `D-\d+` reference or no disables exist.
 */
export function check(content: string, filePath: string): LintError[] {
  const lines = content.split('\n');
  const errors: LintError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const commentStart = findCommentOpener(line);
    if (commentStart < 0) continue;

    const afterOpener = line.slice(commentStart);
    const match = MARKER_RE.exec(afterOpener);
    if (!match) continue;

    if (D_REF_RE.test(line)) continue;

    const marker = match[0];
    // Column = position of the marker itself (not the comment opener), 1-based
    const col = commentStart + match.index + 1;

    errors.push({
      file: filePath,
      line: i + 1,
      col,
      severity: 'error',
      code: ERR_CLI_LINT_UNAUTHORIZED_DISABLE,
      message: `Unauthorized disable: \`${marker}\` has no Decision Log reference. Add \`D-NNN\` (e.g., \`D-042\`) in the same comment line pointing to a Decision Log entry that authorizes this disable. Policy: see specs/cli/cli.spec.md#d-007.`,
    });
  }

  return errors;
}
