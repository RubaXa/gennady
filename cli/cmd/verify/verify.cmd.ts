// @file: Unified public verify planning, local execution and report composition facade.
// @spec: CLI-VERIFY
// @consumers: gennady.ts

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { runLocalVerifyPlan } from '../../../shared/verify/execution/repair-loop.ts';
import type { RemotePipelineObserver } from '../../../shared/verify/execution/remote-watcher.ts';
import type { VerifyScope } from '../../../shared/verify/model/verify-context.type.ts';
import type { VerifyRuleSnapshot } from '../../../shared/verify/model/verify-context.type.ts';
import type { VerifyRunReport } from '../../../shared/verify/model/verify-report.type.ts';
import { resolveMultistackVerifyPlan } from '../../../shared/verify/planning/resolve-multistack.ts';
import { buildVerifyRunReport } from '../../../shared/verify/reporting/build-report.ts';
import { renderVerifyJson } from '../../../shared/verify/reporting/json-reporter.ts';
import { renderVerifyText } from '../../../shared/verify/reporting/text-reporter.ts';
import type { VerifyInvocation } from './verify.types.ts';
import { resolveRemotePipelineObserver } from './remote-provider.ts';

/** @purpose Caller-resolved planning scope; standalone CLI never derives it from SDD state. */
type VerifyCommandRequest = {
  readonly scope: VerifyScope;
  readonly knownDeletedFiles?: readonly string[];
  /** @purpose Exact pre-dispatch snapshot supplied by a workflow owner; Verify never resolves it. */
  readonly rules?: VerifyRuleSnapshot;
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
    /** @purpose Internal read-only pre-commit policy; never exposed as a public CLI flag. */
    readonly stagedCandidate?: boolean;
    /** @purpose Deterministic fake/provider injection for exact-SHA remote contract tests. */
    readonly remoteObserver?: RemotePipelineObserver;
    /** @purpose Injectable provider discovery; defaults to origin+credential read-only resolution. */
    readonly resolveRemoteObserver?: typeof resolveRemotePipelineObserver;
    /** @purpose Optional scope already resolved by a trusted caller such as the SDD facade. */
    readonly request?: VerifyCommandRequest;
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
    const request = options.request;
    const planning = resolveMultistackVerifyPlan(canonicalRoot, invocation.phase, {
      scope: request?.scope ?? { mode: 'all', files: [] },
      ...(request?.knownDeletedFiles === undefined
        ? {}
        : { knownDeletedFiles: request.knownDeletedFiles }),
      ...(options.homeDirectory === undefined ? {} : { homeDirectory: options.homeDirectory }),
    });
    const plannedHeadSha = headSha(canonicalRoot);
    let executionPlanning = planning;
    const remoteRequired = executionPlanning.plan.trust.level === 'remote-provider';
    const remoteResolution = remoteRequired
      ? options.remoteObserver === undefined
        ? (options.resolveRemoteObserver ?? resolveRemotePipelineObserver)(canonicalRoot)
        : { ok: true as const, observer: options.remoteObserver }
      : undefined;
    if (remoteRequired) {
      const resolvedRemote = remoteResolution!;
      executionPlanning = {
        ...executionPlanning,
        readiness: {
          ...executionPlanning.readiness,
          entries: executionPlanning.readiness.entries.map((entry) =>
            entry.requirementId.endsWith(':selector-trust')
              ? resolvedRemote.ok
                ? {
                    ...entry,
                    status: 'READY' as const,
                    message: `${resolvedRemote.observer.provider} exact-SHA observer is available`,
                    fix: undefined,
                  }
                : { ...entry, message: resolvedRemote.message, fix: resolvedRemote.fix }
              : entry
          ),
          status:
            resolvedRemote.ok &&
            executionPlanning.readiness.entries.every(
              (entry) =>
                entry.requirementId.endsWith(':selector-trust') ||
                entry.status !== 'BLOCKED' ||
                entry.blocking === false
            )
              ? executionPlanning.readiness.entries.some(
                  (entry) =>
                    !entry.requirementId.endsWith(':selector-trust') && entry.status !== 'READY'
                )
                ? 'DEGRADED'
                : 'READY'
              : 'BLOCKED',
        },
      };
    }
    const execution = invocation.planOnly
      ? undefined
      : await runLocalVerifyPlan(
          canonicalRoot,
          executionPlanning.plan,
          executionPlanning.readiness,
          {
            signal: options.signal,
            cancellationSignal: options.cancellationSignal,
            signalHandlers: false,
            stagedCandidate: options.stagedCandidate,
            ...(remoteRequired && remoteResolution?.ok
              ? {
                  remote: {
                    observer: remoteResolution.observer,
                    sourceSha: plannedHeadSha,
                  },
                }
              : {}),
          }
        );
    const report = buildVerifyRunReport({
      root: canonicalRoot,
      phase: invocation.phase,
      headSha: plannedHeadSha,
      planning: executionPlanning,
      execution,
      ...(request?.rules === undefined ? {} : { rules: request.rules }),
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
