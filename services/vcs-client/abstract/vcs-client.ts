// @file: Abstract VCS client surface — ports for merge requests and discussions.
// @consumers: cli/review-verify

import type { VcsClientMergeDiscussions } from './vcs-client-merge-discussions.ts';
import type { VcsClientMergeRequests } from './vcs-client-merge-requests.ts';

/**
 * @purpose Абстрактный клиент для работы с VCS Сервисами (например GitLab, Github).
 * @invariant Error Policy: Любой ответ !2xx преобразуется в Error с подробностями статуса.
 * @invariant Retry Policy: Повторов нет; ответственность за ретраи на вызывающей стороне.
 */
export abstract class VcsClient {
  /** @see {VcsClientMergeRequests} in ./vcs-client-merge-requests.ts */
  abstract readonly MergeRequests: VcsClientMergeRequests;

  /** @see {VcsClientMergeDiscussions} in ./vcs-client-merge-discussions.ts */
  abstract readonly MergeDiscussions: VcsClientMergeDiscussions;
}
