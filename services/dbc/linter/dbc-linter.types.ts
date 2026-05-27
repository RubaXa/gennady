// @file: Port DbcLinter, Value Objects, and lint error constants for the dbc-linter module.
// @consumers: DbcTsLinter
// @tasks: TSK-07, TSK-09, TSK-11

import type { DbcIssueCode } from '../parser/dbc-parser.types.ts';

/** @purpose Configuration options for linting passes. */
export type DbcLintOptions = {
  /** @purpose Linting strategy — only 'full' is supported in v1 */
  strategy?: 'full';
  /** @purpose Pre-read file content. When passed, the linter uses this instead of reading from disk. */
  content?: string;
};

/** @purpose Stable string codes for dbc-linter errors. */
export const ERR_DBC_LINT_MISSING_CONTRACT = 'ERR_DBC_LINT_MISSING_CONTRACT';

/** @purpose Stable string code: file could not be parsed syntactically. */
export const ERR_DBC_LINT_PARSE_FAILED = 'ERR_DBC_LINT_PARSE_FAILED';

/** @purpose Stable string code: parameter exists in signature but not in contract. */
export const ERR_DBC_LINT_PARAM_MISSING = 'ERR_DBC_LINT_PARAM_MISSING';

/** @purpose Stable string code: @param in contract has no matching signature parameter. */
export const ERR_DBC_LINT_PARAM_EXTRA = 'ERR_DBC_LINT_PARAM_EXTRA';

/** @purpose Stable string code: @param order in contract does not match signature. */
export const ERR_DBC_LINT_PARAM_ORDER = 'ERR_DBC_LINT_PARAM_ORDER';

/** @purpose Stable string code: non-void return type lacks @returns in contract. */
export const ERR_DBC_LINT_RETURNS_MISSING = 'ERR_DBC_LINT_RETURNS_MISSING';

/** @purpose Stable string code: @returns present where not applicable (void, constructor, setter, field, const). */
export const ERR_DBC_LINT_RETURNS_UNEXPECTED = 'ERR_DBC_LINT_RETURNS_UNEXPECTED';

/** @purpose Stable string code: {dataType} annotation in @param or @returns is redundant in a typed language. */
export const ERR_DBC_LINT_TYPE_REDUNDANT = 'ERR_DBC_LINT_TYPE_REDUNDANT';

/** @purpose Stable string code: @param optionality (brackets) does not match signature optionality. */
export const ERR_DBC_LINT_PARAM_OPTIONAL_MISMATCH = 'ERR_DBC_LINT_PARAM_OPTIONAL_MISMATCH';

/** @purpose Stable string code: @param/@returns present in implements-method contract (redundant — described in interface). */
export const ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS =
  'ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS';

/** @purpose Union of all supported dbc-linter issue codes. */
export type DbcLintIssueCode =
  | typeof ERR_DBC_LINT_MISSING_CONTRACT
  | typeof ERR_DBC_LINT_PARSE_FAILED
  | typeof ERR_DBC_LINT_PARAM_MISSING
  | typeof ERR_DBC_LINT_PARAM_EXTRA
  | typeof ERR_DBC_LINT_PARAM_ORDER
  | typeof ERR_DBC_LINT_RETURNS_MISSING
  | typeof ERR_DBC_LINT_RETURNS_UNEXPECTED
  | typeof ERR_DBC_LINT_TYPE_REDUNDANT
  | typeof ERR_DBC_LINT_PARAM_OPTIONAL_MISMATCH
  | typeof ERR_DBC_LINT_PARAM_REDUNDANT_IN_IMPLEMENTS;

/** @purpose A single lint error bound to a specific file location and issue code. */
export type DbcLintError = {
  /** @purpose Absolute or relative path to the source file */
  file: string;
  /** @purpose One-based line number where the error was detected */
  line: number;
  /** @purpose One-based column number where the error was detected */
  col: number;
  /** @purpose Severity level — always 'error' in v1 */
  severity: 'error';
  /** @purpose Stable issue code identifying the error category — widened to accept parser codes (FR-23) */
  code: DbcLintIssueCode | DbcIssueCode;
  /** @purpose Human-readable description of the error */
  message: string;
};

/**
 * @purpose Result of a lint pass — carries discovered errors and provides ESLint-compatible formatting.
 * @invariant `errors` is never null; empty array signals no errors detected.
 */
export type DbcLintReport = {
  /** @purpose All errors discovered during the lint pass, in file-order */
  errors: DbcLintError[];
  /**
   * @purpose Formats errors in ESLint-compatible output.
   * @returns Multi-line string in `file:line:col: severity: code: message` format.
   */
  format(): string;
};

/**
 * @purpose Result of a lint-and-fix pass — carries remaining unfixable errors and the count of auto-fixed issues.
 * @invariant `autoFixed >= 0`. `autoFixed` = errors_before.length - errors_after.length.
 */
export type DbcLintFixReport = {
  /** @purpose Errors that could not be auto-fixed */
  errors: DbcLintError[];
  /** @purpose Number of errors that were automatically resolved */
  autoFixed: number;
  /**
   * @purpose Formats remaining errors in ESLint-compatible output.
   * @returns Multi-line string in `file:line:col: severity: code: message` format.
   */
  format(): string;
};

/**
 * @purpose Abstraction for linting: checks contract coverage, validates contracts, verifies signatures, and auto-fixes fixable errors.
 * @invariant All errors are returned via report objects — the linter never throws.
 * @invariant error order is stable (top-to-bottom by file position).
 */
export interface DbcLinter {
  /**
   * @purpose Run a full lint pass on a source file.
   * @param filePath Path to the source file to lint.
   * @param [options] Optional linting configuration (strategy selection).
   * @returns A report with all discovered errors.
   */
  lint(filePath: string, options?: DbcLintOptions): Promise<DbcLintReport>;

  /**
   * @purpose Run lint and auto-fix fixable errors, mutating the source file.
   * @param filePath Path to the source file to lint and fix.
   * @param [options] Optional linting configuration (strategy selection).
   * @returns A report with remaining unfixable errors and auto-fix count.
   * @sideEffect Mutates the source file on disk to apply auto-fixes.
   */
  lintAndFix(filePath: string, options?: DbcLintOptions): Promise<DbcLintFixReport>;
}
