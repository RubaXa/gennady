// @file: Output formatting + exit-code convention for gennady yagni — same ESLint-compatible line format as `gennady lint`.
// @consumers: yagni.cmd
// @tasks: N/A

import type { YagniFinding } from '../../../shared/sdd/yagni.ts';

/** @purpose Result of one `gennady yagni` run. */
export type YagniReport = {
  /** @purpose Formatted, human-readable text (ESLint-compatible per finding). */
  text: string;
  /** @purpose 0 when `findings` is empty, 1 otherwise (D-YG003: every finding is `error`, no legacy carve-out — diff scope has no legacy). */
  exitCode: 0 | 1;
};

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
