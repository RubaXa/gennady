// @file: EffectExecutor — sole executor of public VCS mutations (NFC-SV-07): react/reply/approve/
//   resolve/draft-note-delete. Reconciles against live discussion threads before posting (dedup)
//   and guards re-application via the `effect_applied` audit marker (idempotent across restarts).
// @consumers: RoleInstance (effect nodes), reviewer.role.ts / author.role.ts effect nodes
// @tasks: TSK-113, TSK-121

import { logger } from '#logger';
import { run as runVcsReact } from '../../../../cli/cmd/vcs-react/vcs-react.cmd.ts';
import { run as runVcsApprove } from '../../../../cli/cmd/vcs-approve/vcs-approve.cmd.ts';
import { run as runVcsDraftNote } from '../../../../cli/cmd/vcs-draft-note/vcs-draft-note.cmd.ts';
import { main as postVcsReply } from '../../../../cli/cmd/vcs-reply/vcs-reply.cmd.ts';
import { resolveVcsContext } from '../../../../cli/cmd/_shared/vcs-context-resolver.ts';
import type { VcsDiscussionPosition } from '../../../vcs-client/abstract/vcs-client-merge-discussions.ts';
import type { VcsInboxPort } from '../inbox-core/vcs-inbox.port.ts';
import type { StateStore } from '../inbox-core/state-store.ts';
import type { AuditEntry } from '../inbox-core/audit-log.ts';

// ─── Proposed action vocabulary ────────────────────────────────────────────────
// purpose: the closed set of public VCS mutations a session artifact may propose. Sessions never
// call vcs-* themselves (NFC-SV-07) — they emit these, the operator approves (ask node), and only
// EffectExecutor turns approval into an actual call.

/** @purpose 👍-style reaction on an existing comment. */
export type ReactAction = {
  /** @purpose Discriminant — identifies this action as a reaction */
  type: 'react';
  /** @purpose Target comment id (provider-native) */
  commentId: string;
  /** @purpose Reaction name (e.g. '👍', 'thumbsup') */
  emoji: string;
  /** @purpose Remove the reaction instead of adding it */
  remove?: boolean;
};

/** @purpose Reply into a thread, start a new discussion, or edit/delete an existing note. */
export type ReplyAction = {
  /** @purpose Discriminant — identifies this action as a reply/edit/delete */
  type: 'reply';
  /** @purpose Target discussion; absent → new discussion */
  discussionId?: string;
  /** @purpose Comment body (Markdown) */
  body?: string;
  /** @purpose Diff position for a line-level comment */
  position?: VcsDiscussionPosition;
  /** @purpose Code suggestion text embedded as a ```suggestion block */
  suggestion?: string;
  /** @purpose Line range for the suggestion diff context */
  suggestionRange?: { above: number; below: number };
  /** @purpose Target note to edit or delete */
  noteId?: string;
  /** @purpose Delete the note (with noteId) or the whole discussion (with discussionId) */
  delete?: boolean;
};

/** @purpose Resolve or reopen a discussion thread. */
export type ResolveAction = {
  /** @purpose Discriminant — identifies this action as a resolve/reopen */
  type: 'resolve';
  /** @purpose Target discussion id */
  discussionId: string;
  /** @purpose true → resolve, false → reopen */
  resolve: boolean;
};

/** @purpose Approve or revoke approval of the MR. */
export type ApproveAction = {
  /** @purpose Discriminant — identifies this action as an approve/revoke */
  type: 'approve';
  /** @purpose Revoke a prior approval instead of approving */
  revoke?: boolean;
};

/** @purpose Delete all of my draft notes on the MR (`vcs-draft-note --delete-all`). */
export type DeleteDraftsAction = {
  /** @purpose Discriminant — identifies this action as a delete-all-drafts */
  type: 'deleteDrafts';
};

/** @purpose Closed union of every action a session may propose and the operator may approve. */
export type ProposedAction =
  | ReactAction
  | ReplyAction
  | ResolveAction
  | ApproveAction
  | DeleteDraftsAction;

/** @purpose Per-action execution outcome — one entry per approved action, in input order. */
export type EffectOutcome =
  | { action: ProposedAction; status: 'applied' }
  | { action: ProposedAction; status: 'skipped_duplicate'; reason: string }
  | { action: ProposedAction; status: 'skipped_idempotent' }
  | { action: ProposedAction; status: 'failed'; error: string };

/** @purpose Aggregate result of one execute() call. */
export type EffectResult = {
  /** @purpose Per-action outcomes, in input order */
  outcomes: EffectOutcome[];
};

