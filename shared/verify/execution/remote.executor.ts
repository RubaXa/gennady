// @file: Verify executor adapter for one read-only exact-SHA provider watch step.
// @spec: CLI-VERIFY
// @consumers: repair-loop

import type { VerifyRemoteProof, VerifyStepResult } from '../model/verify-report.type.ts';
import type { CapabilityMatrix } from '../model/verify-readiness.type.ts';
import type { PlannedVerifyStep } from '../model/verify-step.type.ts';
import type { LocalStepExecution } from './local.executor.ts';
import {
  watchRemotePipeline,
  type RemotePipelineObserver,
  type RemoteWatchResult,
} from './remote-watcher.ts';

/** @purpose Run-scoped immutable remote observation shared by multistack `remote-ci` nodes. */
export type RemoteVerifySession = {
  /** @purpose Capability-reduced provider observer shared by selected remote nodes. */
  readonly observer: RemotePipelineObserver;
  /** @purpose Exact local HEAD that the provider must prove as pushed. */
  readonly sourceSha: string;
  /** @purpose Bounded provider polling cadence override. */
  readonly pollIntervalMs?: number;
  /** @purpose Injectable deterministic watcher used only by contract tests. */
  readonly watch?: typeof watchRemotePipeline;
  /** @purpose One cached observation promise shared across affected plugin nodes. */
  result?: Promise<RemoteWatchResult>;
  /** @purpose Prevent duplicate evidence projection when plugins share the same observation. */
  evidenceClaimed?: boolean;
};

function readinessProblem(
  step: PlannedVerifyStep,
  readiness: CapabilityMatrix
): { readonly code: string; readonly message: string } | null {
  const exact = readiness.entries.filter(
    (entry) => entry.plugin === step.plugin && entry.stepId === step.id
  );
  const pluginWide = readiness.entries.filter(
    (entry) => entry.plugin === step.plugin && entry.stepId === undefined
  );
  const blocked = [...exact, ...pluginWide].find(
    (entry) => entry.status === 'BLOCKED' && entry.blocking !== false
  );
  return blocked === undefined
    ? null
    : { code: 'VERIFY_REMOTE_READINESS_BLOCKED', message: blocked.message };
}

function resultFor(
  step: PlannedVerifyStep,
  watch: RemoteWatchResult,
  durationMs: number
): VerifyStepResult {
  const status =
    watch.state === 'REMOTE_SUCCESS'
      ? 'pass'
      : watch.state === 'REMOTE_TIMED_OUT'
        ? 'timeout'
        : watch.state === 'REMOTE_CANCELLED'
          ? 'cancelled'
          : watch.state === 'REMOTE_UNAVAILABLE' ||
              watch.state === 'REMOTE_UNAUTHORIZED' ||
              watch.state === 'REMOTE_RATE_LIMITED'
            ? 'env-fail'
            : watch.state === 'REMOTE_SHA_MISMATCH' || watch.state === 'REMOTE_PIPELINE_AMBIGUOUS'
              ? 'violation'
              : 'fail';
  return {
    stepId: step.id,
    plugin: step.plugin,
    status,
    exitCode: null,
    durationMs,
    output: status === 'pass' ? '' : watch.message,
  };
}

/**
 * @purpose Observe one remote step without spawning locally or mutating provider state.
 * @param step Validated remote-watch plan node.
 * @param session Run-scoped exact-SHA provider observation session.
 * @param readiness Selected-slice capability facts for the step/plugin.
 * @param [options] Cooperative cancellation forwarded to the watcher.
 * @returns Common executor result plus exact provider proof when a terminal pipeline was observed.
 */
export async function executeRemoteStep(
  step: PlannedVerifyStep,
  session: RemoteVerifySession,
  readiness: CapabilityMatrix,
  options: { readonly signal?: AbortSignal } = {}
): Promise<LocalStepExecution & { readonly remote?: VerifyRemoteProof }> {
  const startedAt = Date.now();
  if (step.executor !== 'vcs-pipeline' || step.effect !== 'remote-watch') {
    return {
      verdict: 'blocked',
      result: null,
      mutations: [],
      evidence: [],
      problem: {
        code: 'VERIFY_REMOTE_STEP_INVALID',
        message: `remote executor cannot run ${step.effect}/${step.executor} step ${step.id}`,
      },
    };
  }
  const blocked = readinessProblem(step, readiness);
  if (blocked !== null) {
    return { verdict: 'blocked', result: null, mutations: [], evidence: [], problem: blocked };
  }
  session.result ??= (session.watch ?? watchRemotePipeline)({
    observer: session.observer,
    sourceSha: session.sourceSha,
    timeoutMs: step.timeoutMs,
    pollIntervalMs: session.pollIntervalMs ?? 5_000,
    signal: options.signal,
  });
  const watched = await session.result;
  const evidence = session.evidenceClaimed === true ? [] : watched.evidence;
  session.evidenceClaimed = true;
  const result = resultFor(step, watched, Date.now() - startedAt);
  const verdict =
    result.status === 'pass'
      ? 'pass'
      : result.status === 'timeout'
        ? 'timeout'
        : result.status === 'cancelled'
          ? 'cancelled'
          : result.status === 'env-fail'
            ? 'env-fail'
            : result.status === 'violation'
              ? 'violation'
              : 'fail';
  return {
    verdict,
    result,
    mutations: [],
    evidence,
    ...(watched.proof === undefined ? {} : { remote: watched.proof }),
    ...(verdict === 'pass'
      ? {}
      : {
          problem: {
            code: `VERIFY_${watched.state}`,
            message: watched.message,
          },
        }),
    ...(verdict === 'cancelled'
      ? {
          cancellation: {
            signal:
              options.signal?.reason === 'SIGTERM' ? ('SIGTERM' as const) : ('SIGINT' as const),
            exitCode: options.signal?.reason === 'SIGTERM' ? (143 as const) : (130 as const),
          },
        }
      : {}),
  };
}
