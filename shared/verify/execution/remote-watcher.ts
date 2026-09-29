// @file: Provider-neutral read-only exact-SHA pipeline watcher.
// @spec: CLI-VERIFY
// @consumers: remote.executor

import { createHash } from 'node:crypto';
import type { VcsClientPipeline } from '../../../services/vcs-client/abstract/vcs-client-pipeline.ts';
import type { VcsJob } from '../../../services/vcs-client/entities/vcs-job.type.ts';
import type { VcsPipelineSummary } from '../../../services/vcs-client/entities/vcs-pipeline-summary.type.ts';
import type { VerifyEvidence, VerifyRemoteProof } from '../model/verify-report.type.ts';

/** @purpose Enumerate progress, terminal, provider-error, timeout and cancellation outcomes. */
export type RemotePipelineState =
  | 'REMOTE_PENDING'
  | 'REMOTE_NOT_FOUND_YET'
  | 'REMOTE_SUCCESS'
  | 'REMOTE_FAILED'
  | 'REMOTE_CANCELED'
  | 'REMOTE_MANUAL'
  | 'REMOTE_SKIPPED'
  | 'REMOTE_TIMED_OUT'
  | 'REMOTE_UNAVAILABLE'
  | 'REMOTE_UNAUTHORIZED'
  | 'REMOTE_RATE_LIMITED'
  | 'REMOTE_SHA_MISMATCH'
  | 'REMOTE_PIPELINE_AMBIGUOUS'
  | 'REMOTE_CANCELLED';

/** @purpose Expose only read-only provider capabilities required by exact-SHA Verify. */
export type RemotePipelineObserver = {
  /** @purpose Provider dialect used for status and evidence identity. */
  readonly provider: 'gitlab' | 'github';
  /** @purpose Provider-relative project identity. */
  readonly project: string;
  /** @purpose Capability-reduced pipeline port with no mutation methods. */
  readonly pipeline: Pick<
    VcsClientPipeline,
    'hasCommit' | 'findPipelinesBySha' | 'getPipeline' | 'getPipelineJobs' | 'getJobLog'
  >;
};

/** @purpose Return one typed bounded observation outcome without implicit success. */
export type RemoteWatchResult = {
  /** @purpose Typed progress/error/terminal classification. */
  readonly state: RemotePipelineState;
  /** @purpose Raw provider status when a pipeline was pinned. */
  readonly rawStatus?: string;
  /** @purpose Immutable pipeline id when discovery succeeded. */
  readonly pipelineId?: string;
  /** @purpose Complete exact-SHA proof only for provider terminal states. */
  readonly proof?: VerifyRemoteProof;
  /** @purpose Bounded redacted terminal provider evidence. */
  readonly evidence: readonly VerifyEvidence[];
  /** @purpose Actionable bounded operator summary. */
  readonly message: string;
};

type RemoteWatchRuntime = {
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly observedAt?: () => string;
  readonly onTransition?: (
    state: RemotePipelineState,
    pipeline?: Pick<VcsPipelineSummary, 'id' | 'sha' | 'status'>
  ) => void;
};

const TERMINAL = new Map<string, RemotePipelineState>([
  ['success', 'REMOTE_SUCCESS'],
  ['passed', 'REMOTE_SUCCESS'],
  ['failed', 'REMOTE_FAILED'],
  ['failure', 'REMOTE_FAILED'],
  ['timed_out', 'REMOTE_FAILED'],
  ['startup_failure', 'REMOTE_FAILED'],
  ['stale', 'REMOTE_FAILED'],
  ['neutral', 'REMOTE_FAILED'],
  ['canceled', 'REMOTE_CANCELED'],
  ['cancelled', 'REMOTE_CANCELED'],
  ['manual', 'REMOTE_MANUAL'],
  ['action_required', 'REMOTE_MANUAL'],
  ['skipped', 'REMOTE_SKIPPED'],
]);
const PENDING = new Set([
  'created',
  'pending',
  'running',
  'preparing',
  'scheduled',
  'requested',
  'waiting',
  'waiting_for_resource',
  'canceling',
  'queued',
  'in_progress',
]);
const LOG_BYTES = 16 * 1024;
const TOTAL_LOG_BYTES = 64 * 1024;
const MAX_REMOTE_JOBS = 256;
const FAILED_JOB_STATUSES = new Set(['failed', 'failure', 'timed_out', 'startup_failure', 'stale']);

