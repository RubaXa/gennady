// @file: Types and error codes for the lint command module.
// @consumers: LintCommand, FileHeaderCheck, AnchorCheck, DbcContractCheck
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

/**
 * @purpose Aggregated lint result with ESLint-compatible formatting.
 * @invariant exitCode is 0 when errors is empty, 1 otherwise.
 */
export class LintReport {
  readonly errors: LintError[];
  readonly autoFixed: number;

  constructor(errors: LintError[], autoFixed = 0) {
    this.errors = errors;
    this.autoFixed = autoFixed;
  }

  get exitCode(): 0 | 1 {
    return this.errors.length > 0 ? 1 : 0;
  }

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

export const ERR_CLI_LINT_MISSING_FILE = 'ERR_CLI_LINT_MISSING_FILE' as const;
export const ERR_CLI_LINT_MISSING_CONSUMERS = 'ERR_CLI_LINT_MISSING_CONSUMERS' as const;
export const ERR_CLI_LINT_ANCHOR_UNPAIRED_START = 'ERR_CLI_LINT_ANCHOR_UNPAIRED_START' as const;
export const ERR_CLI_LINT_ANCHOR_UNPAIRED_END = 'ERR_CLI_LINT_ANCHOR_UNPAIRED_END' as const;
export const ERR_CLI_LINT_ANCHOR_NESTING = 'ERR_CLI_LINT_ANCHOR_NESTING' as const;
