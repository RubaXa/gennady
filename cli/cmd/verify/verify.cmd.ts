// @file: Unified public verify planning, local execution and report composition facade.
// @spec: CLI-VERIFY
// @consumers: gennady.ts

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import {
  emitSddReceipt,
  type SddReceiptCommandBinding,
} from '../../../shared/sdd/verify/sdd-receipt-sink.ts';
import type { SddVerifyContext } from '../../../shared/sdd/verify/sdd-verify-context.ts';
import { runLocalVerifyPlan } from '../../../shared/verify/execution/repair-loop.ts';
import type { VerifyScope } from '../../../shared/verify/model/verify-context.type.ts';
import type { VerifyRunReport } from '../../../shared/verify/model/verify-report.type.ts';
import { resolveMultistackVerifyPlan } from '../../../shared/verify/planning/resolve-multistack.ts';
import { buildVerifyRunReport } from '../../../shared/verify/reporting/build-report.ts';
import { renderVerifyJson } from '../../../shared/verify/reporting/json-reporter.ts';
import { safeVerifyText } from '../../../shared/verify/reporting/report-safety.ts';
import { renderVerifyText } from '../../../shared/verify/reporting/text-reporter.ts';
import type { VerifyInvocation } from './verify.types.ts';

type SddReceiptPersistence = NonNullable<Parameters<typeof emitSddReceipt>[4]>;
type SddReceiptSinkResult = Awaited<ReturnType<typeof emitSddReceipt>>;
/** @purpose Caller-resolved planning scope; standalone CLI never derives it from SDD state. */
type VerifyCommandRequest = {
  readonly scope: VerifyScope;
  readonly knownDeletedFiles?: readonly string[];
  /** @purpose Optional workflow identity projected into the report without reading its source. */
  readonly workflow?: {
    readonly task: string;
    readonly phase: string;
  };
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
    /** @purpose Optional scope already resolved by a trusted caller such as the SDD facade. */
    readonly request?: VerifyCommandRequest;
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
    const receiptRequest = options.sdd?.context.request;
    const request =
      options.request ??
      (receiptRequest === undefined
        ? undefined
        : {
            scope: receiptRequest.scope,
            knownDeletedFiles: receiptRequest.deletedFiles ?? [],
            ...(receiptRequest.task === undefined || receiptRequest.sddPhase === undefined
              ? {}
              : { workflow: { task: receiptRequest.task, phase: receiptRequest.sddPhase } }),
          });
    const planning = resolveMultistackVerifyPlan(canonicalRoot, invocation.phase, {
      scope: request?.scope ?? { mode: 'all', files: [] },
      ...(request?.knownDeletedFiles === undefined
        ? {}
        : { knownDeletedFiles: request.knownDeletedFiles }),
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
      ...(request?.workflow === undefined
        ? {}
        : {
            sdd: {
              task: request.workflow.task,
              phase: request.workflow.phase,
              deletedFiles: request.knownDeletedFiles ?? [],
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
