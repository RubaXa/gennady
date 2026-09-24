// @file: Unified public verify planning, local execution and report composition facade.
// @spec: CLI-VERIFY
// @consumers: gennady.ts

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { runLocalVerifyPlan } from '../../../shared/verify/execution/repair-loop.ts';
import type { VerifyRunReport } from '../../../shared/verify/model/verify-report.type.ts';
import { resolveMultistackVerifyPlan } from '../../../shared/verify/planning/resolve-multistack.ts';
import { buildVerifyRunReport } from '../../../shared/verify/reporting/build-report.ts';
import { renderVerifyJson } from '../../../shared/verify/reporting/json-reporter.ts';
import { renderVerifyText } from '../../../shared/verify/reporting/text-reporter.ts';
import type { VerifyInvocation } from './verify.types.ts';

function headSha(root: string): string {
  const sha = execFileSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!/^[0-9a-f]{40,64}$/.test(sha)) {
    throw new Error(`git returned an invalid HEAD identity: ${JSON.stringify(sha)}`);
  }
  return sha;
}

function exitCodeFor(report: VerifyRunReport): number {
  return report.verdict === 'pass' ? 0 : 1;
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return `[verify] ${cause.message}`;
  return `[verify] ${String(cause)}`;
}

/**
 * @purpose Resolve, optionally execute, and project one target VerifyRunReport.
 * @param root Repository root selected by the process cwd.
 * @param invocation Strict normalized CLI invocation.
 * @param [options] Embedding-only cancellation and personal-config isolation inputs.
 * @returns Complete stdout/stderr/exit outcome without writing process globals.
 */
export async function runVerifyCommand(
  root: string,
  invocation: VerifyInvocation,
  options: {
    readonly signal?: AbortSignal;
    readonly cancellationSignal?: 'SIGINT' | 'SIGTERM';
    readonly homeDirectory?: string;
  } = {}
): Promise<{
  /** @purpose Deterministic process exit status. */
  readonly exitCode: number;
  /** @purpose Complete selected text or JSON report, including trailing newline. */
  readonly stdout: string;
  /** @purpose Actionable invocation/planning diagnostic, otherwise empty. */
  readonly stderr: string;
  /** @purpose Immutable internal report when planning reached a terminal product. */
  readonly report?: VerifyRunReport;
}> {
  try {
    const canonicalRoot = fs.realpathSync(root);
    const planning = resolveMultistackVerifyPlan(canonicalRoot, invocation.phase, {
      scope: { mode: 'all', files: [] },
      ...(options.homeDirectory === undefined ? {} : { homeDirectory: options.homeDirectory }),
    });
    const plannedHeadSha = headSha(canonicalRoot);
    const execution = invocation.planOnly
      ? undefined
      : await runLocalVerifyPlan(canonicalRoot, planning.plan, planning.readiness, {
          signal: options.signal,
          cancellationSignal: options.cancellationSignal,
          signalHandlers: false,
        });
    const report = buildVerifyRunReport({
      root: canonicalRoot,
      phase: invocation.phase,
      headSha: plannedHeadSha,
      planning,
      execution,
    });
    const stdout =
      invocation.format === 'json'
        ? renderVerifyJson(report, canonicalRoot, invocation.planOnly)
        : renderVerifyText(report, canonicalRoot, invocation.planOnly);
    return {
      exitCode:
        execution?.cancellation?.exitCode ?? (invocation.planOnly ? 0 : exitCodeFor(report)),
      stdout: `${stdout}\n`,
      stderr: '',
      report,
    };
  } catch (cause) {
    return { exitCode: 4, stdout: '', stderr: `${errorMessage(cause)}\n` };
  }
}
