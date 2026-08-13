// @file: eval-driver — `runEval` drives the REAL role graph (`runMrsOnce`, TSK-121) over a fixed MR
//   list, then evaluates gates G1..G10 (TSK-118 gates.ts) against whatever that real graph actually
//   produced per MR — never a re-orchestrated CLI pipeline (the prior `eval-harness.ts` form is
//   superseded, see TSK-119 Round 0). Composes an EvalReport (TSK-118 eval-report.ts) and writes
//   eval-report.json + .md under the reports dir.
// @consumers: cli/cmd/inbox-eval (TSK-119)
// @tasks: TSK-119, TSK-122

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '#logger';
import {
  runMrsOnce,
  composeRunModePipeline,
  resolveRunModeVcsHost,
  type RunModeDeps,
  type MrRunResult,
} from '../../serve/run-mode.ts';
import type { SeedState } from '../../serve/state-seed.ts';
import { StateStore } from '../inbox-core/state-store.ts';
import { VcsInboxMock } from '../inbox-core/vcs-inbox.mock.ts';
import { VcsInboxReal } from '../inbox-core/vcs-inbox.real.ts';
import type { VcsInboxPort } from '../inbox-core/vcs-inbox.port.ts';
import { OpenCodeMock } from '../inbox-opencode/opencode.mock.ts';
import { OpenCodeReal } from '../inbox-opencode/opencode.real.ts';
import type { OpenCodePort } from '../inbox-opencode/opencode.port.ts';
import { fetchDiffRefsLive } from '../inbox-roles/context-builder.ts';
import type { EffectResult, ReplyAction } from '../inbox-roles/effect-executor.ts';
import {
  evaluateBaseShaSource,
  evaluateBodySizeUnderWaf,
  evaluatePostIdempotent,
  type GateResult,
} from './gates.ts';
import {
  composeEvalReport,
  serializeEvalReportJson,
  serializeEvalReportMarkdown,
  type EvalReport,
  type StageId,
  type StageResult,
} from './eval-report.ts';

/** @purpose Cycle of `StageId` slots this driver reuses as one-per-MR completion markers | @invariant `eval-report.ts` owns the closed StageId union (TSK-118); this driver does not extend it — batches beyond 12 MRs fold onto the last slot. */
const STAGE_SLOTS: StageId[] = [
  'S0',
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'S9',
  'S10',
  'S11',
];

/** @purpose Caller-supplied parameters for one eval run over a real run-mode pass. */
export type RunEvalInput = {
  /** @purpose MR web URLs to drive through the real role graph, in order */
  mrs: string[];
  /** @purpose Optional prior-review state applied before the pass (see `SeedState`) */
  seedState?: SeedState;
  /** @purpose Override for the G9 WAF body-size threshold in bytes */
  wafThreshold?: number;
  /** @purpose Forwarded to `runMrsOnce` | @invariant Default true — an eval run never posts unless the caller opts out explicitly */
  dryRun?: boolean;
};

/** @purpose Injectable dependencies for `runEval` — real adapters by default, `mocks` selects mock adapters (mirrors `serve.cmd.ts --mocks`), direct overrides bypass wiring entirely for tests. */
export type RunEvalDeps = {
  /** @purpose Gennady state root override (defaults to `~/.gennady` via `StateStore`) */
  stateDir?: string;
  /** @purpose Select VcsInboxMock/OpenCodeMock over the real adapters when `runModeDeps` is not supplied */
  mocks?: boolean;
  /** @purpose Override for the reports directory (defaults under `StateStore.getStateDir()`) */
  reportsDir?: string;
  /** @purpose Override for `runMrsOnce` itself — the sole seam tests need to inject canned artifacts/actions without a real graph */
  runMrsOnce?: typeof runMrsOnce;
  /** @purpose Override for the full `RunModeDeps` bundle (engine/store/vcs/opencode/fetchDiffRefs); skips all default wiring when supplied */
  runModeDeps?: RunModeDeps;
  /**
   * @purpose Clock override
   * @returns Current timestamp as an ISO string.
   */
  now?: () => string;
};

/** @purpose Full outcome of one `runEval` call. */
export type RunEvalResult = {
  /** @purpose Composed eval report — `mr` carries the comma-joined MR batch; gates/stages aggregate across every MR the real graph drove */
  report: EvalReport;
  /** @purpose Directory the report was written into */
  reportDir: string;
};

/**
 * @purpose Resolve real (or mock, per `deps.mocks`) `RunModeDeps` mirroring `serve.cmd.ts --mrs`'s
 *   own wiring — this driver reuses that construction rather than inventing a second one.
 * @param deps Caller-supplied deps; `runModeDeps` bypasses this construction entirely.
 * @param mrs MR batch this eval run targets — feeds `resolveRunModeVcsHost` (gap-1, TSK-122) when
 *   `deps.mocks` is false.
 * @returns Store + fully wired `RunModeDeps`.
 * @sideEffect Opens durable pipeline journals and composes the selected VCS/OpenCode adapters.
 */
