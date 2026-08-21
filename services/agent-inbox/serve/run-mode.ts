// @file: run-mode — bounded one-shot acceptance through the boot-owned PipelineRuntime.
// @consumers: cli/cmd/inbox/serve.cmd.ts (--mrs run-mode entry point), inbox-eval eval-driver.ts
// @tasks: TSK-121, TSK-122, TSK-184, TSK-190

import { logger } from '#logger';
import type { VcsInboxPort } from '../modules/inbox-core/vcs-inbox.port.ts';
import type { StateStore } from '../modules/inbox-core/state-store.ts';
import { EventJournal } from '../modules/inbox-core/event-journal.ts';
import { PipelineRuntime } from '../modules/inbox-pipeline/pipeline-runtime.ts';
import { InMemoryTaskQueue } from '../modules/inbox-queue/task-queue.ts';
import { TaskRegistry } from '../modules/inbox-queue/task-registry.ts';
import type { OpenCodePort } from '../modules/inbox-opencode/opencode.port.ts';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fetchDiffRefsLive, type DiffRefs } from '../modules/inbox-roles/context-builder.ts';
import { buildNodeContext } from '../modules/inbox-roles/context-builder.ts';
import { buildTrackContext } from '../modules/inbox-core/context-builder.ts';
import type { ReviewManifestCapture } from '../modules/inbox-pipeline/planning/review-input-manifest-builder.ts';
import type { ReviewChangeShapeCode } from '../modules/inbox-pipeline/types/review-input-classification.type.ts';
import { readFile, stat } from 'node:fs/promises';
import { applySeedState, type SeedState } from './state-seed.ts';
import { resolveVcsContext } from '../../../cli/cmd/_shared/vcs-context-resolver.ts';
import { DEFAULT_AGENT_INBOX_MODEL } from '../modules/inbox-opencode/model-selection.ts';

/**
 * @purpose Services `runMrsOnce` drives the graph with — real adapters in production,
 *   mocks (VcsInboxMock/OpenCodeMock) in eval/test runs.
 */
export type RunModeDeps = {
  /** @purpose The exact boot-owned production acceptance owner. */
  pipeline: PipelineRuntime;
  /** @purpose Optional state store used only for backward-compatible seed restoration. */
  store?: StateStore;
  /** @purpose VCS read adapter used to resolve the role-invariant pipeline tail. */
  vcs: VcsInboxPort;
  /**
   * @purpose Exact provider diff refs; absence fails closed before queue handoff.
   * @param mrUrl Provider MR URL to resolve.
   * @returns Exact provider refs or undefined when unavailable.
   */
  fetchDiffRefs?: (mrUrl: string) => Promise<DiffRefs | undefined>;
  /**
   * @purpose Optional exact inventory provider; production falls back to live worktree capture.
   * @param mrUrl Canonical MR URL whose inventory must be captured.
   * @param headSha Exact immutable MR head expected by the capture.
   * @returns Exhaustive versioned manifest capture or a rejected promise when unavailable.
   */
  captureReviewInput?: (mrUrl: string, headSha: string) => Promise<ReviewManifestCapture>;
};

/**
 * @purpose Compose the durable pipeline acceptance owner shared by one-shot and eval consumers.
 * @param store State root owning queue, control and artifact persistence.
 * @param opencode Worker adapter used by non-control legacy tasks.
 * @param [runtimeNamespace] Profile namespace isolating trusted receipts.
 * @param [controlPlaneModel] Operator-selected OpenCode model for control-plane turns.
 * @returns One durable acceptance runtime.
 */
