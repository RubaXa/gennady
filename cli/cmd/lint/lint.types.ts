// @file: Types and error codes for the lint command module.
// @consumers: LintCommand, FileHeaderCheck, AnchorCheck, DbcContractCheck, LanguageCheck
// @tasks: TSK-12

/** @purpose Single lint error in ESLint-compatible format. */
export type LintError = {
  /** @purpose Path to the file containing the error */
  file: string;
  /** @purpose 1-based line number */
  line: number;
  /** @purpose 1-based column number */
  col: number;
  /** @purpose Always 'error' for lint violations */
  severity: 'error';
  /** @purpose Error code from ERR_CLI_LINT_* or ERR_DBC_LINT_* set */
  code: string;
  /** @purpose Human-readable description with corrective action */
  message: string;
};

/** @purpose Configuration for a single lint run. */
export type LintOptions = {
  /** @purpose List of .ts file paths to lint */
  files: string[];
  /** @purpose Enable autofix for dbc contract checks */
  autofix: boolean;
  /** @purpose Git scan mode — collect files from git index */
  gitMode?: 'staged';
};

/** @purpose Aggregated lint result with ESLint-compatible formatting. | @invariant exitCode is 0 when errors is empty, 1 otherwise. */
export class LintReport {
  /** @purpose Collected lint errors — empty array when clean. */
  readonly errors: LintError[];
  /** @purpose Count of errors auto-fixed by DbcContractCheck. */
  readonly autoFixed: number;

  /** @purpose Creates a LintReport with collected errors and optional autoFixed count. | @param errors Collected lint errors — empty array when clean. | @param autoFixed Count of auto-fixed errors, defaults to 0. */
  constructor(errors: LintError[], autoFixed = 0) {
    this.errors = errors;
    this.autoFixed = autoFixed;
  }

  /** @purpose Returns 0 when no errors, 1 otherwise — ESLint convention. | @returns 0 for clean, 1 for errors. */
  get exitCode(): 0 | 1 {
    return this.errors.length > 0 ? 1 : 0;
  }

  /** @purpose Formats errors in ESLint-compatible output: file:line:col: severity: code: message. | @returns ESLint-compatible formatted string. */
  format(): string {
    const lines: string[] = [];
    if (this.autoFixed > 0) {
      lines.push(`Auto-fixed: ${this.autoFixed} error(s)`);
    }
    if (this.errors.length > 0) {
      lines.push(
        ...this.errors.map(
          (e) => `${e.file}:${e.line}:${e.col}: ${e.severity}: ${e.code}: ${e.message}`
        )
      );
    }
    return lines.join('\n');
  }
}

/** @purpose File is missing the mandatory // @file: directive before the first import. */
export const ERR_CLI_LINT_MISSING_FILE = 'ERR_CLI_LINT_MISSING_FILE' as const;
/** @purpose File is missing the mandatory // @consumers: directive before the first import. */
export const ERR_CLI_LINT_MISSING_CONSUMERS = 'ERR_CLI_LINT_MISSING_CONSUMERS' as const;
/** @purpose A START anchor has no matching END anchor — opening block never closed. */
export const ERR_CLI_LINT_ANCHOR_UNPAIRED_START = 'ERR_CLI_LINT_ANCHOR_UNPAIRED_START' as const;
/** @purpose An END anchor has no matching START anchor — closing block never opened. */
export const ERR_CLI_LINT_ANCHOR_UNPAIRED_END = 'ERR_CLI_LINT_ANCHOR_UNPAIRED_END' as const;
/** @purpose Anchors violate nesting — parent closed before child. */
export const ERR_CLI_LINT_ANCHOR_NESTING = 'ERR_CLI_LINT_ANCHOR_NESTING' as const;
/** @purpose Cyrillic characters found in JSDoc contracts or file headers — English required. */
export const ERR_CLI_LINT_NON_ENGLISH = 'ERR_CLI_LINT_NON_ENGLISH' as const;