async function _resolveRunModeDeps(
  deps: RunEvalDeps,
  mrs: string[]
): Promise<{ store: StateStore; runModeDeps: RunModeDeps }> {
  if (deps.runModeDeps) {
    return {
      store: deps.runModeDeps.store ?? new StateStore(deps.stateDir),
      runModeDeps: deps.runModeDeps,
    };
  }

  const store = new StateStore(deps.stateDir);
  // gap-1 (TSK-122): derive host from the MR batch (or fall back to config) — a bare
  // VcsInboxReal({ token }) with no host always threw CONFIG: No VCS host configured.
  const vcsHost = deps.mocks ? undefined : await resolveRunModeVcsHost(mrs, store);
  const vcs: VcsInboxPort = deps.mocks
    ? new VcsInboxMock()
    : new VcsInboxReal({ host: vcsHost, token: process.env.GITLAB_PERSONAL_TOKEN });
  const opencode: OpenCodePort = deps.mocks
    ? new OpenCodeMock()
    : new OpenCodeReal({ directory: store.getStateDir(), baseUrl: 'http://localhost:4096' });

  const pipeline = composeRunModePipeline(store, opencode, deps.mocks ? 'mock' : 'production');
  return {
    store,
    runModeDeps: {
      pipeline,
      store,
      vcs,
      fetchDiffRefs: deps.mocks ? async () => ({ headSha: 'mock-eval-head' }) : fetchDiffRefsLive,
    },
  };
}

/**
 * @purpose Scan one MR's accumulated artifacts for every staged `ReplyAction` — the shape a
 *   session's `node_synthesize`/`node_thread_triage` artifact stages before `ask`-node approval.
 * @invariant Structural scan only (object → `proposedActions` array field); never assumes which
 *   node stages actions — that is a role-graph concern, not this driver's.
 * @param artifacts `MrRunResult.artifacts` (or null when the MR's role was unresolved).
 * @returns Every `ReplyAction` found, in artifact-key then array order.
 */
function _collectReplyActions(artifacts: Record<string, unknown> | null): ReplyAction[] {
  if (!artifacts) return [];
  const found: ReplyAction[] = [];

  for (const value of Object.values(artifacts)) {
    const candidate = value as { proposedActions?: unknown };
    if (!Array.isArray(candidate?.proposedActions)) continue;
    for (const action of candidate.proposedActions) {
      if ((action as { type?: string })?.type === 'reply') found.push(action as ReplyAction);
    }
  }

  return found;
}

/**
 * @purpose Scan one MR's accumulated artifacts for an `EffectResult`-shaped value (an `outcomes`
 *   array of per-action statuses) — the same shape `node_effect` stages once EffectExecutor runs.
 * @param artifacts `MrRunResult.artifacts` (or null when the MR's role was unresolved).
 * @returns The first matching `EffectResult`, or undefined when the graph never reached an effect node.
 */
function _extractEffectResult(artifacts: Record<string, unknown> | null): EffectResult | undefined {
  if (!artifacts) return undefined;
  for (const value of Object.values(artifacts)) {
    const candidate = value as { outcomes?: unknown };
    if (Array.isArray(candidate?.outcomes)) return candidate as EffectResult;
  }
  return undefined;
}

/**
 * @purpose Derive this MR's `StageResult` — a per-MR completion marker, not a pipeline step (the
 *   S0..S11 pipeline-stage concept belonged to the now-deleted CLI re-orchestration harness).
 * @invariant `done` iff state is `done`/`awaiting_operator` — `error`/`unresolved_role` stay
 *   not-done, so a crashed MR fails the report even with trivially-passing gates.
 * @param result One MR's `runMrsOnce` outcome.
 * @param index This MR's position in the input list — selects the reused `StageId` slot.
 * @returns `StageResult` for this MR.
 */
function _deriveMrStage(result: MrRunResult, index: number): StageResult {
  const done = result.state === 'completed';
  const slot = STAGE_SLOTS[Math.min(index, STAGE_SLOTS.length - 1)] as StageId;
  return {
    stage: slot,
    done,
    detail: `${result.mr} state=${result.state}${result.role ? ` role=${result.role}` : ''}`,
  };
}