class RemoteDeadlineError extends Error {
  constructor() {
    super('remote provider request exceeded the exact-SHA observation deadline');
    this.name = 'RemoteDeadlineError';
  }
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function boundedRedactedLog(value: string, byteLimit = LOG_BYTES): string {
  const normalized = value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '\n')
    .replace(/\b(Bearer|PRIVATE-TOKEN:)\s+\S+/gi, '$1 [redacted]')
    .replace(
      /\b(token|password|secret|authorization|api[_-]?key)\s*([=:])\s*\S+/gi,
      '$1$2[redacted]'
    );
  if (Buffer.byteLength(normalized) <= byteLimit) return normalized;
  const marker = '\n[remote log truncated]';
  if (byteLimit < Buffer.byteLength(marker)) return '';
  const budget = Math.max(0, byteLimit - Buffer.byteLength(marker));
  let result = '';
  let bytes = 0;
  for (const character of normalized) {
    const size = Buffer.byteLength(character);
    if (bytes + size > budget) break;
    result += character;
    bytes += size;
  }
  return `${result}${marker}`;
}

function providerFailure(cause: unknown): RemoteWatchResult {
  const message = cause instanceof Error ? cause.message : String(cause);
  const state = /\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(message)
    ? 'REMOTE_UNAUTHORIZED'
    : /\b429\b|rate.?limit/i.test(message)
      ? 'REMOTE_RATE_LIMITED'
      : 'REMOTE_UNAVAILABLE';
  return { state, evidence: [], message };
}

function exactCandidates(
  candidates: readonly VcsPipelineSummary[],
  sha: string
): readonly VcsPipelineSummary[] | RemoteWatchResult {
  if (candidates.some((candidate) => candidate.sha !== sha)) {
    return {
      state: 'REMOTE_SHA_MISMATCH',
      evidence: [],
      message: 'provider returned a pipeline outside the requested exact SHA',
    };
  }
  const definitions = [...new Set(candidates.map((candidate) => candidate.definitionId))].sort();
  if (definitions.length > 1) {
    return {
      state: 'REMOTE_PIPELINE_AMBIGUOUS',
      evidence: [],
      message: `exact SHA has multiple pipeline definitions: ${definitions.join(', ')}`,
    };
  }
  return [...candidates].sort((left, right) => {
    const leftCreated = left.createdAt ?? '';
    const rightCreated = right.createdAt ?? '';
    if (leftCreated !== rightCreated) return leftCreated < rightCreated ? 1 : -1;
    const attempt = (right.attempt ?? 0) - (left.attempt ?? 0);
    if (attempt !== 0 || left.id === right.id) return attempt;
    return left.id < right.id ? 1 : -1;
  });
}

function isWatchResult(
  value: readonly VcsPipelineSummary[] | RemoteWatchResult
): value is RemoteWatchResult {
  return !Array.isArray(value);
}

function jobProjection(job: VcsJob, logIdentity?: string): VerifyRemoteProof['jobs'][number] {
  return {
    id: job.id,
    name: job.name,
    rawStatus: job.status,
    ...(logIdentity === undefined ? {} : { logIdentity }),
  };
}

async function boundedProviderCall<T>(input: {
  readonly operation: (signal: AbortSignal) => Promise<T>;
  readonly parentSignal?: AbortSignal;
  readonly remainingMs: number;
}): Promise<T> {
  if (input.parentSignal?.aborted) throw new Error('remote observation cancelled');
  if (input.remainingMs <= 0) throw new RemoteDeadlineError();
  const controller = new AbortController();
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.parentSignal?.removeEventListener('abort', cancel);
      callback();
    };
    const cancel = (): void => {
      controller.abort(input.parentSignal?.reason);
      finish(() => reject(new Error('remote observation cancelled')));
    };
    const timer = setTimeout(() => {
      controller.abort(new RemoteDeadlineError());
      finish(() => reject(new RemoteDeadlineError()));
    }, input.remainingMs);
    input.parentSignal?.addEventListener('abort', cancel, { once: true });
    void input
      .operation(controller.signal)
      .then((value) => finish(() => resolve(value)))
      .catch((cause: unknown) => finish(() => reject(cause)));
  });
}

