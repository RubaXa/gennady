// @file: Stable machine-readable projection of the unified VerifyRunReport.
// @spec: CLI-VERIFY
// @consumers: VerifyCommand

import type { VerifyRunReport } from '../model/verify-report.type.ts';
import { projectVerifyReport } from './report-safety.ts';

/** @purpose Serialize one report using the versioned safe public field order. | @param report Immutable internal report. | @param root Canonical root removed from output. | @param [planOnly] Whether to emit the non-evidence plan marker. | @returns Stable indented JSON. */
export function renderVerifyJson(report: VerifyRunReport, root: string, planOnly = false): string {
  return JSON.stringify(projectVerifyReport(report, root, planOnly), null, 2);
}
