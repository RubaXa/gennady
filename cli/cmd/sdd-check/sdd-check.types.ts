// @file: Types, error codes, and finding formatting for the sdd-check command.
// @consumers: SddCheckCommand
// @tasks: N/A

import type { Finding } from '../../../shared/sdd/check.ts';

/** @purpose Neither --task nor --all was given. */
export const ERR_CLI_SDD_CHECK_BAD_INVOCATION = 'ERR_CLI_SDD_CHECK_BAD_INVOCATION' as const;
/** @purpose The --task ticket file does not exist or cannot be read. */
export const ERR_CLI_SDD_CHECK_FILE = 'ERR_CLI_SDD_CHECK_FILE' as const;

/** @purpose Outcome of a check run: the report plus the process exit code. */
export type CheckResult = {
  /** @purpose The ESLint-style report (findings + summary) for stdout. */
  text: string;
  /** @purpose Exit code — 0 clean, 1 errors found, 4 bad invocation. */
  exitCode: number;
};

/**
 * @purpose Format findings ESLint-style and derive the exit code.
 * @invariant Exit 1 iff at least one error-severity finding is present; warnings alone exit 0.
 * @param findings All findings collected across checked files.
 * @param fileCount Number of files checked (for the summary line).
 * @returns The report text and exit code.
 */
export function formatFindings(findings: Finding[], fileCount: number): CheckResult {
  if (findings.length === 0) {
    return { text: `[sdd-check] ✅ clean — ${fileCount} file(s) checked`, exitCode: 0 };
  }
  const lines = findings.map((f) => `${f.file}: ${f.severity}: ${f.code}  ${f.message}`);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.length - errors;
  const summary = `[sdd-check] ${errors} error(s), ${warns} warning(s) across ${fileCount} file(s)`;
  return { text: [...lines, '', summary].join('\n'), exitCode: errors > 0 ? 1 : 0 };
}

/** @purpose Build the bad-invocation result. | @returns Result with exit 4. */
export function badInvocation(): CheckResult {
  return {
    text: [
      `[sdd-check] ${ERR_CLI_SDD_CHECK_BAD_INVOCATION}`,
      '  expected: gennady sdd-check (--task <ticket> | --all [project-root])',
    ].join('\n'),
    exitCode: 4,
  };
}

/** @purpose Build the file-error result. | @param ticket The ticket path. | @returns Result with exit 1. */
export function fileError(ticket: string): CheckResult {
  return {
    text: `[sdd-check] ${ERR_CLI_SDD_CHECK_FILE}: ${ticket}\n  Cannot read the ticket — verify the path.`,
    exitCode: 1,
  };
}
