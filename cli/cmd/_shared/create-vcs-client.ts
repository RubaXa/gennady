// @file: Shared VCS client factory — creates correct client (GitLab/GitHub) from resolved context.
// @consumers: all vcs-* commands, inbox-context
// @tasks: TSK-68

import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import type { VcsClient } from '../../../services/vcs-client/abstract/vcs-client.ts';
import type { VcsCliContext } from './vcs-context-resolver.ts';

/**
 * @purpose Create a provider-appropriate VCS client from resolved context.
 * @param context Resolved VCS context with provider, host, and token.
 * @returns VcsClient — VcsGithubClient or VcsGitlabClient depending on provider.
 */
export function createVcsClient(context: VcsCliContext): VcsClient {
  return context.provider === 'github'
    ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token: context.token })
    : new VcsGitlabClient({ baseUrl: `https://${context.host}/api/v4`, token: context.token });
}
