// @file: Run ONE ParallelNode lens-session to completion with its own local recovery ladder — independent of the instance's shared continueCount/restartCount.
// @consumers: role-instance.ts
// @tasks: N/A

import { buildNodePrompt } from '../../../../ai-kit/compile.ts';
import { mrRoot } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import type { NodeContext, ParallelSessionSpec } from '../role-node.ts';
import type {
  OpenCodePort,
  PromptOpts,
  ToolCallStat,
  ToolTraceEntry,
} from '../../inbox-opencode/opencode.port.ts';
import type { SessionPool } from '../../inbox-opencode/session-pool.ts';
import type { StateStore } from '../../inbox-core/state-store.ts';
import type { OutcomeClassifier } from '../outcome-classifier.ts';
import {
  recordPhaseTiming,
  recordToolTrace,
  recordSessionPrompt,
  recordSessionResponse,
} from '../phase-telemetry.ts';
import { resolveDiskArtifact } from '../disk-artifact.ts';
import {
  _resolveSessionTools,
  _toOpenCodeCallResult,
  _persistNodeResult,
  _outputContract,
} from './node-run-helpers.ts';

/**
 * @purpose Collaborators `runLensSession` needs from its owning `RoleInstance` — read-only,
 *   never mutated by this function.
 */
export type LensSessionDeps = {
  /** @purpose State store for audit and telemetry paths */
  store: StateStore;
  /** @purpose Bounded pool for ParallelNode lens sessions (TSK-perf) | @invariant Undefined falls back to `opencode` directly */
  reviewSessionPool?: SessionPool;
  /** @purpose OpenCode adapter for session nodes */
  opencode: OpenCodePort;
  /** @purpose Outcome classifier */
  classifier: OutcomeClassifier;
  /** @purpose MR web URL */
  mr: string;
  /** @purpose Role name */
  role: string;
};

/**
 * @purpose Run ONE lens-session to completion with its own local recovery ladder
 *   (`spec.policy`) — independent of the instance's shared `continueCount`/`restartCount`,
 *   meaningless across N concurrent lenses.
 * @invariant Session sourcing: `deps.reviewSessionPool` when wired bounds concurrency via its
 *   FIFO queue; falls back to `deps.opencode` directly when absent (still correct, unbounded).
 * @param spec Lens session spec — task text, working directory, schema, retry policy.
 * @param ctx Node context with MR data and artifacts.
 * @param parallelGroupId Fan-out node id (`ParallelNode.id`) this lens belongs to — recorded on
 *   each PhaseTelemetry entry so per-lens timings group back to their parent.
 * @param deps Collaborators read from the owning `RoleInstance` (store, session pool, opencode
 *   port, classifier, mr, role).
 * @returns `{ id, output }` on success, or `{ id, escalate: true }` once the ladder is exhausted.
 */
