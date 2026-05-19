// @file: Abstract VCS client surface — ports for merge requests, discussions, repository files.
// @consumers: cli/review-verify, cli/cat
// @tasks: TSK-28

import type { VcsClientMergeDiscussions } from './vcs-client-merge-discussions.ts';
import type { VcsClientMergeRequests } from './vcs-client-merge-requests.ts';
import type { VcsClientRepositoryFiles } from './vcs-client-repository-files.ts';

/**
 * @purpose Абстрактный клиент для работы с VCS Сервисами (например GitLab, Github).
 * @invariant Error Policy: Любой ответ !2xx преобразуется в Error с подробностями статуса.
 * @invariant Retry Policy: Повторов нет; ответственность за ретраи на вызывающей стороне.
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
