// @file: Thread-decision action mapping and SV-24 dispute-summary materialization for RoleInstance.
// @consumers: role-instance.ts
// @tasks: N/A

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { logger } from '#logger';
import type { NodeContext } from '../role-node.ts';
import type { Discussion } from '../../inbox-core/vcs-inbox.port.ts';
import type { ThreadDecision } from '../thread-signal-classifier.ts';
import type { ProposedAction } from '../effect-executor.ts';
import type { DisputeSummary } from './escalation-gate.ts';

/**
 * @purpose Translate one thread's `ThreadDecision` into the `ProposedAction`s `EffectExecutor`
 *   understands — reuses `ReactAction`/`ReplyAction`/`ResolveAction` as-is (no new effect kinds).
 * @param actions Batch accumulator — actions are pushed in dispatch order.
 * @param thread Discussion the decision was made for.
 * @param decision Outcome of `decideThreadAction` for this thread.
 */
export function appendThreadDecisionActions(
  actions: ProposedAction[],
  thread: Discussion,
  decision: ThreadDecision
): void {
  switch (decision.kind) {
    case 'resolve_silently':
      actions.push({
        type: 'reply',
        discussionId: thread.id,
        body: 'Automated check: commit + code re-read confirm this is fixed. Resolving.',
      });
      actions.push({ type: 'resolve', discussionId: thread.id, resolve: true });
      break;
    case 'react_then_resolve': {
      const lastNote = thread.notes[thread.notes.length - 1];
      if (lastNote) actions.push({ type: 'react', commentId: lastNote.id, emoji: '👍' });
      actions.push({ type: 'resolve', discussionId: thread.id, resolve: true });
      break;
    }
    case 'reply_not_done':
      actions.push({
        type: 'reply',
        discussionId: thread.id,
        body: 'Automated check: no fix found for this yet after the quiet period. Still open.',
      });
      break;
    case 'skip':
    case 'dispute':
      break;
  }
}

/**
 * @purpose Read a few lines of code around a disputed thread's location, for the dispute summary.
 * @invariant Degrades to `undefined` on a file-less thread or an unreadable worktree — never
 *   blocks the dispute summary on a missing code snippet.
 * @param thread The disputed discussion.
 * @param ctx Node context — supplies `worktreePath`.
 * @returns A short code snippet, or undefined when unavailable.
 * @sideEffect FS: reads `thread.file` under `ctx.artifacts.worktreePath`.
 */
export function readDisputeCodeSnippet(thread: Discussion, ctx: NodeContext): string | undefined {
  const worktreePath = ctx.artifacts['worktreePath'] as string | undefined;
  if (!worktreePath || !thread.file || thread.line === undefined) return undefined;

  try {
    const lines = readFileSync(join(worktreePath, thread.file), 'utf-8').split('\n');
    const start = Math.max(0, thread.line - 2);
    const end = Math.min(lines.length, thread.line + 1);
    return lines.slice(start, end).join('\n');
  } catch (cause) {
    logger.warn('[RoleInstance#_readDisputeCodeSnippet] [reading → degraded]', {
      file: thread.file,
      error: String(cause),
    });
    return undefined;
  }
}

/**
 * @purpose Materialize the SV-24 trigger-2 dispute summary (finding/author argument/code/
 *   recommendation) so the ask artifact carries substance, not just a disputed flag.
 * @param thread The disputed discussion.
 * @param ctx Node context — used for `ctx.mr.author` and the worktree code-snippet read.
 * @returns Dispute summary for display at the ask node.
 */
export function buildDisputeSummary(thread: Discussion, ctx: NodeContext): DisputeSummary {
  const authorNote = [...thread.notes].reverse().find((note) => note.username === ctx.mr.author);

  return {
    finding: thread.body,
    authorArgument: authorNote?.body ?? '(автор не ответил в треде)',
    codeSnippet: readDisputeCodeSnippet(thread, ctx),
    recommendation:
      'Сверить довод автора с находкой и решить: закрыть тред вручную или настоять на исправлении.',
  };
}
