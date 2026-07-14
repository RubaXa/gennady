// @file: run-mode — one-shot serve pass: feeds a fixed MR list through the real role graph
//   (live NodeContext, dry-run effects) and returns a per-MR result. Closes the serve-mode gap for
//   TSK-121/EV-10: prep branches on real signals, effect nodes call the real EffectExecutor, and an
//   optional seed restores prior review state before the pass runs.
// @consumers: cli/cmd/inbox/serve.cmd.ts (--mrs run-mode entry point)
// @tasks: TSK-121

import { logger } from '#logger';
import { RoleInstance, type RoleInstanceCheckpoint } from '../modules/inbox-roles/role-instance.ts';
import type { RoleEngine } from '../modules/inbox-roles/role-engine.ts';
import type { InstanceState } from '../modules/inbox-roles/errors.ts';
import type { RoleArtifacts } from '../modules/inbox-roles/role-node.ts';
import {
  buildNodeContext,
  fetchDiffRefsLive,
  type ContextBuilderDeps,
} from '../modules/inbox-roles/context-builder.ts';
import type { VcsInboxPort } from '../modules/inbox-core/vcs-inbox.port.ts';
import type { StateStore } from '../modules/inbox-core/state-store.ts';
import type { OpenCodePort } from '../modules/inbox-opencode/opencode.port.ts';
import { applySeedState, type SeedState } from './state-seed.ts';

/** @purpose Bound guarding the drive-to-terminal loop per MR | @invariant One-shot mode has no external tick timer to hand control back to — the loop must self-limit against a stuck gate-fail/session-retry cycle. */
const MAX_STEPS_PER_MR = 50;

/**
 * @purpose Services `runMrsOnce` drives the graph with — real adapters in production,
 *   mocks (VcsInboxMock/OpenCodeMock) in eval/test runs.
 */
export type RunModeDeps = {
  /** @purpose Role engine, already loaded (loadAll()) — provides the graph per resolved role */
  engine: RoleEngine;
  /** @purpose State store bound to the target state directory (registry + audit) */
  store: StateStore;
  /** @purpose VCS adapter — read-only lookups plus the EffectExecutor's mutation path */
  vcs: VcsInboxPort;
  /** @purpose OpenCode adapter for session nodes */
  opencode: OpenCodePort;
  /** @purpose Diff-refs resolver override — injectable for tests; defaults to `fetchDiffRefsLive` */
  fetchDiffRefs?: ContextBuilderDeps['fetchDiffRefs'];
};

/** @purpose Inputs for one `runMrsOnce` pass. */
export type RunMrsOnceOpts = {
  /** @purpose MR web URLs to process, in order */
  mrs: string[];
  /** @purpose Optional prior-review state applied to the registry before assignment */
  seedState?: SeedState;
  /** @purpose Forwarded to every RoleInstance's effect nodes | @default true — a run-mode pass never posts unless the caller opts out explicitly */
  dryRun?: boolean;
  /** @purpose Injected services */
  deps: RunModeDeps;
};

/** @purpose Per-MR outcome of a `runMrsOnce` pass. */
export type MrRunResult = {
  /** @purpose MR web URL this result belongs to */
  mr: string;
  /** @purpose Terminal instance state, or 'unresolved_role' when the MR carries no myRole */
  state: InstanceState | 'unresolved_role';
  /** @purpose Role the graph ran under, or null when unresolved */
  role: string | null;
  /** @purpose Dashboard-shaped snapshot from `RoleInstance.getBoardView()`, or null when unresolved */
  board: Record<string, unknown> | null;
  /** @purpose Accumulated artifacts at the terminal node, or null when unresolved */
  artifacts: RoleArtifacts | null;
  /** @purpose Failure message when state === 'error' */
  error?: string;
};

/** @purpose Aggregate result of one `runMrsOnce` pass. */
export type RunMrsOnceResult = {
  /** @purpose Per-MR results, in the same order as the input `mrs` list */
  results: MrRunResult[];
};

/**
 * @purpose Feed a fixed MR list through the real role graph, driving each RoleInstance to a
 *   terminal state; VCS untouched unless `dryRun` is disabled.
 * @invariant No RoleScheduler polling/tick — a direct, bounded, one-shot drive per MR from the
 *   operator's exact list, not `vcs.getActionable()`.
 * @param opts MR list, optional seed, dry-run flag, and injected services.
 * @returns Per-MR results in input order.
 * @sideEffect Filesystem: registry seed/save, per-MR workspace/worktree prep. Network: MR/diff_refs
 *   lookups; VCS mutation only when `dryRun` is false and a pass reaches an answered `node_effect`.
 */
