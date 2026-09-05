// @file: Semantic prose budgets for file headers and JSDoc contracts.
// @consumers: LintCommand, WordCountCheck tests
// @tasks: TSK-XX

import type { LintError } from '../lint.types.ts';
import { ERR_CLI_LINT_TAG_TOO_MANY_WORDS } from '../lint.types.ts';

/** @purpose Default semantic-word budget for one file-header description. */
export const DEFAULT_HEADER_WORDS = 24;

/** @purpose Default semantic-word budget for one prose-bearing JSDoc contract description. */
export const DEFAULT_CONTRACT_WORDS = 30;

/** @purpose Typed word limits after CLI precedence has been resolved. */
type WordBudgetLimits = {
  /** @purpose File-header prose limit. */
  header: number;
  /** @purpose JSDoc contract prose limit. */
  contract: number;
};

/** @purpose One measured description used by the checker. */
type WordBudgetSample = {
  /** @purpose Budget family owning this description. */
  category: 'header' | 'contract';
  /** @purpose Header or JSDoc tag name. */
  tag: string;
  /** @purpose One-based source line. */
  line: number;
  /** @purpose One-based source column. */
  col: number;
  /** @purpose Semantic prose-word count. */
  words: number;
  /** @purpose Normalized original description for calibration examples. */
  description: string;
};

const JSDOC_TAG =
  /@(param|returns|purpose|implements|invariant|sideEffect|consumer|see|post|throws|pre|tasks)\b/g;
const FILE_HEADER = /^\/\/\s*@(file|consumers):\s*(.*)$/;

/** @purpose Count prose after discarding syntax/reference tokens. | @param text Description text. | @returns Semantic prose-word count. */
function countSemanticWords(text: string): number {
  const withoutBoilerplate = text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\{[^}]*\}/g, ' ');
  let count = 0;
  for (const raw of withoutBoilerplate.split(/\s+/)) {
    const token = raw.replace(/^[\s|,.;:!?()[\]<>"'“”‘’]+|[\s|,.;:!?()[\]<>"'“”‘’]+$/g, '');
    if (!token) continue;
    if (
      token.includes('/') ||
      /\.[a-z0-9]{1,8}(?:#.*)?$/i.test(token) ||
      /[_#]|::|\(\)|=>/.test(token) ||
      /[a-z][A-Z]/.test(token) ||
      /^[A-Z][A-Z0-9-]*$/.test(token) ||
      /^[A-Z]+-\d+$/i.test(token)
    )
      continue;
    count += (token.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? []).length;
  }
  return count;
}

/** @purpose Remove tag-specific type/name syntax so only its prose description reaches counting. */
function proseAfterTag(tag: string, raw: string): string {
  let description = raw.trim().replace(/^\|\s*|\s*\|$/g, '');
  if (tag === '@param') {
    description = description.replace(/^\{[^}]*\}\s*/, '');
    description = description.replace(/^\[?[A-Za-z_$][\w$]*(?:=[^\]]+)?\]?\s*[-–—:]?\s*/, '');
  } else if (tag === '@returns' || tag === '@throws') {
    description = description.replace(/^\{[^}]*\}\s*/, '');
  }
  return description.trim();
}

/** @purpose Normalize one JSDoc line without losing line boundaries used for findings. */
function cleanJsDocLine(line: string): string {
  let clean = line.trim();
  if (clean.startsWith('/**')) clean = clean.slice(3);
  if (clean.endsWith('*/')) clean = clean.slice(0, -2);
  if (clean.trimStart().startsWith('*')) clean = clean.trimStart().slice(1);
  return clean.trim();
}

/** @purpose Measure supported header/JSDoc descriptions. | @param content Source text. | @returns Calibration samples in source order. */
function collectWordBudgetSamples(content: string): WordBudgetSample[] {
  const sourceLines = content.split('\n');
  const samples: WordBudgetSample[] = [];

  for (let index = 0; index < sourceLines.length; index++) {
    const trimmed = (sourceLines[index] ?? '').trim();
    if (trimmed.startsWith('import ')) break;
    const match = FILE_HEADER.exec(trimmed);
    if (!match) continue;
    const tag = `@${match[1] as string}`;
    const description = (match[2] ?? '').trim();
    samples.push({
      category: 'header',
      tag,
      line: index + 1,
      col: Math.max(1, trimmed.indexOf(':') + 2),
      words: countSemanticWords(description),
      description,
    });
  }

  let blockStart = -1;
  let blockLines: string[] = [];
  const finishBlock = (): void => {
    if (blockStart < 0) return;
    const joined = blockLines.map(cleanJsDocLine).join('\n');
    const matches = [...joined.matchAll(JSDOC_TAG)];
    for (let index = 0; index < matches.length; index++) {
      const match = matches[index] as RegExpMatchArray;
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? joined.length;
      const tag = match[0] as string;
      const description = proseAfterTag(tag, joined.slice(start + tag.length, end));
      const before = joined.slice(0, start);
      const relativeLine = before.split('\n').length - 1;
      const cleanedColumn = start - (before.lastIndexOf('\n') + 1);
      const originalLine = blockLines[relativeLine] ?? '';
      samples.push({
        category: 'contract',
        tag,
        line: blockStart + relativeLine + 1,
        col: Math.max(1, originalLine.indexOf(tag, Math.max(0, cleanedColumn - 3)) + 1),
        words: countSemanticWords(description),
        description,
      });
    }
    blockStart = -1;
    blockLines = [];
  };

  for (let index = 0; index < sourceLines.length; index++) {
    const line = sourceLines[index] ?? '';
    if (blockStart < 0 && line.includes('/**')) {
      blockStart = index;
      blockLines = [line];
      if (line.includes('*/')) finishBlock();
      continue;
    }
    if (blockStart < 0) continue;
    blockLines.push(line);
    if (line.includes('*/')) finishBlock();
  }
  return samples;
}

/**
 * @purpose Enforce distinct semantic prose budgets for headers and JSDoc contracts.
 * @implements {WordCountCheck} in specs/cli/lint/lint.spec.md
 * @invariant Reference/path/type/name syntax does not consume prose budget.
 * @param content Source text to validate.
 * @param filePath File path for findings.
 * @param limits Typed limits, or the legacy shared number used by direct callers.
 * @returns One actionable error per over-budget description.
 */
export function check(
  content: string,
  filePath: string,
  limits: WordBudgetLimits | number
): LintError[] {
  const resolved = typeof limits === 'number' ? { header: limits, contract: limits } : limits;
  return collectWordBudgetSamples(content)
    .filter((sample) => sample.words > resolved[sample.category])
    .map((sample) => {
      const limit = resolved[sample.category];
      return {
        file: filePath,
        line: sample.line,
        col: sample.col,
        severity: 'error' as const,
        code: ERR_CLI_LINT_TAG_TOO_MANY_WORDS,
        message:
          `[WordCountCheck#check] ${sample.category} ${sample.tag} has ${sample.words} semantic prose words ` +
          `(limit ${limit}) — rewrite the whole contract coherently; do not truncate one word.`,
      };
    })
    .sort((a, b) => a.line - b.line || a.col - b.col);
}