export function composeRunModePipeline(
  store: StateStore,
  opencode: OpenCodePort,
  runtimeNamespace = 'one-shot',
  controlPlaneModel = DEFAULT_AGENT_INBOX_MODEL
): PipelineRuntime {
  const stateDir = store.getStateDir();
  const registry = new TaskRegistry();
  return new PipelineRuntime(
    new InMemoryTaskQueue(registry),
    registry,
    new EventJournal(join(stateDir, 'agent-inbox', 'events.jsonl')),
    undefined,
    stateDir,
    opencode,
    undefined,
    {
      journal: new EventJournal(join(stateDir, 'agent-inbox', 'control-plane-events.jsonl')),
      receiptRoot: join(stateDir, 'agent-inbox', 'control-plane-receipts'),
      runtimeNamespace,
      model: controlPlaneModel,
    }
  );
}

/** @purpose Inputs for one `runMrsOnce` pass. */
export type RunMrsOnceOpts = {
  /** @purpose MR web URLs to process, in order */
  mrs: string[];
  /** @purpose Optional prior-review state applied to the registry before assignment */
  seedState?: SeedState;
  /** @purpose Retained CLI compatibility flag; one-shot pipeline acceptance never dispatches effects. */
  dryRun?: boolean;
  /** @purpose Injected services */
  deps: RunModeDeps;
};

/** @purpose Per-MR outcome of a `runMrsOnce` pass. */
export type MrRunResult = {
  /** @purpose MR web URL this result belongs to */
  mr: string;
  /** @purpose Terminal instance state, or 'unresolved_role' when the MR carries no myRole */
  state: 'completed' | 'failed' | 'blocked' | 'unresolved_role';
  /** @purpose Role selecting the pipeline tail, or null when unresolved */
  role: string | null;
  /** @purpose Durable queue completion snapshot, or null when unresolved. */
  board: Record<string, unknown> | null;
  /** @purpose Canonical artifacts read from the pipeline-owned report surface. */
  artifacts: Record<string, unknown> | null;
  /** @purpose Runtime identity matching the production composition trace. */
  runtimeIdentity: string;
  /** @purpose Failure message when completion is failed or blocked. */
  error?: string;
};

/** @purpose Aggregate result of one `runMrsOnce` pass. */
export type RunMrsOnceResult = {
  /** @purpose Per-MR results, in the same order as the input `mrs` list */
  results: MrRunResult[];
};

/**
 * @purpose Resolve the VCS host for a run-mode pass: the CLI's own `resolveVcsContext` against
 *   the first MR URL, else persisted config.
 * @invariant MR-URL host wins over config — mirrors bootstrap.ts's config-driven `VcsInboxReal`
 *   wiring, but the pass's own MR list takes priority when it yields a host.
 * @param mrs MR web URL list for this pass (may be empty).
 * @param store State store to read the persisted config from when the URL yields no host.
 * @returns Resolved host, or undefined when neither source yields one (`VcsInboxReal` then
 *   reports its own `CONFIG: No VCS host configured` error, unchanged from before).
 * @sideEffect Filesystem read via `StateStore#loadConfig` (fallback path only).
 */
export async function resolveRunModeVcsHost(
  mrs: string[],
  store: StateStore
): Promise<string | undefined> {
  const firstMr = mrs[0];
  if (firstMr) {
    try {
      const context = await resolveVcsContext({ url: firstMr });
      return context.host;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      logger.debug('[resolveRunModeVcsHost] [resolving-from-url → failed]', {
        mr: firstMr,
        error,
      });
    }
  }

  const config = await store.loadConfig();
  return config.configured ? config.vcsHost : undefined;
}

/**
 * @purpose Submit a fixed MR list to the boot-owned pipeline and read each durable terminal result.
 * @invariant Submission, bounded drain and artifact readback use one PipelineRuntime identity.
 * @param opts MR list, optional seed, dry-run flag, and injected services.
 * @returns Per-MR results in input order.
 * @sideEffect Filesystem: optional registry seed plus pipeline queue/journal/artifact writes.
 */
