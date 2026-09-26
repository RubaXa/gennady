// @file: Unified public verify planning, local execution and report composition facade.
// @spec: CLI-VERIFY
// @consumers: gennady.ts

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { relative } from 'node:path';
import { validateTicketReviewPaths } from '../../../shared/sdd/audit-group.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import { parsePhasesOverview } from '../../../shared/sdd/ticket.ts';
import { resolveTicketArg } from '../../../shared/sdd/ticket-resolve.ts';
import {
  emitSddReceipt,
  type SddReceiptCommandBinding,
} from '../../../shared/sdd/verify/sdd-receipt-sink.ts';
import type { SddVerifyContext } from '../../../shared/sdd/verify/sdd-verify-context.ts';
import { runLocalVerifyPlan } from '../../../shared/verify/execution/repair-loop.ts';
import type { VerifyScope } from '../../../shared/verify/model/verify-context.type.ts';
import type { VerifyRunReport } from '../../../shared/verify/model/verify-report.type.ts';
import {
  resolveMultistackVerifyPlan,
  resolveProjectSddVerifySelector,
} from '../../../shared/verify/planning/resolve-multistack.ts';
import { buildVerifyRunReport } from '../../../shared/verify/reporting/build-report.ts';
import { renderVerifyJson } from '../../../shared/verify/reporting/json-reporter.ts';
import { safeVerifyText } from '../../../shared/verify/reporting/report-safety.ts';
import { renderVerifyText } from '../../../shared/verify/reporting/text-reporter.ts';
import type { VerifyInvocation } from './verify.types.ts';

type SddReceiptPersistence = NonNullable<Parameters<typeof emitSddReceipt>[4]>;
type SddReceiptSinkResult = Awaited<ReturnType<typeof emitSddReceipt>>;
type SddRequest = {
  readonly task: string;
  readonly sddPhase: string;
  readonly scope: VerifyScope;
  readonly deletedFiles: readonly string[];
};

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

function resolveInvocationSddRequest(
  root: string,
  invocation: VerifyInvocation
): SddRequest | undefined {
  if (invocation.sdd === undefined) return undefined;
  const resolved = resolveTicketArg(invocation.sdd.task, root);
  if (!resolved.ok) {
    const detail = 'detail' in resolved ? resolved.detail : resolved.reason;
    throw new Error(
      `ERR_CLI_VERIFY_SDD_CONTEXT: cannot resolve ticket ${JSON.stringify(invocation.sdd.task)}: ${detail}`
    );
  }
  const overview = extractSection(resolved.content, 'PHASES_OVERVIEW');
  if (overview.status !== 'ok') {
    throw new Error('ERR_CLI_VERIFY_SDD_CONTEXT: ticket has no readable PHASES_OVERVIEW');
  }
  const phases = parsePhasesOverview(overview.content);
  const phaseIndex = phases.findIndex((phase) => phase.id === invocation.sdd?.phase);
  const phase = phases[phaseIndex];
  if (phase === undefined) {
    throw new Error(
      `ERR_CLI_VERIFY_SDD_CONTEXT: phase ${JSON.stringify(invocation.sdd.phase)} is absent from the ticket`
    );
  }
  const paths = validateTicketReviewPaths(root, resolved.content, {
    phaseIds: [phase.id],
    targetExpectation: 'existing',
    deletedPhaseIds: phases.slice(0, phaseIndex + 1).map((candidate) => candidate.id),
    handoffPhaseIds: [],
  });
  if (!paths.ok) {
    throw new Error(
      `ERR_CLI_VERIFY_SDD_CONTEXT: ${relative(root, resolved.path)} declares invalid path ${JSON.stringify(paths.path)}: ${paths.detail}`
    );
  }
  const scope = {
    mode: 'files' as const,
    files: [...new Set([...paths.paths.targets, ...paths.paths.deleted])].sort(),
  };
  const selection = resolveProjectSddVerifySelector(root, phase.kind, { scope });
  if (selection.selector !== invocation.phase) {
    throw new Error(
      `ERR_CLI_VERIFY_SDD_CONTEXT: workflow kind ${JSON.stringify(phase.kind)} resolves to selector ${JSON.stringify(selection.selector)} from ${selection.source}, not requested ${JSON.stringify(invocation.phase)}; rerun sdd-task for the canonical invocation`
    );
  }
  return {
    task: relative(root, resolved.path).split('\\').join('/'),
    sddPhase: phase.id,
    scope,
    deletedFiles: [...paths.paths.deleted],
  };
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
    readonly sdd?: {
      readonly context: SddVerifyContext;
      readonly bindings: readonly SddReceiptCommandBinding[];
      readonly persist?: SddReceiptPersistence;
    };
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
  /** @purpose Optional SDD sink outcome over the same report object. */
  readonly receiptSink?: SddReceiptSinkResult;
}> {
  try {
    const canonicalRoot = fs.realpathSync(root);
    if (invocation.planOnly && options.sdd?.persist !== undefined) {
      throw new Error('an SDD receipt sink cannot be enabled for read-only --plan output');
    }
    if (invocation.sdd !== undefined && options.sdd !== undefined) {
      throw new Error('SDD request identity must come from either CLI flags or a receipt context');
    }
    const sddRequest =
      resolveInvocationSddRequest(canonicalRoot, invocation) ?? options.sdd?.context.request;
    const planning = resolveMultistackVerifyPlan(canonicalRoot, invocation.phase, {
      scope: sddRequest?.scope ?? { mode: 'all', files: [] },
      ...(sddRequest === undefined ? {} : { knownDeletedFiles: sddRequest.deletedFiles }),
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
      ...(sddRequest === undefined
        ? {}
        : {
            sdd: {
              task: sddRequest.task,
              phase: sddRequest.sddPhase,
              deletedFiles: sddRequest.deletedFiles,
            },
          }),
    });
    const receiptSink =
      options.sdd === undefined
        ? undefined
        : await emitSddReceipt(
            canonicalRoot,
            report,
            options.sdd.context,
            options.sdd.bindings,
            options.sdd.persist
          );
    const stdout =
      invocation.format === 'json'
        ? renderVerifyJson(report, canonicalRoot, invocation.planOnly)
        : renderVerifyText(report, canonicalRoot, invocation.planOnly);
    const receiptFailure = receiptSink?.ok === false ? receiptSink.diagnostic : undefined;
    return {
      exitCode:
        execution?.cancellation?.exitCode ??
        (receiptFailure === undefined ? (invocation.planOnly ? 0 : exitCodeFor(report)) : 1),
      stdout: `${stdout}\n`,
      stderr:
        receiptFailure === undefined
          ? ''
          : `[verify] ${receiptFailure.id} at ${receiptFailure.location}: ${safeVerifyText(receiptFailure.message, canonicalRoot)}\n`,
      report,
      ...(receiptSink === undefined ? {} : { receiptSink }),
    };
  } catch (cause) {
    return { exitCode: 4, stdout: '', stderr: `${errorMessage(cause)}\n` };
  }
}
