// @file: Build a GitLab client for the actionable inbox; host auto-detected from origin.
// @consumers: inbox.cmd
// @tasks: N/A

import { getGitRemote } from '../../../../../shared/backend/git/git-core.ts';
import { VcsGitlabClient } from '../../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';

/**
 * @purpose Build a GitLab client whose host is detected from the origin remote
 *   (the inbox query is account-global, so no project is needed).
 * @invariant Error Policy: Throws on missing token, undetectable host, or non-GitLab provider.
 * @returns Configured GitLab client.
 * @sideEffect Reads env GITLAB_PERSONAL_TOKEN / GITLAB_API_PATH; runs git to read origin.
 * @consumer inbox.cmd
 */
export function buildInboxClient(): VcsGitlabClient {
  const token = process.env.GITLAB_PERSONAL_TOKEN;
  if (!token) {
    throw new Error(
      'Не найден токен доступа GitLab. Установите GITLAB_PERSONAL_TOKEN и повторите попытку.'
    );
  }

  const remote = getGitRemote();
  if (!remote?.host) {
    throw new Error(
      'Не удалось определить GitLab host. Запустите команду в репозитории с настроенным origin remote.'
    );
  }

  if (!/gitlab/i.test(remote.host)) {
    throw new Error(`Провайдер "${remote.host}" пока не поддерживается.`);
  }

  const apiPath = process.env.GITLAB_API_PATH ?? '/api/v4';
  const baseUrl = `https://${remote.host}${apiPath}`;

  return new VcsGitlabClient({ token, baseUrl });
}