export async function runMrsOnce(opts: RunMrsOnceOpts): Promise<RunMrsOnceResult> {
  const dryRun = opts.dryRun ?? true;
  logger.info('[runMrsOnce] [idle → starting]', { mrCount: opts.mrs.length, dryRun });

  if (opts.seedState && opts.deps.store) {
    applySeedState(opts.deps.store, opts.seedState);
  }

  const results: MrRunResult[] = [];
  for (const mrUrl of opts.mrs) {
    results.push(await _runOneMr(mrUrl, opts.deps));
  }

  logger.info('[runMrsOnce] [starting → done]', { mrCount: results.length });
  return { results };
}

/**
 * @purpose Resolve one MR's role, submit its pipeline DAG, and read its durable terminal state.
 * @param mrUrl MR web URL to process.
 * @param deps Injected services.
 * @throws Never — all failures are caught and surfaced as a 'error'-state MrRunResult.
 * @returns This MR's result.
 * @sideEffect See `runMrsOnce`.
 */
async function _runOneMr(mrUrl: string, deps: RunModeDeps): Promise<MrRunResult> {
  try {
    const mrContext = await deps.vcs.getMrContext(mrUrl);
    const role = mrContext.myRole;

    // #region START_RESOLVE_ROLE — permission role selects only the tail; review depth is invariant
    if (!role) {
      logger.warn('[runMrsOnce#_runOneMr] [resolving → no_role]', { mr: mrUrl });
      return {
        mr: mrUrl,
        state: 'unresolved_role',
        role: null,
        board: null,
        artifacts: null,
        runtimeIdentity: deps.pipeline.identity,
      };
    }
    const pipelineRole = _resolvePipelineRole(role);
    // #endregion END_RESOLVE_ROLE
    const diffRefs = await (deps.fetchDiffRefs ?? fetchDiffRefsLive)(mrUrl);
    if (!diffRefs?.headSha) {
      throw new Error('[runMrsOnce#_runOneMr] Exact MR head SHA is unavailable');
    }
    const contextDigest = createHash('sha256').update(JSON.stringify(mrContext)).digest('hex');
    const eventCursor = mrContext.updatedAt || mrContext.createdAt || `capture:${contextDigest}`;
    const capture = deps.captureReviewInput
      ? await deps.captureReviewInput(mrUrl, diffRefs.headSha)
      : await _captureLiveReviewInput(mrUrl, diffRefs.headSha, deps);
    _assertExhaustiveRunModeCapture(capture);
    const pipelineChangeset = capture.inputs
      .filter((input) => input.kind === 'file')
      .map((input) => ({
        path: input.canonicalIdentity,
        // Manifest v0 preserves immutable file identity/content but not the git status.
        // Planning rules classify by path; modified is the conservative non-deletion action.
        action: 'modified' as const,
      }));
    const taskIds = await deps.pipeline.startReview(mrUrl, {
      role: pipelineRole,
      tracks: [],
      changeset: pipelineChangeset,
      controlPlaneInput: {
        intent: {
          kind: 'full',
          manifestKey: { mr: mrUrl, headSHA: diffRefs.headSha, eventCursor },
          trigger: 'one-shot',
          requester: 'operator',
        },
        capture,
      },
    });
    const completion = await deps.pipeline.awaitCompletion(mrUrl, taskIds);
    const readback = await deps.pipeline.readReviewArtifacts(mrUrl);
    return {
      mr: mrUrl,
      state: completion.state,
      role,
      board: { tasks: completion.tasks },
      artifacts: { ...readback.artifacts },
      runtimeIdentity: completion.runtimeIdentity,
      error: completion.error,
    };
  } catch (cause) {
    const error =
      cause instanceof Error
        ? cause
        : new Error(`[runMrsOnce#_runOneMr] Unknown MR processing failure`, { cause });
    logger.error('[runMrsOnce#_runOneMr] [processing → failed]', { mr: mrUrl, error });
    return {
      mr: mrUrl,
      state: 'failed',
      role: null,
      board: null,
      artifacts: null,
      runtimeIdentity: deps.pipeline.identity,
      error: error.message,
    };
  }
}

