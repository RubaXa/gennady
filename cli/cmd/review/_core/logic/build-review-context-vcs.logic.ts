// @file: Build VCS context and GitLab API client.
// @consumers: run-review-command.logic
// @tasks: N/A

import { VcsGitlabClient } from '../../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import type { ReviewContextVcs } from '../types/review-context-vcs.type.ts';

/**
 * @purpose Build VCS context and GitLab API client.
 * @param host GitLab host.
 * @param project GitLab project path/id.
 * @returns ReviewContextVcs.
 * @consumer run-review-command.logic
 */
export function buildReviewContextVcs(host: string, project: string): ReviewContextVcs {
  const token = process.env.GITLAB_PERSONAL_TOKEN;
  if (!token) {
    throw new Error(
      'Не найден токен доступа GitLab. Установите GITLAB_PERSONAL_TOKEN и повторите попытку.'
    );
  }

  if (!/gitlab/i.test(host)) {
    throw new Error(`Провайдер "${host}" пока не поддерживается.`);
  }

  const apiPath = process.env.GITLAB_API_PATH ?? '/api/v4';
  const baseUrl = `https://${host}${apiPath}`;

  return {
    host,
    project,
    vcs: new VcsGitlabClient({ token, baseUrl }),
  };
}