/**
 * @purpose Evaluate gates checkable from one MR's real-graph output: G1 (base-sha presence,
 *   `artifacts.baseSha`) and G9 (WAF body-size, per reply body).
 * @invariant G2..G8, G10 need scaffold/validator/diff-hunk/worktree data `MrRunResult` lacks —
 *   intentionally NOT evaluated here rather than fabricated; see Handoff `open`.
 * @param result One MR's `runMrsOnce` outcome.
 * @param wafThreshold G9 threshold override.
 * @returns Every gate this driver could evaluate for this MR.
 */
function _evaluateMrGates(result: MrRunResult, wafThreshold: number | undefined): GateResult[] {
  const gates: GateResult[] = [];
  const artifacts = result.artifacts;
  const baseSha = (artifacts?.baseSha as string | undefined) ?? '';

  if (baseSha) {
    gates.push(evaluateBaseShaSource({ usedBaseSha: baseSha, contextBaseSha: baseSha }));
  }

  for (const action of _collectReplyActions(artifacts)) {
    if (typeof action.body === 'string') {
      gates.push(evaluateBodySizeUnderWaf(action.body, wafThreshold));
    }
  }

  return gates;
}

/**
 * @purpose Evaluate G10 across the batch: a second identical dry-run pass must apply zero new
 *   outcomes. Runs only when `dryRun`.
 * @invariant Falls back to a zero-outcome pass when no MR carries an `EffectResult` (`node_effect`
 *   is a no-op stub today) — honest "nothing posted" evidence.
 * @param input Original eval input.
 * @param runModeFn `runMrsOnce` (or its test override).
 * @param runModeDeps Injected services for the second pass.
 * @returns Exactly one G10 `GateResult`.
 * @sideEffect Drives the real graph a second time end-to-end (network/filesystem per `runMrsOnce`).
 */
async function _evaluateIdempotencyGate(
  input: RunEvalInput,
  runModeFn: typeof runMrsOnce,
  runModeDeps: RunModeDeps
): Promise<GateResult> {
  const secondPass = await runModeFn({
    mrs: input.mrs,
    seedState: input.seedState,
    dryRun: true,
    deps: runModeDeps,
  });

  for (const mrResult of secondPass.results) {
    const effectResult = _extractEffectResult(mrResult.artifacts);
    if (effectResult) return evaluatePostIdempotent(effectResult);
  }

  return evaluatePostIdempotent({ outcomes: [] });
}

/**
 * @purpose Drive the real role graph over `input.mrs` (`runMrsOnce`, TSK-121) and evaluate gates
 *   G1..G10 (TSK-118) against its actual output — never a re-orchestrated CLI pipeline.
 * @invariant One `runEval` call composes exactly one `EvalReport` for the whole batch; `mr` carries
 *   the comma-joined MR list.
 * @param input MR batch + run parameters.
 * @param [deps] Injectable dependencies — real defaults for wiring, direct overrides for tests.
 * @returns Composed `EvalReport` plus the directory it was written into.
 * @sideEffect Drives the real role graph (network/filesystem per `runMrsOnce`, twice when
 *   `dryRun`). FS: writes `eval-report.json`/`.md` under the reports dir.
 */
export async function runEval(input: RunEvalInput, deps: RunEvalDeps = {}): Promise<RunEvalResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const dryRun = input.dryRun ?? true;

  const { store, runModeDeps } = await _resolveRunModeDeps(deps, input.mrs);
  const runModeFn = deps.runMrsOnce ?? runMrsOnce;

  logger.info('[runEval] [idle → driving]', { mrCount: input.mrs.length, dryRun });

  const passResult = await runModeFn({
    mrs: input.mrs,
    seedState: input.seedState,
    dryRun,
    deps: runModeDeps,
  });

  const stages: StageResult[] = passResult.results.map((r, i) => _deriveMrStage(r, i));
  const gates: GateResult[] = passResult.results.flatMap((r) =>
    _evaluateMrGates(r, input.wafThreshold)
  );

  if (dryRun) {
    gates.push(await _evaluateIdempotencyGate(input, runModeFn, runModeDeps));
  }

  const finishedAt = now();
  const report = composeEvalReport({
    mr: input.mrs.join(', '),
    startedAt,
    finishedAt,
    stages,
    gates,
  });

  const reportDir = deps.reportsDir ?? join(store.getStateDir(), 'agent-inbox', 'eval-reports');

  // #region START_WRITE_REPORT — best-effort: a write failure must not mask the computed report
  try {
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'eval-report.json'), serializeEvalReportJson(report));
    writeFileSync(join(reportDir, 'eval-report.md'), serializeEvalReportMarkdown(report));
  } catch (cause) {
    logger.error('[runEval] [composing → write_failed]', { error: cause as Error });
  }
  // #endregion END_WRITE_REPORT

  logger.info('[runEval] [driving → done]', { status: report.status, reportDir });
  return { report, reportDir };
}
