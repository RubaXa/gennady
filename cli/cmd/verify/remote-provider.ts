// @file: Read-only VCS provider discovery for universal Verify remote selectors.
// @spec: CLI-VERIFY
// @consumers: VerifyCommand

import { execFileSync } from 'node:child_process';
import { VcsGithubClient } from '../../../services/vcs-client/github/vcs-github-client.ts';
import { VcsGitlabClient } from '../../../services/vcs-client/gitlab/vcs-gitlab-client.ts';
import type { RemotePipelineObserver } from '../../../shared/verify/execution/remote-watcher.ts';

/** @purpose Return a ready read-only observer or an actionable readiness failure. */
type RemoteProviderResolution =
  | { readonly ok: true; readonly observer: RemotePipelineObserver }
  | { readonly ok: false; readonly message: string; readonly fix: string };

function originIdentity(root: string): { readonly host: string; readonly project: string } | null {
  let value: string;
  try {
    value = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
  const ssh = value.match(/^(?:ssh:\/\/)?git@([^:/]+)(?::\d+)?[:/]([^\s]+?)(?:\.git)?$/);
  if (ssh) return { host: ssh[1]!, project: ssh[2]!.replace(/\.git$/, '') };
  try {
    const url = new URL(value);
    const project = url.pathname.replace(/^\/+/, '').replace(/\.git$/, '');
    return url.hostname !== '' && project !== '' ? { host: url.hostname, project } : null;
  } catch {
    return null;
  }
}

function providerForHost(host: string): 'github' | 'gitlab' | null {
  const normalized = host.toLowerCase();
  if (normalized === 'github.com') return 'github';
  if (normalized === 'gitlab.com' || /(^|[.-])gitlab([.-]|$)/.test(normalized)) return 'gitlab';
  return null;
}

/**
 * @purpose Resolve a provider observer from origin plus existing credential environment only.
 * @param root Canonical repository root whose origin identifies the provider project.
 * @returns Read-only observer resolution without starting or mutating provider pipelines.
 */
export function resolveRemotePipelineObserver(root: string): RemoteProviderResolution {
  const origin = originIdentity(root);
  if (origin === null) {
    return {
      ok: false,
      message: 'origin remote cannot be resolved for exact-SHA provider observation',
      fix: 'configure a GitLab or GitHub origin remote',
    };
  }
  const provider = providerForHost(origin.host);
  if (provider === null) {
    return {
      ok: false,
      message: `origin host ${origin.host} does not prove a supported GitHub or GitLab provider`,
      fix: 'use github.com or a self-hosted origin whose DNS name explicitly identifies GitLab',
    };
  }
  const token =
    provider === 'github'
      ? (process.env.GITHUB_PERSONAL_TOKEN ?? process.env.GITHUB_TOKEN)
      : process.env.GITLAB_PERSONAL_TOKEN;
  if (token === undefined || token.trim() === '') {
    return {
      ok: false,
      message: `${provider === 'github' ? 'GitHub' : 'GitLab'} credentials are unavailable for read-only CI observation`,
      fix:
        provider === 'github'
          ? 'set GITHUB_PERSONAL_TOKEN or GITHUB_TOKEN with read-only Actions access'
          : 'set GITLAB_PERSONAL_TOKEN with read-only API access',
    };
  }
  const client =
    provider === 'github'
      ? new VcsGithubClient({ baseUrl: 'https://api.github.com', token })
      : new VcsGitlabClient({ baseUrl: `https://${origin.host}/api/v4`, token });
  return {
    ok: true,
    observer: {
      provider,
      project: origin.project,
      pipeline: client.Pipeline!,
    },
  };
}
