// @file: Abstract VCS client surface — ports for merge requests, discussions, repository files, reactions.
// @consumers: cli/review-verify, cli/cat
// @tasks: TSK-28, TSK-84, TSK-98

import type { VcsClientMergeDiscussions } from './vcs-client-merge-discussions.ts';
import type { VcsClientMergeRequests } from './vcs-client-merge-requests.ts';
import type { VcsClientRepositoryFiles } from './vcs-client-repository-files.ts';
import type { VcsClientInbox } from './vcs-client-inbox.ts';
import type { VcsClientPipeline } from './vcs-client-pipeline.ts';
import type { VcsClientReactions } from './vcs-client-reactions.ts';

/**
 * @purpose Abstract client for working with VCS services (e.g. GitLab, GitHub).
 * @invariant Error Policy: Any non-2xx response is converted to an Error with status details.
 * @invariant Retry Policy: No retries; retry responsibility lies with the caller.
 * @consumer cli/review-verify, cli/cat
 */
export abstract class VcsClient {
  /** @see {VcsClientMergeRequests} in ./vcs-client-merge-requests.ts */
  abstract readonly MergeRequests: VcsClientMergeRequests;

  /** @see {VcsClientMergeDiscussions} in ./vcs-client-merge-discussions.ts | @deferred GitHub adapter does not implement this */
  abstract readonly MergeDiscussions?: VcsClientMergeDiscussions;

  /** @see {VcsClientRepositoryFiles} in ./vcs-client-repository-files.ts | @deferred GitLab-only in v1 */
  abstract readonly RepositoryFiles?: VcsClientRepositoryFiles;

  /** @see {VcsClientInbox} in ./vcs-client-inbox.ts | @deferred GitLab-only; GitHub adapter does not implement this */
  abstract readonly Inbox?: VcsClientInbox;

  /** @see {VcsClientPipeline} in ./vcs-client-pipeline.ts | @deferred GitLab-only; GitHub adapter does not implement this */
  abstract readonly Pipeline?: VcsClientPipeline;

  /** @see {VcsClientReactions} in ./vcs-client-reactions.ts */
  abstract readonly Reactions?: VcsClientReactions;
}
