// @file: Pure planning + bounded-concurrency execution for pending-todo cleanup.
// @consumers: inbox.cmd (cleanup mode)
// @tasks: TSK-174

import type { PendingMrTodo } from '../../../../../services/vcs-client/gitlab/vcs-gitlab-inbox.ts';

/** @purpose Split a pending-todo list into the ghost set (merged/closed target) and the rest. */
export type TodoCleanupPlan = {
  /** @purpose Count of all pending MR todos considered */
  total: number;
  /** @purpose Todos safe to clear — target MR merged or closed */
  ghosts: PendingMrTodo[];
  /** @purpose Count of todos whose target MR is still open (never cleared) */
  openedCount: number;
};

/**
 * @purpose Select the todos safe to clear — those whose target MR is merged or closed.
 * @invariant A todo on an `opened` MR is NEVER selected — it may still need a reaction.
 * @param todos All pending merge-request todos.
 * @returns The cleanup plan; `ghosts` never includes an open-MR todo.
 */
export function planTodoCleanup(todos: PendingMrTodo[]): TodoCleanupPlan {
  const ghosts = todos.filter((t) => t.targetState === 'merged' || t.targetState === 'closed');
  return { total: todos.length, ghosts, openedCount: todos.length - ghosts.length };
}

/** @purpose Outcome of marking a batch of todos done. */
export type MarkResult = {
  /** @purpose Count of todos successfully marked done */
  marked: number;
  /** @purpose Count of todos whose mutation rejected */
  failed: number;
};

/**
 * @purpose Mark todo ids done through an injected mutator, bounded by concurrency.
 * @param markOne Mutator marking a single todo done; a rejection counts as one failure.
 * @param todoIds Todo ids to mark done.
 * @param [concurrency] Max in-flight mutations (default 8).
 * @returns Counts of marked and failed todos.
 * @sideEffect Whatever `markOne` does (GitLab mutation in production).
 */
export async function markTodosDone(
  markOne: (todoId: string) => Promise<void>,
  todoIds: string[],
  concurrency = 8
): Promise<MarkResult> {
  let marked = 0;
  let failed = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < todoIds.length) {
      const id = todoIds[next++]!;
      try {
        await markOne(id);
        marked++;
      } catch {
        failed++;
      }
    }
  };
  const lanes = Math.min(concurrency, todoIds.length);
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return { marked, failed };
}