/** @purpose Identifies the MR/role/node an effect batch belongs to — audit + idempotency key. */
export type EffectExecutionContext = {
  /** @purpose MR web URL */
  mr: string;
  /** @purpose Role name (for audit) */
  role: string;
  /** @purpose Effect node id — idempotency scope (one apply per node per successful pass) */
  nodeId: string;
};

/** @purpose Dependencies required to construct an EffectExecutor. */
export type EffectExecutorConfig = {
  /** @purpose VCS adapter — read-only lookups for reconcile-dedup (discussions, MR context) */
  vcs: VcsInboxPort;
  /** @purpose State store for audit-based idempotency */
  store: StateStore;
  /** @purpose Skip the real vcs-* mutation (`_apply`) while still running reconcile/dedup and marking `effect_applied` | @invariant Default false — dry-run is opt-in, never a silent default for a real executor */
  dryRun?: boolean;
};

// ─── CLI invocation harness ─────────────────────────────────────────────────────
// purpose: vcs-react/vcs-approve/vcs-draft-note are argv+deps CLI commands that terminate via
// deps.exit() on every path (success and failure) — calling them with real process.exit would
// kill the serve process. This harness substitutes a throwing exit + buffered stdout/stderr so the
// commands run as in-process functions (SV-12: reuse as functions, not spawn).

/** @purpose Signals a CLI command's deps.exit() call — carries the intended process exit code. */
class CliExitSignal extends Error {
  /** @purpose Exit code the CLI command intended to terminate with */
  code: number;

  constructor(code: number) {
    super(`[EffectExecutor] CLI command signaled exit(${code})`);
    this.name = 'CliExitSignal';
    this.code = code;
  }
}

/** @purpose Minimal shape shared by vcs-react/vcs-approve/vcs-draft-note's injectable deps. */
type CliDeps = {
  resolveVcsContext: typeof resolveVcsContext;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  exit: (code: number) => never;
};

/**
 * @purpose Build a fake WriteStream that appends every write to an in-memory buffer.
 * @param sink Called with each written chunk (as a string).
 * @returns An object structurally compatible with NodeJS.WriteStream's `.write`.
 */
function bufferedStream(sink: (chunk: string) => void): NodeJS.WriteStream {
  return { write: (chunk: string) => (sink(String(chunk)), true) } as unknown as NodeJS.WriteStream;
}

/**
 * @purpose Invoke an argv+deps CLI command in-process, capturing its exit code and console output
 * instead of letting it call process.exit.
 * @param run The command's exported `run(argv, deps)` function.
 * @param argv CLI-style argument list (e.g. `['--url', mrUrl, '--comment', id]`).
 * @returns Captured exit code, stdout, and stderr.
 * @sideEffect Whatever network/API call the wrapped command performs.
 */
async function invokeCliCommand(
  run: (argv: string[], deps: CliDeps) => Promise<void>,
  argv: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdoutBuf = '';
  let stderrBuf = '';

  try {
    await run(argv, {
      resolveVcsContext,
      stdout: bufferedStream((c) => (stdoutBuf += c)),
      stderr: bufferedStream((c) => (stderrBuf += c)),
      exit: (code: number) => {
        throw new CliExitSignal(code);
      },
    });
    return { code: 0, stdout: stdoutBuf, stderr: stderrBuf };
  } catch (cause) {
    if (cause instanceof CliExitSignal) {
      return { code: cause.code, stdout: stdoutBuf, stderr: stderrBuf };
    }
    throw cause;
  }
}

// ─── EffectExecutor ─────────────────────────────────────────────────────────────

/**
 * @purpose Sole executor of approved VCS-mutating actions in inbox-roles (NFC-SV-07). Sessions
 * propose, the operator approves, this class applies.
 * @invariant Idempotent per node: an action already recorded `effect_applied` is skipped on
 *   restart or repeat dry-run — no duplicate posting, no duplicate `applied` outcome.
 * @invariant Reconcile-dedup (react/resolve/approve vs live VCS state) runs before any network
 *   call; posting policy itself stays the session's job, not re-derived here.
 * @invariant Dry-run (`dryRun=true`) still reconciles/dedups and records `effect_applied`, only
 *   `_apply` (the real vcs-* mutation) is withheld.
 * @consumer RoleInstance (effect nodes)
 */
export class EffectExecutor {
  /** @purpose VCS adapter for reconcile-dedup lookups */
  protected _vcs: VcsInboxPort;
  /** @purpose State store for audit-based idempotency */
  protected _store: StateStore;
  /** @purpose Dry-run mode — see class @invariant */
  protected _dryRun: boolean;

