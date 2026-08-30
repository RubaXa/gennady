// @file: Output formatting + exit-code convention for gennady yagni — same ESLint-compatible line format as `gennady lint`.
// @consumers: yagni.cmd
// @tasks: N/A

import type { YagniFinding } from '../../../shared/sdd/yagni.ts';
import type { YagniIoIssue } from './yagni-index.ts';

/** @purpose Result of one `gennady yagni` run. */
export type YagniReport = {
  /** @purpose Formatted, human-readable text (ESLint-compatible per finding). */
  text: string;
  /** @purpose 0 clean, 1 findings, 2 invalid/unavailable root or Git scope, 4 invalid argv. */
  exitCode: 0 | 1 | 2 | 4;
};

const USAGE = 'usage: gennady yagni [root]';

/**
 * @purpose Render invalid argv with the complete one-line command grammar.
 * @param problem Parser or grammar failure that made the argv invalid.
 * @returns Exit-4 report containing the stable diagnostic code and canonical usage.
 */
export function badInvocation(problem: string): YagniReport {
  return {
    text: ['[yagni] ERR_CLI_YAGNI_BAD_INVOCATION', `  problem: ${problem}`, `  ${USAGE}`].join(
      '\n'
    ),
    exitCode: 4,
  };
}

/**
 * @purpose Refuse a missing, unreadable, or non-directory analysis root.
 * @param root Absolute root path that cannot be analyzed.
 * @param problem Filesystem validation failure for that root.
 * @returns Exit-2 report containing the stable bad-root diagnostic code and recovery action.
 */
export function badRoot(root: string, problem: string): YagniReport {
  return {
    text: [
      `[yagni] ERR_CLI_YAGNI_BAD_ROOT: ${root}`,
      `  problem: ${problem}`,
      '  Pass an existing Git worktree root directory.',
    ].join('\n'),
    exitCode: 2,
  };
}

/**
 * @purpose Fail closed when Git cannot prove the comparison base and changed-file set.
 * @param root Absolute Git worktree candidate whose scope cannot be proven.
 * @param problem Git discovery failure retaining the failed operation and status where available.
 * @returns Exit-2 report containing the stable Git-scope diagnostic code and recovery action.
 */
export function gitScopeUnavailable(root: string, problem: string): YagniReport {
  return {
    text: [
      `[yagni] ERR_CLI_YAGNI_GIT_SCOPE_UNAVAILABLE: ${root}`,
      `  problem: ${problem}`,
      '  Run from the repository top-level, repair/initialize Git, then retry; no files were treated as clean.',
    ].join('\n'),
    exitCode: 2,
  };
}

/**
 * @purpose Fail once, before semantic findings, when source/spec evidence is incomplete.
 * @param issues Exact unreadable corpus entries and retained filesystem reasons.
 * @returns Exit-2 teaching diagnostic; partial counts/waivers are never interpreted as evidence.
 */
export function corpusUnreadable(issues: readonly YagniIoIssue[]): YagniReport {
  const unique = new Map(
    issues.map((entry) => [`${entry.operation}\0${entry.path}\0${entry.reason}`, entry])
  );
  return {
    text: [
      '[yagni] ERR_CLI_YAGNI_CORPUS_UNREADABLE',
      ...[...unique.values()]
        .sort((left, right) => left.path.localeCompare(right.path))
        .map((entry) => `  ${entry.operation}: ${entry.path}\n    reason: ${entry.reason}`),
      '  Restore read access (or remove the broken corpus entry) and retry; partial evidence was not evaluated.',
    ].join('\n'),
    exitCode: 2,
  };
}

/**
 * @purpose Format findings ESLint-style (`file:1:1: severity: CODE: message`) — line/col are always
 *   the 1:1 placeholder, same convention as InventorySyncCheck in cli/cmd/lint.
 * @param findings Collected YAGNI findings.
 * @param filesScanned Count of changed files scanned.
 * @returns The report — clean summary line on success, one line per finding plus a count otherwise.
 */
export function formatYagniReport(findings: YagniFinding[], filesScanned: number): YagniReport {
  if (findings.length === 0) {
    return {
      text: `yagni: ✅ clean (${filesScanned} changed file(s) scanned)`,
      exitCode: 0,
    };
  }
  const lines = findings.map((f) => `${f.file}:1:1: ${f.severity}: ${f.code}: ${f.message}`);
  lines.push('', `yagni: ${findings.length} finding(s) across ${filesScanned} changed file(s)`);
  return { text: lines.join('\n'), exitCode: 1 };
}
