// @file: Region comment validation — checks that #region START / #endregion END blocks don't have too many comments and START annotations aren't too verbose.
// @consumers: LintCommand
// @tasks: TSK-XX

import type { LintError } from '../lint.types.ts';
import {
  ERR_CLI_LINT_REGION_TOO_MANY_COMMENTS,
  ERR_CLI_LINT_REGION_START_ANNOTATION_TOO_LONG,
} from '../lint.types.ts';

const ANCHOR_RE = /\/\/ #(region|endregion)\s+(START|END)_([A-Z0-9_]+)/;

const MAX_START_ANNOTATION_WORDS = 30;

type RegionEntry = {
  name: string;
  startLine: number;
  col: number;
  commentCount: number;
  startAnnotationWords: number;
};

/**
 * @purpose Counts whitespace-delimited words in a text segment.
 * @param text Text to count words in.
 * @returns Number of non-empty tokens after splitting by whitespace.
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * @purpose Checks whether a line is a comment (starts with // or /*) that is NOT a region marker.
 * @param line Source line.
 * @returns True when the line is a comment but not a region marker.
 */
function isComment(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('//')) return false;
  return !ANCHOR_RE.test(trimmed);
}

/**
 * @purpose Validates that #region START / #endregion END blocks have a reasonable number of comments
 *         and that START annotations don't exceed the word limit.
 * @implements {RegionCommentCheck} in specs/cli/lint/lint.spec.md
 * @invariant Comment = any // or /* line not a region marker. START annotation = text after #region START_<NAME> on the same line.
 * @invariant Nested regions: comments inside inner regions count toward outer region totals.
 * @invariant Only well-formed (paired) regions are checked; unpaired regions are handled by AnchorCheck.
 * @param content Source text to validate.
 * @param filePath File path for error messages.
 * @param maxComments Maximum allowed comment lines per region body.
 * @returns List of lint errors, empty when all regions are within limits.
 */
export function check(content: string, filePath: string, maxComments: number): LintError[] {
  const lines = content.split('\n');
  const errors: LintError[] = [];
  const stack: RegionEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(ANCHOR_RE);

    if (match && match[2] === 'START') {
      // #region START_PUSH — invariant: capture annotation words and push onto stack
      const name = match[3];
      const startIdx = match.index ?? 0;
      const directiveIdx = line.indexOf('START', startIdx);
      const col = (directiveIdx >= 0 ? directiveIdx : startIdx) + 1;

      const trailingText = line.slice(startIdx + match[0].length).trim();
      const startAnnotationWords = trailingText.length > 0 ? countWords(trailingText) : 0;

      if (startAnnotationWords > MAX_START_ANNOTATION_WORDS) {
        errors.push({
          file: filePath,
          line: i + 1,
          col,
          severity: 'error',
          code: ERR_CLI_LINT_REGION_START_ANNOTATION_TOO_LONG,
          message: `START_${name} annotation has ${startAnnotationWords} words (max ${MAX_START_ANNOTATION_WORDS}) — shorten the annotation`,
        });
      }

      stack.push({
        name,
        startLine: i + 1,
        col,
        commentCount: 0,
        startAnnotationWords,
      });
      // #endregion END_PUSH
      continue;
    }

    if (match && match[2] === 'END') {
      // #region START_POP — invariant: find matching START, check comment count, pop
      const name = match[3];
      const matchIdx = findLastMatchingIndex(stack, (e) => e.name === name);

      if (matchIdx !== -1) {
        const entry = stack[matchIdx];
        if (entry.commentCount > maxComments) {
          errors.push({
            file: filePath,
            line: entry.startLine,
            col: entry.col,
            severity: 'error',
            code: ERR_CLI_LINT_REGION_TOO_MANY_COMMENTS,
            message: `START_${name} has ${entry.commentCount} comment lines (max ${maxComments}) — reduce comments or extract them outside the region`,
          });
        }
        stack.length = matchIdx;
      }
      // #endregion END_POP
      continue;
    }

    if (stack.length === 0) continue;

    if (isComment(line)) {
      for (const entry of stack) {
        entry.commentCount++;
      }
    }
  }

  errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return errors;
}

function findLastMatchingIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}
