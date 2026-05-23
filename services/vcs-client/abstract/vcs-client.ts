// @file: Abstract VCS client surface — ports for merge requests, discussions, repository files.
// @consumers: cli/review-verify, cli/cat
// @tasks: TSK-28

import type { VcsClientMergeDiscussions } from './vcs-client-merge-discussions.ts';
import type { VcsClientMergeRequests } from './vcs-client-merge-requests.ts';
import type { VcsClientRepositoryFiles } from './vcs-client-repository-files.ts';

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
}
