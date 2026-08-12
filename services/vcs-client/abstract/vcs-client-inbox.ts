// @file: Contract surface for the actionable inbox — MRs awaiting the user's reaction.
// @consumers: VcsClient
// @tasks: TSK-75

import type { VcsActionableMr } from '../entities/vcs-actionable-mr.type.ts';

/**
 * @purpose Access authenticated user's actionable inbox: MRs requiring their reaction (review requested, mentioned, assigned) and own open MRs (awaiting reaction).
 * @invariant Error Policy: Network/GraphQL errors are thrown outward.
 * @invariant Identity: The authenticated token implicitly defines "me"; no
 *   user id/username is passed in.
 * @consumer VcsClient
 */
export abstract class VcsClientInbox {
  /**
   * @purpose Fetch merge requests awaiting the user's reaction from the three real
   *   relationships (explicit reviewer, assignee, author); pending todos are not a
   *   discovery source.
   * @param [filter] Optional scope: `iid` targets one MR; `updatedAfter` is an ISO
   *   recency bound; `includeTodos` also reads pending todos (todo management only).
   * @returns Deduplicated actionable MRs with merged reasons; unfiltered (drafts included).
   * @sideEffect Network: POST /api/graphql (currentUser MR connections; todos only when requested)
   */
  abstract getActionable(filter?: {
    iid?: string;
    updatedAfter?: string;
    includeTodos?: boolean;
  }): Promise<VcsActionableMr[]>;

  /**
   * @purpose Mark a single todo as done.
   * @param query Identifies the todo to mark as completed.
   * @returns Promise that resolves when the operation completes.
   * @sideEffect Network: POST /api/graphql (todoMarkDone mutation)
   */
  abstract markTodoDone(query: { todoId: string }): Promise<void>;
}