  /**
   * @purpose Create an executor bound to a VCS adapter and state store.
   * @param config VCS adapter + state store + optional dry-run mode.
   */
  constructor(config: EffectExecutorConfig) {
    this._vcs = config.vcs;
    this._store = config.store;
    this._dryRun = config.dryRun ?? false;
  }

  /**
   * @purpose Apply a batch of operator-approved actions to the MR.
   * @param ctx MR/role/node identity — scopes idempotency and audit entries.
   * @param approvedActions Actions the operator approved at the preceding ask node.
   * @returns Per-action outcomes, in input order.
   * @sideEffect Network: VCS API calls for every non-deduped, non-already-applied action.
   *   Appends one `effect_applied` audit entry per successfully applied action.
   */
  async execute(
    ctx: EffectExecutionContext,
    approvedActions: ProposedAction[]
  ): Promise<EffectResult> {
    logger.debug('[EffectExecutor#execute] [idle → executing]', {
      mr: ctx.mr,
      node: ctx.nodeId,
      count: approvedActions.length,
      dryRun: this._dryRun,
    });

    const applied = await this._store.queryAudit(ctx.mr);
    const outcomes: EffectOutcome[] = [];

    for (const action of approvedActions) {
      const fingerprint = this._fingerprint(action);

      // #region START_IDEMPOTENCY_GUARD — restart must not re-post an already-applied action
      const alreadyApplied = applied.some(
        (e: AuditEntry) =>
          e.event === 'effect_applied' && e.detail === `node:${ctx.nodeId}|${fingerprint}`
      );
      if (alreadyApplied) {
        outcomes.push({ action, status: 'skipped_idempotent' });
        continue;
      }
      // #endregion END_IDEMPOTENCY_GUARD

      const dedupReason = await this._reconcileDedup(ctx, action);
      if (dedupReason) {
        outcomes.push({ action, status: 'skipped_duplicate', reason: dedupReason });
        continue;
      }

      try {
        // #region START_DRY_RUN_SKIP_APPLY — invariant: dry-run still reconciles/dedups and marks
        // effect_applied (idempotency proven end-to-end); only the real vcs-* call is withheld
        if (!this._dryRun) {
          await this._apply(ctx, action);
        }
        // #endregion END_DRY_RUN_SKIP_APPLY
        await this._store.appendAudit({
          ts: new Date().toISOString(),
          mr: ctx.mr,
          role: ctx.role,
          event: 'effect_applied',
          detail: `node:${ctx.nodeId}|${fingerprint}`,
        });
        outcomes.push({ action, status: 'applied' });
      } catch (cause) {
        const error = new Error('[EffectExecutor#execute] Action failed', { cause });
        logger.error('[EffectExecutor#execute] [executing → action_failed]', {
          mr: ctx.mr,
          action: action.type,
          error,
        });
        outcomes.push({ action, status: 'failed', error: (cause as Error).message });
      }
    }

    return { outcomes };
  }

  // ─── Reconcile-dedup ────────────────────────────────────────────────────────

  /**
   * @purpose Check live VCS state before posting — drops actions already reflected upstream
   * (`AX_POSTING_NO_DUPLICATES`, posting-rules).
   * @param ctx Execution context.
   * @param action Candidate action.
   * @returns A skip reason when the action is already covered; undefined otherwise.
   * @sideEffect Read-only VCS lookups (getDiscussions / getMrContext).
   */
  protected async _reconcileDedup(
    ctx: EffectExecutionContext,
    action: ProposedAction
  ): Promise<string | undefined> {
    switch (action.type) {
      case 'resolve': {
        const discussions = await this._vcs.getDiscussions(ctx.mr, { all: true });
        const thread = discussions.find((d) => d.id === action.discussionId);
        if (thread && thread.resolved === action.resolve) {
          return `thread ${action.discussionId} already resolved=${action.resolve}`;
        }
        return undefined;
      }

      case 'reply': {
        if (!action.discussionId || action.delete || action.noteId) {
          return undefined;
        }
        const discussions = await this._vcs.getDiscussions(ctx.mr, { all: true, my: true });
        const thread = discussions.find((d) => d.id === action.discussionId);
        const proposedBody = (action.body ?? '').trim();
        const alreadyPosted = thread?.notes.some((n) => n.body.trim() === proposedBody);
        return alreadyPosted
          ? `identical reply already posted in ${action.discussionId}`
          : undefined;
      }

      case 'approve': {
        const mrContext = await this._vcs.getMrContext(ctx.mr);
        const myLogin = await this._vcs.getMyLogin();
        const alreadyApproved = !!myLogin && mrContext.approvedBy.includes(myLogin);
        if (action.revoke && !alreadyApproved) {
          return 'nothing to revoke — not currently approved by me';
        }
        if (!action.revoke && alreadyApproved) return 'MR already approved by me';
        return undefined;
      }

      // React reconcile requires reaction-state telemetry VcsInboxPort does not expose (read-only
      // Discussion type carries no reaction data) — deferred; idempotency guard above still applies.
      case 'react':
      case 'deleteDrafts':
        return undefined;
    }
  }