/**
 * @purpose Observe one exact pushed SHA and pin a single provider pipeline id until terminal.
 * @param input Read-only observer, exact source identity, bounds, cancellation and optional clock.
 * @returns Typed terminal/error result with bounded evidence and no provider mutation.
 */
export async function watchRemotePipeline(input: {
  readonly observer: RemotePipelineObserver;
  readonly sourceSha: string;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
  readonly signal?: AbortSignal;
  readonly runtime?: RemoteWatchRuntime;
}): Promise<RemoteWatchResult> {
  if (!/^[0-9a-f]{40,64}$/.test(input.sourceSha)) {
    return {
      state: 'REMOTE_SHA_MISMATCH',
      evidence: [],
      message: 'source SHA must be a full lowercase hexadecimal identity',
    };
  }
  if (
    !Number.isInteger(input.timeoutMs) ||
    input.timeoutMs <= 0 ||
    !Number.isInteger(input.pollIntervalMs) ||
    input.pollIntervalMs <= 0
  ) {
    return {
      state: 'REMOTE_UNAVAILABLE',
      evidence: [],
      message: 'remote watcher timeout and polling interval must be positive integers',
    };
  }
  const now = input.runtime?.now ?? Date.now;
  const observedAt = input.runtime?.observedAt ?? (() => new Date().toISOString());
  const sleep =
    input.runtime?.sleep ??
    ((milliseconds: number, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(new Error('aborted'));
        const timer = setTimeout(resolve, milliseconds);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error('aborted'));
          },
          { once: true }
        );
      }));
  const deadline = now() + input.timeoutMs;
  let pinned: VcsPipelineSummary | undefined;
  let lastTransition: RemotePipelineState | undefined;
  const transition = (state: RemotePipelineState, pipeline?: VcsPipelineSummary): void => {
    if (lastTransition === state) return;
    lastTransition = state;
    input.runtime?.onTransition?.(state, pipeline);
  };
  const observe = async <T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> =>
    await boundedProviderCall({
      operation,
      parentSignal: input.signal,
      remainingMs: deadline - now(),
    });
  const timeoutResult = (): RemoteWatchResult => ({
    state: 'REMOTE_TIMED_OUT',
    ...(pinned === undefined ? {} : { pipelineId: pinned.id, rawStatus: pinned.status }),
    evidence: [],
    message:
      pinned === undefined
        ? 'exact-SHA pipeline was not found before timeout'
        : `pinned pipeline ${pinned.id} did not reach terminal state before timeout`,
  });
  try {
    if (
      !(await observe(
        async (signal) =>
          await input.observer.pipeline.hasCommit({
            project: input.observer.project,
            sha: input.sourceSha,
            signal,
          })
      ))
    ) {
      return {
        state: 'REMOTE_SHA_MISMATCH',
        evidence: [],
        message: `provider cannot resolve pushed commit ${input.sourceSha}`,
      };
    }
    while (now() < deadline) {
      if (input.signal?.aborted) {
        return { state: 'REMOTE_CANCELLED', evidence: [], message: 'remote observation cancelled' };
      }
      if (pinned === undefined) {
        const candidates = exactCandidates(
          await observe(
            async (signal) =>
              await input.observer.pipeline.findPipelinesBySha({
                project: input.observer.project,
                sha: input.sourceSha,
                signal,
              })
          ),
          input.sourceSha
        );
        if (isWatchResult(candidates)) return candidates;
        pinned = candidates[0];
        if (pinned === undefined) {
          transition('REMOTE_NOT_FOUND_YET');
          await sleep(Math.min(input.pollIntervalMs, Math.max(0, deadline - now())), input.signal);
          continue;
        }
      } else {
        const identity = { id: pinned.id, definitionId: pinned.definitionId };
        const observed = await observe(
          async (signal) =>
            await input.observer.pipeline.getPipeline({
              project: input.observer.project,
              pipelineId: identity.id,
              signal,
            })
        );
        if (observed.id !== identity.id || observed.definitionId !== identity.definitionId) {
          return {
            state: 'REMOTE_PIPELINE_AMBIGUOUS',
            pipelineId: identity.id,
            evidence: [],
            message: `pinned pipeline identity changed from ${identity.definitionId}:${identity.id}`,
          };
        }
        pinned = observed;
      }
      if (pinned.id === '' || pinned.sha !== input.sourceSha) {
        return {
          state: 'REMOTE_SHA_MISMATCH',
          pipelineId: pinned.id,
          rawStatus: pinned.status,
          evidence: [],
          message: `pinned pipeline ${pinned.id || '<missing>'} does not prove ${input.sourceSha}`,
        };
      }
      const raw = pinned.status.toLowerCase();
      const terminal = TERMINAL.get(raw);
      if (terminal === undefined) {
        if (!PENDING.has(raw)) {
          return {
            state: 'REMOTE_UNAVAILABLE',
            pipelineId: pinned.id,
            rawStatus: pinned.status,
            evidence: [],
            message: `unknown provider pipeline status ${JSON.stringify(pinned.status)}`,
          };
        }
        transition('REMOTE_PENDING', pinned);
        await sleep(Math.min(input.pollIntervalMs, Math.max(0, deadline - now())), input.signal);
        continue;
      }
      const terminalPipeline = pinned;
      const jobs = await observe(
        async (signal) =>
          await input.observer.pipeline.getPipelineJobs({
            project: input.observer.project,
            pipelineId: terminalPipeline.id,
            signal,
          })
      );
      if (jobs.length > MAX_REMOTE_JOBS) {
        return {
          state: 'REMOTE_UNAVAILABLE',
          pipelineId: pinned.id,
          rawStatus: pinned.status,
          evidence: [],
          message: `pinned pipeline ${pinned.id} returned ${jobs.length} jobs; maximum is ${MAX_REMOTE_JOBS}`,
        };
      }
      const evidence: VerifyEvidence[] = [];
      const projectedJobs: VerifyRemoteProof['jobs'][number][] = [];
      let remainingLogBytes = TOTAL_LOG_BYTES;
      for (const job of [...jobs].sort((left, right) => left.id.localeCompare(right.id))) {
        let logIdentity: string | undefined;
        if (FAILED_JOB_STATUSES.has(job.status.toLowerCase())) {
          const rawLog = await observe(
            async (signal) =>
              await input.observer.pipeline.getJobLog({
                project: input.observer.project,
                jobId: job.id,
                signal,
              })
          );
          logIdentity = sha256(rawLog);
          if (remainingLogBytes > 0) {
            const excerpt = boundedRedactedLog(rawLog, Math.min(LOG_BYTES, remainingLogBytes));
            remainingLogBytes = Math.max(0, remainingLogBytes - Buffer.byteLength(excerpt));
            if (excerpt !== '') {
              evidence.push({
                kind: 'log',
                identity: `${input.observer.provider}:job:${job.id}:${logIdentity}`,
                summary: excerpt,
              });
            }
          }
        }
        projectedJobs.push(jobProjection(job, logIdentity));
      }
      const proof: VerifyRemoteProof = {
        schema: 'gennady.verify-remote-proof.v1',
        provider: input.observer.provider,
        project: input.observer.project,
        definitionId: pinned.definitionId,
        sourceSha: input.sourceSha,
        pipelineId: pinned.id,
        pipelineSha: pinned.sha,
        rawStatus: pinned.status,
        terminalState: terminal as VerifyRemoteProof['terminalState'],
        observedAt: observedAt(),
        jobs: projectedJobs,
      };
      evidence.unshift({
        kind: 'remote-pipeline',
        identity: `${input.observer.provider}:${input.observer.project}:${pinned.id}:${input.sourceSha}`,
        summary: `${terminal} pipeline=${pinned.id} sha=${input.sourceSha} jobs=${jobs.length}`,
      });
      transition(terminal, pinned);
      return {
        state: terminal,
        rawStatus: pinned.status,
        pipelineId: pinned.id,
        proof,
        evidence,
        message: `${terminal} for pinned pipeline ${pinned.id}`,
      };
    }
    return timeoutResult();
  } catch (cause) {
    if (input.signal?.aborted) {
      return { state: 'REMOTE_CANCELLED', evidence: [], message: 'remote observation cancelled' };
    }
    if (cause instanceof RemoteDeadlineError) return timeoutResult();
    return providerFailure(cause);
  }
}
