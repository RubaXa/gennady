// @file: GitLab REST API client — HTTP adapter implementing VcsClient contract.
// @consumers: cli/review-verify, cli/cat
// @tasks: TSK-29, TSK-84

import { VcsGitlabMergeRequests } from './vcs-gitlab-merge-requests.ts';
import { VcsGitlabMergeDiscussions } from './vcs-gitlab-merge-discussions.ts';
import { VcsGitlabRepositoryFiles } from './vcs-gitlab-repository-files.ts';
import { VcsGitlabInbox } from './vcs-gitlab-inbox.ts';
import { VcsGitlabPipeline } from './vcs-gitlab-pipeline.ts';
import { VcsGitlabReactions } from './vcs-gitlab-reactions.ts';
import { VcsClient } from '../abstract/vcs-client.ts';
import type { VcsUser } from '../entities/vcs-user.type.ts';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * @purpose Options for creating a GitLab API client: base URL and access token.
 * @consumer VcsGitlabClient
 */
export type VcsGitlabClientOptions = {
  /** @purpose GitLab instance base URL (e.g. https://gitlab.example.com) */
  baseUrl: string;
  /** @purpose GitLab personal or project access token */
  token: string;
};

/**
 * @purpose GitLab client for working with REST API.
 * @invariant Error Policy: Any non-2xx response is converted to an Error with status details.
 * @invariant Retry Policy: No retries; retry responsibility lies with the caller.
 * @consumer cli/review-verify
 */
export class VcsGitlabClient extends VcsClient {
  /** @see {VcsClient#MergeRequests} in services/vcs-client/abstract/vcs-client.ts */
  readonly MergeRequests: VcsGitlabMergeRequests;

  /** @see {VcsClient#MergeDiscussions} in services/vcs-client/abstract/vcs-client.ts */
  readonly MergeDiscussions: VcsGitlabMergeDiscussions;

  /** @see {VcsClient#RepositoryFiles} in services/vcs-client/abstract/vcs-client.ts */
  readonly RepositoryFiles: VcsGitlabRepositoryFiles;

  /** @see {VcsClient#Inbox} in services/vcs-client/abstract/vcs-client.ts */
  readonly Inbox: VcsGitlabInbox;

  /** @see {VcsClient#Pipeline} in services/vcs-client/abstract/vcs-client.ts */
  readonly Pipeline: VcsGitlabPipeline;

  /** @see {VcsClient#Reactions} in services/vcs-client/abstract/vcs-client.ts */
  readonly Reactions: VcsGitlabReactions;

  /** @purpose Bound REST request fn for ad-hoc endpoints (e.g. /user) */
  protected _request: RequestFn;

  /**
   * @purpose Create a GitLab API client bound to a base URL with access token.
   * @param options Connection parameters: base URL and access token.
   */
  constructor(options: VcsGitlabClientOptions) {
    super();

    const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
      const { responseType, ...fetchInit } = init as RequestInit & { responseType?: string };
      const response = await fetch(`${options.baseUrl}${path}`, {
        ...fetchInit,
        headers: {
          'PRIVATE-TOKEN': options.token,
          ...(fetchInit.headers ?? {}),
        },
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`GitLab request failed: ${response.status} ${response.statusText} ${text}`);
      }
      if (responseType === 'text') {
        return response.text();
      }
      return response.json();
    };

    // GraphQL lives at /api/graphql, a sibling of the REST /api/v4 base.
    const graphqlUrl = `${new URL(options.baseUrl).origin}/api/graphql`;
    const graphql = async (
      query: string,
      variables?: Record<string, unknown>
    ): Promise<unknown> => {
      const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: {
          'PRIVATE-TOKEN': options.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `GitLab GraphQL request failed: ${response.status} ${response.statusText} ${text}`
        );
      }
      const payload = (await response.json()) as {
        data?: unknown;
        errors?: Array<{ message?: string }>;
      };
      if (payload.errors && payload.errors.length > 0) {
        const message = payload.errors.map((e) => e.message ?? '').join('; ');
        throw new Error(`GitLab GraphQL errors: ${message}`);
      }
      return payload.data;
    };

    this._request = request;
    this.MergeRequests = new VcsGitlabMergeRequests(request, graphql);
    this.MergeDiscussions = new VcsGitlabMergeDiscussions(request);
    this.RepositoryFiles = new VcsGitlabRepositoryFiles(options.baseUrl, options.token);
    this.Inbox = new VcsGitlabInbox(graphql);
    this.Pipeline = new VcsGitlabPipeline(request);
    this.Reactions = new VcsGitlabReactions(request);
  }

  /**
   * @purpose Get the authenticated user behind the token (identity for the inbox).
   * @returns Current user's login and display name.
   * @sideEffect Network: GET /user
   */
  async getCurrentUser(): Promise<VcsUser> {
    const user = (await this._request('/user')) as { username?: string; name?: string };
    return { login: user.username ?? '', name: user.name ?? '' };
  }
}