  // ─── Apply ────────────────────────────────────────────────────────────────────

  /**
   * @purpose Dispatch one action to its concrete vcs-* implementation.
   * @param ctx Execution context.
   * @param action Action to apply.
   * @throws {Error} When the underlying CLI command reports a non-zero exit.
   * @returns Promise resolving once the underlying call completes.
   */
  protected async _apply(ctx: EffectExecutionContext, action: ProposedAction): Promise<void> {
    switch (action.type) {
      case 'react': {
        const argv = ['--url', ctx.mr, '--comment', action.commentId, '--emoji', action.emoji];
        if (action.remove) argv.push('--remove');
        const result = await invokeCliCommand(runVcsReact, argv);
        if (result.code !== 0) throw new Error(`vcs-react exit=${result.code}: ${result.stderr}`);
        return;
      }

      case 'approve': {
        const argv = ['--url', ctx.mr];
        if (action.revoke) argv.push('--revoke');
        const result = await invokeCliCommand(runVcsApprove, argv);
        if (result.code !== 0) throw new Error(`vcs-approve exit=${result.code}: ${result.stderr}`);
        return;
      }

      case 'deleteDrafts': {
        const result = await invokeCliCommand(runVcsDraftNote, ['--url', ctx.mr, '--delete-all']);
        if (result.code !== 0) {
          throw new Error(`vcs-draft-note exit=${result.code}: ${result.stderr}`);
        }
        return;
      }

      case 'resolve': {
        await this._postReply(ctx, [
          { discussionId: action.discussionId, resolve: action.resolve },
        ]);
        return;
      }

      case 'reply': {
        await this._postReply(ctx, [
          {
            discussionId: action.discussionId,
            body: action.body,
            position: action.position,
            suggestion: action.suggestion,
            suggestionRange: action.suggestionRange,
            noteId: action.noteId,
            delete: action.delete,
          },
        ]);
        return;
      }
    }
  }

  /**
   * @purpose Post one reply/resolve/edit/delete item via vcs-reply's typed `main()` — the only
   * vcs-* dependency exposing a clean function (no argv/process.exit involved).
   * @param ctx Execution context (resolves project/iid from the MR).
   * @param payload Single-item reply payload.
   * @throws {Error} When vcs-reply reports failure (`ok: false` or `failed > 0`).
   * @returns Promise resolving once the post completes.
   */
  protected async _postReply(
    ctx: EffectExecutionContext,
    payload: Array<{
      discussionId?: string;
      body?: string;
      position?: VcsDiscussionPosition;
      suggestion?: string;
      suggestionRange?: { above: number; below: number };
      noteId?: string;
      delete?: boolean;
      resolve?: boolean;
    }>
  ): Promise<void> {
    const mrContext = await this._vcs.getMrContext(ctx.mr);
    const result = await postVcsReply({
      project: mrContext.project,
      iid: mrContext.iid,
      host: this._vcs.getHost() || undefined,
      stdinJsonArray: payload,
    });
    if (!result.ok || result.failed > 0) {
      throw new Error(`vcs-reply failed: ${result.error ?? result.detail ?? 'unknown error'}`);
    }
  }

  // ─── Fingerprint ──────────────────────────────────────────────────────────────

  /**
   * @purpose Stable string identity for an action — the idempotency key alongside `nodeId`.
   * @param action Proposed action.
   * @returns Deterministic string encoding the action's identity fields.
   */
  protected _fingerprint(action: ProposedAction): string {
    switch (action.type) {
      case 'react':
        return `react:${action.commentId}:${action.emoji}:${!!action.remove}`;
      case 'reply': {
        const target = `${action.discussionId ?? 'new'}:${action.noteId ?? ''}`;
        const bodyPrefix = (action.body ?? action.suggestion ?? '').slice(0, 64);
        return `reply:${target}:${!!action.delete}:${bodyPrefix}`;
      }
      case 'resolve':
        return `resolve:${action.discussionId}:${action.resolve}`;
      case 'approve':
        return `approve:${!!action.revoke}`;
      case 'deleteDrafts':
        return 'deleteDrafts';
    }
  }
}
