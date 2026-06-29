// @file: Build a GitLab client for the actionable inbox; host from --vcs-host or origin.
// @consumers: inbox.cmd
// @tasks: N/A

import { getGitRemote } from '../../../../../shared/backend/git/git-core.ts';
import { VcsGitlabClient } from '../../../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';

/**
 * @purpose Resolve the GitLab host: explicit --vcs-host overrides autodetect,
 *   otherwise read it from the origin remote of the current repo.
 * @param [vcsSource] Explicit host from --vcs-host (autodetect is skipped when set).
 * @returns GitLab host without scheme, e.g. gitlab.example.com.
 * @invariant Error Policy: Throws when no host can be resolved.
 * @sideEffect Runs git to read origin when no override is given.
 * @consumer buildInboxClient
 */
function resolveHost(vcsSource?: string): string {
  const explicit = vcsSource
    ?.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  if (explicit) return explicit;

  const remote = getGitRemote();
  if (!remote?.host) {
    throw new Error(
      'Не удалось определить GitLab host. Укажите --vcs-host=<host> или запустите команду в репозитории с настроенным origin remote.'
    );
  }
  return remote.host;
}

/**
 * @purpose Build a GitLab client for the actionable inbox; the inbox query is
 *   account-global, so only a host (not a project) is required.
 * @invariant Error Policy: Throws on missing token, unresolved host, or non-GitLab provider.
 * @param [vcsSource] Explicit host from --vcs-host; disables origin autodetect.
 * @returns Configured GitLab client.
 * @sideEffect Reads env GITLAB_PERSONAL_TOKEN; may run git to read origin.
 * @consumer inbox.cmd
 */
export function buildInboxClient(vcsSource?: string): VcsGitlabClient {
  const token = process.env.GITLAB_PERSONAL_TOKEN;
  if (!token) {
    throw new Error(
      'Не найден токен доступа GitLab. Установите GITLAB_PERSONAL_TOKEN и повторите попытку.'
    );
  }

  const host = resolveHost(vcsSource);
  if (!/gitlab/i.test(host)) {
    throw new Error(`Провайдер "${host}" пока не поддерживается.`);
  }

  const baseUrl = `https://${host}/api/v4`;

  return new VcsGitlabClient({ token, baseUrl });
}