export async function runLensSession(
  spec: ParallelSessionSpec,
  ctx: NodeContext,
  parallelGroupId: string,
  deps: LensSessionDeps
): Promise<{ id: string; output?: unknown; escalate: boolean }> {
  const worktreePath = ctx.artifacts.worktreePath;
  // directory = MR's shared parent, not the worktree alone — injected context lives in report/ (TSK-131).
  const directory =
    typeof worktreePath === 'string' && ctx.store
      ? mrRoot(ctx.store.getStateDir(), `${ctx.mr.project}!${ctx.mr.iid}`)
      : typeof worktreePath === 'string'
        ? worktreePath
        : spec.dir(ctx);
  const taskText = spec.buildTaskText(ctx);

  // TSK-perf telemetry (phase-timings.jsonl) — one entry per lens, recorded at every exit point below.
  const _telemetryStart = performance.now();
  const _telemetryModel = spec.policy?.model ?? 'default';
  let _telemetryLastError: string | undefined;
  const _recordLensTiming = async (
    result: { id: string; output?: unknown; escalate: boolean },
    continueCount: number,
    restartCount: number,
    tools: ToolCallStat[] = [],
    trace: ToolTraceEntry[] = []
  ): Promise<{ id: string; output?: unknown; escalate: boolean }> => {
    const ts = new Date().toISOString();
    await recordPhaseTiming(deps.store.getStateDir(), {
      ts,
      mr: deps.mr,
      role: deps.role,
      node: spec.id,
      model: _telemetryModel,
      durationMs: performance.now() - _telemetryStart,
      ok: !result.escalate,
      error: result.escalate ? _telemetryLastError : undefined,
      retries: continueCount + restartCount,
      parallelGroup: parallelGroupId,
      tools,
    });
    if (trace.length > 0) {
      await recordToolTrace(deps.store.getStateDir(), {
        ts,
        mr: deps.mr,
        role: deps.role,
        node: spec.id,
        calls: trace,
      }).catch(() => {});
    }
    return result;
  };

  let system: string;
  try {
    system = await buildNodePrompt(spec.id, ctx);
  } catch {
    system = '';
  }

  const createOpts = {
    title: spec.id,
    directory,
    tools: _resolveSessionTools(spec.policy),
    // Per-phase model (TSK-perf) — absent → adapter omits the field, server default applies.
    model: spec.policy?.model,
    registration: {
      taskId: `${deps.role}:${spec.id}`,
      mr: deps.mr,
      artifacts: Object.keys(ctx.artifacts),
      context: 'independent' as const,
      sha: typeof ctx.artifacts['headSha'] === 'string' ? ctx.artifacts['headSha'] : undefined,
      runtimeNamespace: deps.store.getRuntimeProfile?.()?.stateNamespace ?? 'production',
    },
  };

  const createSession = async (): Promise<string> => {
    if (deps.reviewSessionPool) {
      return deps.reviewSessionPool.create(createOpts);
    }
    const handle = await deps.opencode.createSession(createOpts);
    return handle.sid;
  };

  const closeSession = async (sid: string): Promise<void> => {
    if (deps.reviewSessionPool) {
      await deps.reviewSessionPool.release(sid);
    } else {
      await deps.opencode.close(sid);
    }
  };

  let sid = await createSession();

  const promptOpts: PromptOpts = {
    system,
    text: spec.resultSchema ? `${taskText}${_outputContract(spec.resultSchema)}` : taskText,
  };
  if (spec.resultSchema) {
    promptOpts.format = { type: 'json_schema', schema: spec.resultSchema };
  }
  if (spec.policy?.promptTimeout) {
    promptOpts.timeout = spec.policy.promptTimeout;
  }
  if (spec.policy?.model) {
    promptOpts.model = spec.policy.model;
  }

  // X-ray artifact (D-125): same prompt is reused across continue/restart attempts (promptOpts
  // built once above) — record it once; each attempt's response gets its own file below.
  const _xrayRef = `${ctx.mr.project}!${ctx.mr.iid}`;
  const _xrayPromptPath = await recordSessionPrompt(deps.store.getStateDir(), _xrayRef, spec.id, {
    system,
    text: promptOpts.text ?? '',
  });

  const max = spec.policy;
  let continueCount = 0;
  let restartCount = 0;

  for (;;) {
    const runtimeRequest = {
      sessionId: sid,
      taskId: `${deps.role}:${spec.id}`,
      model: spec.policy?.model ?? 'default',
      prompt: promptOpts,
    };
    const runtimeResult = deps.reviewSessionPool
      ? await deps.reviewSessionPool.run(runtimeRequest)
      : await deps.opencode.run(runtimeRequest);
    const result = _toOpenCodeCallResult(runtimeResult);
    await recordSessionResponse(
      deps.store.getStateDir(),
      _xrayRef,
      spec.id,
      _xrayPromptPath,
      result
    );

    let outcome = deps.classifier.classify(result);
    // TSK-127: same disk-artifact resolution as _executeSession — a lens's raw OK is only "the
    // turn finished"; the finding set comes from the validated file, not response text.
    if (spec.artifact && outcome.class === 'OK') {
      outcome = resolveDiskArtifact(directory, spec.artifact);
    }

    if (outcome.class === 'OK') {
      _persistNodeResult(spec.persistResult, ctx, outcome.output, spec.id);
      // Best-effort tool-call stats — fetched BEFORE closeSession, since closing may drop the
      // session server-side and make the query fail.
      const tools = await deps.opencode.toolCallStats(sid).catch(() => []);
      const trace = await deps.opencode.toolCallTrace(sid).catch(() => []);
      await closeSession(sid);
      return _recordLensTiming(
        { id: spec.id, output: outcome.output, escalate: false },
        continueCount,
        restartCount,
        tools,
        trace
      );
    }

    _telemetryLastError = outcome.signal;
    const remediation = deps.classifier.remediate(outcome);

    if (remediation.action === 'continue') {
      continueCount++;
      if (continueCount > max.continueMax) {
        continueCount = 0;
        restartCount++;
        if (restartCount > max.restartMax) {
          await closeSession(sid);
          return _recordLensTiming({ id: spec.id, escalate: true }, continueCount, restartCount);
        }
        await closeSession(sid);
        sid = await createSession();
        continue;
      }
      // continueSignal has no SessionPool-level equivalent — it targets an EXISTING session,
      // never creates one, so it does not affect the pool's slot accounting.
      const continuation = {
        sessionId: sid,
        taskId: `${deps.role}:${spec.id}`,
        model: spec.policy?.model ?? 'default',
        prompt: {
          text: remediation.signal ?? 'Retry with the same prompt',
          model: spec.policy?.model,
        },
      };
      if (deps.reviewSessionPool) await deps.reviewSessionPool.continue(continuation);
      else await deps.opencode.continue(continuation);
      continue;
    }

    if (remediation.action === 'restart') {
      restartCount++;
      if (restartCount > max.restartMax) {
        await closeSession(sid);
        return _recordLensTiming({ id: spec.id, escalate: true }, continueCount, restartCount);
      }
      await closeSession(sid);
      sid = await createSession();
      continue;
    }

    // 'await_operator' (or the unreachable 'proceed' on a non-OK outcome) — no local recovery left.
    await closeSession(sid);
    return _recordLensTiming({ id: spec.id, escalate: true }, continueCount, restartCount);
  }
}
