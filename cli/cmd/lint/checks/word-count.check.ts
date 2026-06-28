// @file: Word count validation — checks that JSDoc tag descriptions and file-header lines do not exceed the word limit.
// @consumers: LintCommand
// @tasks: TSK-XX

import type { LintError } from '../lint.types.ts';
import { ERR_CLI_LINT_TAG_TOO_MANY_WORDS } from '../lint.types.ts';

const JSDOC_TAG_RE =
  /@(?:param|returns|purpose|implements|invariant|sideEffect|consumer|see|post|throws|pre|tasks)\b/;

const FILE_HEADER_RE = /^\/\/\s*@(?:file|consumers):/;

/**
 * @purpose Counts whitespace-delimited words in a text segment.
 * @param text Text to count words in.
 * @returns Number of non-empty tokens after splitting by whitespace.
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * @purpose Validates that JSDoc tag descriptions and file-header lines stay within the word count limit.
 * @implements {WordCountCheck} in specs/cli/lint/lint.spec.md
 * @invariant JSDoc tag description = text from the tag name to the next tag or closing star-slash.
 * @invariant File-header lines: counts words after the colon in // @file: and // @consumers:.
 * @invariant Pure function — no I/O, no exceptions.
 * @param content Source text to validate.
 * @param filePath File path for error messages.
 * @param maxWords Maximum allowed words per tag description or file-header line.
 * @returns List of lint errors, empty when all descriptions are within limit.
 */
export function check(content: string, filePath: string, maxWords: number): LintError[] {
  const lines = content.split('\n');
  const errors: LintError[] = [];

  // #region START_CHECK_JSDOC_TAGS — invariant: each JSDoc tag description within limit
  let inJSDoc = false;
  let jsdocBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('/**')) {
      inJSDoc = true;
      jsdocBlockLines = [line];

      if (trimmed.endsWith('*/')) {
        inJSDoc = false;
        errors.push(...checkJsDocBlock(jsdocBlockLines, filePath, i + 1, i + 1, maxWords));
      }
      continue;
    }

    if (inJSDoc) {
      jsdocBlockLines.push(line);

      if (trimmed.includes('*/')) {
        inJSDoc = false;
        const startLine = i + 1 - jsdocBlockLines.length + 1;
        const endLine = i + 1;
        errors.push(...checkJsDocBlock(jsdocBlockLines, filePath, startLine, endLine, maxWords));
      }
    }
  }
  // #endregion END_CHECK_JSDOC_TAGS

  // #region START_CHECK_FILE_HEADER — invariant: @file: and @consumers: lines within limit
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (trimmed.startsWith('import ')) {
      break;
    }

    const headerMatch = trimmed.match(FILE_HEADER_RE);
    if (headerMatch) {
      const afterColon = trimmed.slice(trimmed.indexOf(':') + 1).trim();
      const words = countWords(afterColon);
      if (words > maxWords) {
        const tagName = trimmed.startsWith('// @file:') ? '@file' : '@consumers';
        const col = trimmed.indexOf(':') + 2;
        errors.push({
          file: filePath,
          line: lineNum,
          col,
          severity: 'error',
          code: ERR_CLI_LINT_TAG_TOO_MANY_WORDS,
          message: `[WordCountCheck#check] ${tagName} has ${words} words (max ${maxWords}) — shorten the description`,
        });
      }
    }
  }
  // #endregion END_CHECK_FILE_HEADER

  errors.sort((a, b) => a.line - b.line || a.col - b.col);
  return errors;
}

/**
 * @purpose Extracts text between a JSDoc tag and the next tag or closing star-slash.
 * @invariant Removes leading star and whitespace from each line.
 * @param lines Lines of a single JSDoc block.
 * @param tagIdx Index within the joined text where the tag starts.
 * @returns Cleaned description text.
 */
function extractTagDescription(lines: string[], tagIdx: number): string {
  const cleanedLines = lines.map((l) => {
    let result = l.trim();
    if (result.startsWith('/**')) result = result.slice(3);
    if (result.endsWith('*/')) result = result.slice(0, result.length - 2).trim();
    if (result.startsWith('*')) result = result.slice(1);
    return result;
  });

  const fullText = cleanedLines.join('\n').slice(tagIdx);
  const nextTag = fullText.slice(1).search(JSDOC_TAG_RE);

  if (nextTag === -1) {
    return fullText.slice(1);
  }

  return fullText.slice(1, nextTag + 1);
}

/**
 * @purpose Checks all JSDoc tags within a single JSDoc block for word count violations.
 * @param lines Lines of a single JSDoc block (including the opener and closer).
 * @param filePath File path for error messages.
 * @param startLine 1-based line of the JSDoc opener.
 * @param endLine 1-based line of the JSDoc closer.
 * @param maxWords Maximum allowed words per tag.
 * @returns List of lint errors for this block.
 */
function checkJsDocBlock(
  lines: string[],
  filePath: string,
  startLine: number,
  _endLine: number,
  maxWords: number
): LintError[] {
  const errors: LintError[] = [];

  const cleanedLines = lines.map((l) => {
    let result = l.trim();
    if (result.startsWith('/**')) result = result.slice(3);
    if (result.endsWith('*/')) result = result.slice(0, result.length - 2).trim();
    if (result.startsWith('*')) result = result.slice(1);
    return result;
  });

  const fullText = cleanedLines.join('\n');

  // #region START_FIND_TAGS — invariant: find each JSDoc tag, extract description, count words
  let searchFrom = 0;

  while (searchFrom < fullText.length) {
    JSDOC_TAG_RE.lastIndex = 0;
    const tagMatch = JSDOC_TAG_RE.exec(fullText.slice(searchFrom));
    if (!tagMatch) break;

    const tagName = tagMatch[0];
    const tagIdx = searchFrom + (tagMatch.index ?? 0);
    const description = extractTagDescription(lines, tagIdx);

    const words = countWords(description);

    if (words > maxWords) {
      let charCount = 0;
      let tagLine = startLine;
      let tagCol = 1;

      for (let li = 0; li < lines.length; li++) {
        const lineChars = lines[li].length + 1;
        if (charCount + lineChars > tagIdx) {
          tagLine = startLine + li;
          const offsetInLine = tagIdx - charCount;
          tagCol = offsetInLine + 1;
          break;
        }
        charCount += lineChars;
      }

      errors.push({
        file: filePath,
        line: tagLine,
        col: tagCol,
        severity: 'error',
        code: ERR_CLI_LINT_TAG_TOO_MANY_WORDS,
        message: `[WordCountCheck#check] ${tagName} has ${words} words (max ${maxWords}) — shorten the description`,
      });
    }

    searchFrom = tagIdx + tagName.length;
    if (searchFrom >= fullText.length) break;

    const nextTag = fullText.slice(searchFrom).search(JSDOC_TAG_RE);
    if (nextTag === -1) break;
    searchFrom += nextTag;
  }
  // #endregion END_FIND_TAGS

  return errors;
}