/** @purpose Capture exhaustive versioned review inventory from the real MR worktree and discussions. */
async function _captureLiveReviewInput(
  mrUrl: string,
  expectedHeadSha: string,
  deps: RunModeDeps
): Promise<ReviewManifestCapture> {
  if (!deps.store) {
    throw new Error(
      '[runMrsOnce#_captureLiveReviewInput] State store is required for live capture'
    );
  }
  const context = await buildNodeContext(mrUrl, {
    vcs: deps.vcs,
    store: deps.store,
    fetchDiffRefs: deps.fetchDiffRefs ?? fetchDiffRefsLive,
    managedCloneOnly: true,
  });
  const worktreePath =
    typeof context.artifacts.worktreePath === 'string' ? context.artifacts.worktreePath : '';
  const base = context.base;
  const changeset = context.changeset;
  const headSha = typeof context.artifacts.headSha === 'string' ? context.artifacts.headSha : '';
  if (!worktreePath || !base || !changeset || headSha !== expectedHeadSha) {
    throw new Error(
      '[runMrsOnce#_captureLiveReviewInput] Complete immutable worktree inventory is unavailable'
    );
  }
  const [analysis, discussions] = await Promise.all([
    buildTrackContext('all', changeset, base, worktreePath),
    deps.vcs.getDiscussions(mrUrl, { all: true }),
  ]);
  const inputs: ReviewManifestCapture['inputs'][number][] = [];
  const classifications: ReviewManifestCapture['classifications'][number][] = [];
  const add = (
    inputId: string,
    kind: 'file' | 'entity' | 'discussion' | 'source',
    canonicalIdentity: string,
    bytes: string,
    code: ReviewChangeShapeCode,
    changeShape: ReviewChangeShapeCode[]
  ): void => {
    const digest = createHash('sha256').update(bytes).digest('hex');
    inputs.push({
      inputId,
      kind,
      canonicalIdentity,
      version: headSha,
      digest,
      capturedBytes: bytes,
    });
    classifications.push({
      inputId,
      code,
      changeShape,
      rationaleDigest: createHash('sha256')
        .update(JSON.stringify({ canonicalIdentity, code, changeShape }))
        .digest('hex'),
      classifierVersion: 'review-classifier-v0',
    });
  };
  const goalBytes = JSON.stringify({
    title: context.mr.title,
    description: context.mr.description,
  });
  add('source:goal', 'source', `${mrUrl}#goal`, goalBytes, 'GOAL_CHANGED', ['GOAL_CHANGED']);
  const paths = changeset.files.map((file) => file.path.toLowerCase());
  const dimensionCodes: ReadonlyArray<readonly [string, ReviewChangeShapeCode, boolean]> = [
    [
      'architecture',
      'ARCHITECTURE_CHANGED',
      paths.some((path) => /(?:architecture|bootstrap|runtime|adapter|port|service)/.test(path)),
    ],
    [
      'specification',
      'SPECIFICATION_TOUCHED',
      paths.some((path) => /(?:^|\/)(?:specs?|docs?)(?:\/|\.|$)/.test(path)),
    ],
    ['tests', 'TEST_SURFACE_CHANGED', paths.some((path) => /(?:test|spec)\.[^.]+$/.test(path))],
    [
      'security',
      'SECURITY_SURFACE_CHANGED',
      analysis.mrShape.securityHits || analysis.mrShape.depManifest,
    ],
    [
      'optimality',
      'OPTIMALITY_RELEVANT',
      analysis.mrShape.nestedLoops || analysis.mrShape.filterMapChain,
    ],
    ['review-lens', 'BEHAVIOR_CHANGED', true],
  ];
  for (const [dimension, code, changed] of dimensionCodes) {
    add(
      `source:${dimension}`,
      'source',
      `${mrUrl}#${dimension}`,
      JSON.stringify({
        dimension,
        changed,
        anchors: changeset.files.map((file) => `${file.path}@${headSha}:${file.status}`),
        entities: analysis.injectedEntities,
        shape: analysis.mrShape,
        diffContext: analysis.markdown,
      }),
      code,
      changed ? [code] : []
    );
  }
  for (const file of changeset.files) {
    const bytes = await captureWorktreeEntryBytes(
      worktreePath,
      file.path,
      file.status,
      analysis.markdown
    );
    add(`file:${file.path}`, 'file', file.path, bytes, 'BEHAVIOR_CHANGED', [
      'BEHAVIOR_CHANGED',
      'ENTITY_SET_CHANGED',
    ]);
  }
  for (const entity of analysis.injectedEntities) {
    const anchor = `${entity.file}${entity.line ? `:${entity.line}` : ''}${entity.symbol ? `#${entity.symbol}` : ''}`;
    add(`entity:${anchor}`, 'entity', anchor, JSON.stringify(entity), 'ENTITY_SET_CHANGED', [
      'ENTITY_SET_CHANGED',
    ]);
  }
  for (const discussion of discussions) {
    add(
      `discussion:${discussion.id}`,
      'discussion',
      `${mrUrl}#discussion-${discussion.id}`,
      JSON.stringify(discussion),
      'DISCUSSION_CHANGED',
      ['DISCUSSION_CHANGED']
    );
  }
  add(
    'source:discussions',
    'source',
    `${mrUrl}#discussions`,
    JSON.stringify(discussions.map((discussion) => discussion.id)),
    'DISCUSSION_CHANGED',
    discussions.length ? ['DISCUSSION_CHANGED'] : []
  );
  return {
    inputs,
    classifications,
    provenance: [`vcs:${mrUrl}@${headSha}`, `base:${base}`, 'live-worktree-and-discussions'],
  };
}

