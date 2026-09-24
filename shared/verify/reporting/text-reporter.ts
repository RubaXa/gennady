// @file: Actionable human-readable projection of the unified VerifyRunReport.
// @spec: CLI-VERIFY
// @consumers: VerifyCommand

import type { VerifyRunReport } from '../model/verify-report.type.ts';
import { safeVerifyText } from './report-safety.ts';

/** @purpose Render phase, scope, readiness, attempts, mutations, evidence and final verdict. | @param report Immutable internal report. | @param root Canonical root removed from output. | @param [planOnly] Whether execution was intentionally skipped. | @returns Actionable multiline operator report. */
export function renderVerifyText(report: VerifyRunReport, root: string, planOnly = false): string {
  const lines: string[] = [];
  const scope = report.context.request.scope;
  lines.push(`${planOnly ? 'VERIFY PLAN' : 'VERIFY'} phase=${report.plan.phase}`);
  lines.push(
    `scope=${scope.mode}${scope.changedFrom === undefined ? '' : ` from=${scope.changedFrom}`} files=${scope.files.length === 0 ? '<all>' : scope.files.join(',')}`
  );
  lines.push(`plugins=${report.context.plugins.join(',') || '<none>'}`);
  lines.push(`head=${report.context.headSha}`);
  lines.push(`rules=pre-resolver ${report.rules.digest}`);
  lines.push(`readiness=${report.readiness.status}`);
  const nonReady = report.readiness.entries.filter((entry) => entry.status !== 'READY');
  if (nonReady.length === 0) lines.push('  READY: every selected capability is available');
  for (const entry of nonReady) {
    lines.push(
      `  ${entry.status} ${entry.plugin}${entry.stepId === undefined ? '' : ` ${entry.stepId}`}: ${safeVerifyText(entry.message, root)}`
    );
    if (entry.fix !== undefined) lines.push(`    fix: ${safeVerifyText(entry.fix, root)}`);
    if (entry.policyReason !== undefined) {
      lines.push(`    policy: ${safeVerifyText(entry.policyReason, root)}`);
    }
  }
  lines.push('plan:');
  for (const step of report.plan.steps) {
    lines.push(
      `  ${step.id} [${step.effect}/${step.executor}] needs=${step.needs.join(',') || '-'}`
    );
  }
  lines.push('results:');
  if (planOnly) lines.push('  NOT RUN (--plan)');
  else if (report.results.length === 0) lines.push('  <none>');
  else {
    for (const result of report.results) {
      lines.push(
        `  ${result.status.toUpperCase()} ${result.stepId} exit=${result.exitCode ?? '-'} durationMs=${result.durationMs}`
      );
      if (result.output !== '') lines.push(`    ${safeVerifyText(result.output, root)}`);
    }
  }
  lines.push('mutations:');
  if (report.mutations.length === 0) lines.push('  <none>');
  for (const mutation of report.mutations) {
    lines.push(
      `  ${mutation.kind.toUpperCase()} ${safeVerifyText(mutation.path, root)} by=${mutation.stepId} allowed=${String(mutation.allowed)}`
    );
  }
  lines.push('evidence:');
  if (report.evidence.length === 0) lines.push('  <none>');
  for (const evidence of report.evidence) {
    lines.push(
      `  ${evidence.kind} ${safeVerifyText(evidence.identity, root)}: ${safeVerifyText(evidence.summary, root)}`
    );
  }
  if (planOnly) {
    lines.push(`PLAN ${report.readiness.status}`);
  } else {
    const degraded = report.readiness.status === 'DEGRADED' ? ' (DEGRADED)' : '';
    lines.push(`VERDICT ${report.verdict.toUpperCase()}${degraded}`);
  }
  return lines.join('\n');
}