export async function runMrsOnce(opts: RunMrsOnceOpts): Promise<RunMrsOnceResult> {
  const dryRun = opts.dryRun ?? true;
  logger.info('[runMrsOnce] [idle → starting]', { mrCount: opts.mrs.length, dryRun });

  if (opts.seedState) {
    applySeedState(opts.deps.store, opts.seedState);
  }

  const results: MrRunResult[] = [];
  for (const mrUrl of opts.mrs) {
    results.push(await _runOneMr(mrUrl, dryRun, opts.deps));
  }

  logger.info('[runMrsOnce] [starting → done]', { mrCount: results.length });
  return { results };
}

/**
 * @purpose Resolve one MR's role + live context, drive its RoleInstance to a terminal state.
 * @param mrUrl MR web URL to process.
 * @param dryRun Forwarded to the RoleInstance's effect nodes.
 * @param deps Injected services.
 * @throws Never — all failures are caught and surfaced as a 'error'-state MrRunResult.
 * @returns This MR's result.
 * @sideEffect See `runMrsOnce`.
 */
async function _runOneMr(mrUrl: string, dryRun: boolean, deps: RunModeDeps): Promise<MrRunResult> {
  try {
    const mrContext = await deps.vcs.getMrContext(mrUrl);
    const role = mrContext.myRole;

    // #region START_RESOLVE_ROLE — invariant: no role (or role has no registered graph) means there
    // is no graph to run for this MR; surfaced as a distinct terminal state, not a thrown error
    if (!role) {
      logger.warn('[runMrsOnce#_runOneMr] [resolving → no_role]', { mr: mrUrl });
      return { mr: mrUrl, state: 'unresolved_role', role: null, board: null, artifacts: null };
    }

    const definition = deps.engine.retrieve(role);
    if (!definition) {
      logger.warn('[runMrsOnce#_runOneMr] [resolving → role_not_registered]', {
        mr: mrUrl,
        role,
      });
      return { mr: mrUrl, state: 'unresolved_role', role, board: null, artifacts: null };
    }
    // #endregion END_RESOLVE_ROLE

    const nodeContext = await buildNodeContext(mrUrl, {
      vcs: deps.vcs,
      store: deps.store,
      fetchDiffRefs: deps.fetchDiffRefs ?? fetchDiffRefsLive,
    });

    const checkpoint: RoleInstanceCheckpoint = {
      currentNode: definition.graph.nodes[0]?.id ?? '',
      continueCount: 0,
      restartCount: 0,
      artifacts: nodeContext.artifacts,
    };

    const instance = new RoleInstance({
      id: `${role}:${mrUrl}`,
      role,
      mr: mrUrl,
      graph: definition.graph,
      opencode: deps.opencode,
      vcs: deps.vcs,
      store: deps.store,
      dryRun,
      checkpoint,
    });

    await _driveToTerminal(instance);

    return {
      mr: mrUrl,
      state: instance.state,
      role,
      board: instance.getBoardView(),
      artifacts: instance.getCheckpoint().artifacts,
    };
  } catch (cause) {
    const error = new Error(`[runMrsOnce#_runOneMr] MR processing failed: ${mrUrl}`, { cause });
    logger.error('[runMrsOnce#_runOneMr] [processing → failed]', { mr: mrUrl, error });
    return {
      mr: mrUrl,
      state: 'error',
      role: null,
      board: null,
      artifacts: null,
      error: (cause as Error).message,
    };
  }
}

/**
 * @purpose Step a RoleInstance until it reaches a terminal state or the step bound is exhausted.
 * @param instance RoleInstance to drive.
 * @returns Promise that resolves once the instance is terminal (or the bound is hit).
 * @sideEffect Whatever `RoleInstance#step()` does per node (LLM calls, effect dispatch).
 */
async function _driveToTerminal(instance: RoleInstance): Promise<void> {
  let steps = 0;

  // #region START_DRIVE_GRAPH_TO_TERMINAL — invariant: bounded against a stuck retry/gate-fail
  // cycle since one-shot mode has no tick timer to yield control back to between attempts
  while (
    instance.state !== 'done' &&
    instance.state !== 'error' &&
    instance.state !== 'awaiting_operator' &&
    steps < MAX_STEPS_PER_MR
  ) {
    await instance.step();
    steps++;
  }
  // #endregion END_DRIVE_GRAPH_TO_TERMINAL
}