/**
 * @purpose Capture one changed worktree entry without treating gitlinks or directories as files.
 * @param worktreePath Immutable MR worktree root.
 * @param relativePath Repo-relative changed entry path.
 * @param status Git change status.
 * @param deletedFallback Exact diff-derived bytes retained for absent entries.
 * @returns Exact file bytes or a typed non-file observation.
 */
export async function captureWorktreeEntryBytes(
  worktreePath: string,
  relativePath: string,
  status: string,
  deletedFallback: string
): Promise<string> {
  if (status.startsWith('D')) return deletedFallback;
  const path = join(worktreePath, relativePath);
  const entry = await stat(path);
  if (entry.isFile()) return readFile(path, 'utf8');
  if (entry.isDirectory()) return JSON.stringify({ kind: 'git-directory', path: relativePath });
  return JSON.stringify({ kind: 'git-non-file', path: relativePath });
}

/** @purpose Reject partial one-shot inventories before manifest sealing can hide omitted surfaces. */
function _assertExhaustiveRunModeCapture(capture: ReviewManifestCapture): void {
  const ids = new Set(capture.inputs.map((input) => input.inputId));
  const requiredSources = [
    'source:goal',
    'source:architecture',
    'source:specification',
    'source:tests',
    'source:security',
    'source:optimality',
    'source:review-lens',
    'source:discussions',
  ];
  const missing = requiredSources.filter((inputId) => !ids.has(inputId));
  if (
    missing.length ||
    !capture.inputs.some((input) => input.kind === 'file') ||
    !capture.inputs.some((input) => input.kind === 'entity')
  ) {
    throw new Error(
      `[runMrsOnce#_assertExhaustiveRunModeCapture] BLOCKED incomplete inventory: ${missing.join(',') || 'file/entity inventory missing'}`
    );
  }
}

/** @purpose Apply the explicit permission-role policy without changing review depth. */
function _resolvePipelineRole(role: string): 'author' | 'reviewer' {
  if (role === 'author') return 'author';
  if (role === 'reviewer' || role === 'mentioned') return 'reviewer';
  throw new Error(`[runMrsOnce#_resolvePipelineRole] Unsupported MR role: ${role}`);
}
