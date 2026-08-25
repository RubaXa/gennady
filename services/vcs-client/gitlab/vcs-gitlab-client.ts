// @file: GitLab REST API client — HTTP adapter implementing VcsClient contract.
// @consumers: cli/review-verify, cli/cat
// @tasks: TSK-29, TSK-84, TSK-174

import { VcsGitlabMergeRequests } from './vcs-gitlab-merge-requests.ts';
import { VcsGitlabMergeDiscussions } from './vcs-gitlab-merge-discussions.ts';
import { VcsGitlabRepositoryFiles } from './vcs-gitlab-repository-files.ts';
import { VcsGitlabInbox } from './vcs-gitlab-inbox.ts';
import { VcsGitlabPipeline } from './vcs-gitlab-pipeline.ts';
import { VcsGitlabReactions } from './vcs-gitlab-reactions.ts';
import { VcsClient } from '../abstract/vcs-client.ts';
import type { VcsUser } from '../entities/vcs-user.type.ts';
import { logger } from '#logger';

type RequestFn = (path: string, init?: RequestInit) => Promise<unknown>;

/** @purpose Error enriched with the server-directed retry delay for a 429 response. */
type GitlabRequestError = Error & { retryAfter?: number };

const READ_RETRY_DELAYS_MS = [150, 500, 1_500, 3_000] as const;

/** @purpose Keep transport diagnostics while making bounded read retries observable. */
function describeCause(cause: unknown): string {
  if (cause instanceof AggregateError) {
    const entries = cause.errors
      .map((entry: unknown) => describeCause(entry))
      .filter((entry: string) => entry.length > 0);
    return entries.length > 0 ? entries.join('; ') : cause.message || 'AggregateError';
  }
  if (!(cause instanceof Error)) return String(cause);
  const nested = (cause as Error & { cause?: unknown }).cause;
  const transport = cause as NodeJS.ErrnoException & {
    address?: string;
    port?: number;
    syscall?: string;
  };
  const context = [transport.code, transport.syscall, transport.address, transport.port]
    .filter((value) => value !== undefined && value !== '')
    .join(' ');
  const own =
    context && !cause.message.includes(context) ? `${cause.message} (${context})` : cause.message;
  if (nested === undefined) return own;
  const nestedDescription = describeCause(nested);
  return nestedDescription ? `${own}: ${nestedDescription}` : own;
}

/** @purpose Retry idempotent GitLab reads after transient transport/server failures. */
async function fetchReadWithRetry(
  input: string,
  init: RequestInit,
  operation: string
): Promise<Response> {
  let lastCause: unknown;
  for (let attempt = 0; attempt <= READ_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (
        ![429, 502, 503, 504].includes(response.status) ||
        attempt === READ_RETRY_DELAYS_MS.length
      ) {
        return response;
      }
      lastCause = new Error(`GitLab transient response: ${response.status}`);
    } catch (cause) {
      lastCause = cause;
      if (attempt === READ_RETRY_DELAYS_MS.length) break;
    }

    const delayMs = READ_RETRY_DELAYS_MS[attempt];
    logger.warn('[VcsGitlabClient#fetchReadWithRetry] [failed → retrying]', {
      operation,
      attempt: attempt + 1,
      delayMs,
      cause: describeCause(lastCause),
    });
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`GitLab ${operation} failed after bounded retries: ${describeCause(lastCause)}`, {
    cause: lastCause,
  });
}

/** @purpose Preserve GitLab's Retry-After header at the caller-owned retry boundary. */
function createGitlabRequestError(response: Response, message: string): GitlabRequestError {
  const error = new Error(message) as GitlabRequestError;
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
  return error;
}

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

/** @purpose Normalized GitLab approval observation with explicit completeness. */
type GitlabMergeRequestApprovals = {
  /** @purpose Usernames returned by the dedicated approvals endpoint. */
  approvedBy: string[];
  /** @purpose Project-required approval count when exposed by GitLab. */
  approvalsRequired?: number;
  /** @purpose True only when the dedicated endpoint returned its expected shape. */
  complete: boolean;
};

/** @purpose Ordered commit comparison returned by GitLab repository compare. */
type GitlabCommitComparison = {
  /** @purpose Commit SHAs ordered as returned by GitLab. */
  commits: string[];
  /** @purpose False when GitLab reports timeout/overflow or an invalid payload. */
  complete: boolean;
  /** @purpose Stable provider evidence explaining completeness. */
  evidence: string;
};

/**
 * @purpose GitLab client for working with REST API.
 * @invariant Error Policy: Any non-2xx response is converted to an Error with status details.
 * @invariant Retry Policy: bounded retries apply only to idempotent REST GETs and GraphQL queries;
 *   mutations are never retried blindly.
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
  /** @purpose Bound GraphQL request fn used by native review-state capability and effects */
  protected _graphql: (query: string, variables?: Record<string, unknown>) => Promise<unknown>;

  /**
   * @purpose Create a GitLab API client bound to a base URL with access token.
   * @param options Connection parameters: base URL and access token.
   */
  constructor(options: VcsGitlabClientOptions) {
    super();

    const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
      const { responseType, ...fetchInit } = init as RequestInit & { responseType?: string };
      const requestInit = {
        ...fetchInit,
        // Match the GraphQL 15s ceiling — default fetch has no timeout, so a stalled REST
        // connection would otherwise hang the caller (e.g. twoTierSync) forever.
        signal: fetchInit.signal ?? AbortSignal.timeout(15_000),
        headers: {
          'PRIVATE-TOKEN': options.token,
          ...(fetchInit.headers ?? {}),
        },
      } satisfies RequestInit;
      const method = (requestInit.method ?? 'GET').toUpperCase();
      const response =
        method === 'GET'
          ? await fetchReadWithRetry(`${options.baseUrl}${path}`, requestInit, `GET ${path}`)
          : await fetch(`${options.baseUrl}${path}`, requestInit);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw createGitlabRequestError(
          response,
          `GitLab request failed: ${response.status} ${response.statusText} ${text}`
        );
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
      const requestInit = {
        method: 'POST',
        headers: {
          'PRIVATE-TOKEN': options.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(15_000),
      } satisfies RequestInit;
      const isQuery = !/^\s*mutation\b/i.test(query);
      const response = isQuery
        ? await fetchReadWithRetry(graphqlUrl, requestInit, 'GraphQL query')
        : await fetch(graphqlUrl, requestInit);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw createGitlabRequestError(
          response,
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
    this._graphql = graphql;
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

  /**
   * @purpose Read approvers from GitLab's dedicated MR approvals endpoint.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @returns Normalized approvers and required count with honest completeness.
   * @sideEffect Network: GET /projects/:id/merge_requests/:iid/approvals.
   */
  async getMergeRequestApprovals(
    project: string,
    iid: string
  ): Promise<GitlabMergeRequestApprovals> {
    // #region START_READ_MERGE_REQUEST_APPROVALS
    try {
      const projectId = encodeURIComponent(project);
      const mrIid = encodeURIComponent(iid);
      const data = (await this._request(
        `/projects/${projectId}/merge_requests/${mrIid}/approvals`
      )) as {
        approved_by?: Array<{ user?: { username?: string } }>;
        approvals_required?: number;
      };
      // #region START_CLASSIFY_APPROVAL_OBSERVATION_COMPLETENESS
      if (!Array.isArray(data.approved_by)) {
        return { approvedBy: [], complete: false };
      }
      // #endregion END_CLASSIFY_APPROVAL_OBSERVATION_COMPLETENESS
      return {
        approvedBy: data.approved_by
          .map((approval) => approval.user?.username ?? '')
          .filter(Boolean),
        ...(typeof data.approvals_required === 'number'
          ? { approvalsRequired: data.approvals_required }
          : {}),
        complete: true,
      };
    } catch (cause) {
      const error = new Error(
        `[VcsGitlabClient#getMergeRequestApprovals] Approval observation failed for ${project}!${iid}`,
        { cause }
      );
      logger.error(
        '[VcsGitlabClient#getMergeRequestApprovals] [reading → failed] Approval observation failed',
        { error, project, iid }
      );
      throw error;
    }
    // #endregion END_READ_MERGE_REQUEST_APPROVALS
  }

  /**
   * @purpose Read the complete ordered commit range between two revisions from GitLab.
   * @param project Canonical project path.
   * @param from Earlier commit SHA.
   * @param to Current commit SHA.
   * @returns Provider commits and an explicit completeness classification.
   * @sideEffect Network: GET /projects/:id/repository/compare.
   */
  async compareMergeRequestCommits(
    project: string,
    from: string,
    to: string
  ): Promise<GitlabCommitComparison> {
    // #region START_COMPARE_MERGE_REQUEST_COMMITS
    try {
      // #region START_SHORT_CIRCUIT_IDENTICAL_REVISIONS
      if (from === to) {
        return { commits: [], complete: true, evidence: 'identical-revisions' };
      }
      // #endregion END_SHORT_CIRCUIT_IDENTICAL_REVISIONS
      const projectId = encodeURIComponent(project);
      const params = new URLSearchParams({ from, to, straight: 'true' });
      const data = (await this._request(
        `/projects/${projectId}/repository/compare?${params.toString()}`
      )) as {
        commits?: Array<{ id?: string }>;
        compare_timeout?: boolean;
        overflow?: boolean;
      };
      const commits = Array.isArray(data.commits)
        ? data.commits.map((commit) => commit.id ?? '').filter(Boolean)
        : [];
      const complete =
        Array.isArray(data.commits) && data.compare_timeout !== true && data.overflow !== true;
      return {
        commits,
        complete,
        evidence: complete
          ? 'gitlab-repository-compare-complete'
          : data.compare_timeout
            ? 'gitlab-repository-compare-timeout'
            : data.overflow
              ? 'gitlab-repository-compare-overflow'
              : 'gitlab-repository-compare-invalid-payload',
      };
    } catch (cause) {
      const error = new Error(
        `[VcsGitlabClient#compareMergeRequestCommits] Commit comparison failed for ${project}`,
        { cause }
      );
      logger.error(
        '[VcsGitlabClient#compareMergeRequestCommits] [reading → failed] Commit comparison failed',
        { error, project, from, to }
      );
      throw error;
    }
    // #endregion END_COMPARE_MERGE_REQUEST_COMMITS
  }

  /**
   * @purpose Probe both mutation and read fields required for native request-changes reconciliation.
   * @returns Whether the host schema exposes the complete native capability.
   * @sideEffect Network: GraphQL schema introspection only; no mutation.
   */
  async supportsRequestChanges(): Promise<boolean> {
    // #region START_PROBE_REQUEST_CHANGES_CAPABILITY
    try {
      const data = (await this._graphql(`query RequestChangesCapability {
        mutation: __type(name: "Mutation") { fields { name } }
        interaction: __type(name: "UserMergeRequestInteraction") { fields { name } }
      }`)) as {
        mutation?: { fields?: Array<{ name?: string }> } | null;
        interaction?: { fields?: Array<{ name?: string }> } | null;
      };
      const mutations = new Set((data.mutation?.fields ?? []).map((field) => field.name));
      const interaction = new Set((data.interaction?.fields ?? []).map((field) => field.name));
      return mutations.has('mergeRequestRequestChanges') && interaction.has('reviewState');
    } catch (cause) {
      const error = new Error('[VcsGitlabClient#supportsRequestChanges] Capability probe failed', {
        cause,
      });
      logger.error(
        '[VcsGitlabClient#supportsRequestChanges] [probing → failed] Capability probe failed',
        { error }
      );
      throw error;
    }
    // #endregion END_PROBE_REQUEST_CHANGES_CAPABILITY
  }

  /**
   * @purpose Apply the provider-native requested-changes reviewer state.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @throws {Error} When GitLab returns mutation-level errors.
   * @returns Completion after GitLab accepts the native state transition.
   * @sideEffect Network: GraphQL mergeRequestRequestChanges mutation.
   */
  async requestChanges(project: string, iid: string): Promise<void> {
    // #region START_REQUEST_CHANGES_MUTATION
    try {
      const data = (await this._graphql(
        `mutation RequestChanges($projectPath: ID!, $iid: String!) {
          mergeRequestRequestChanges(input: { projectPath: $projectPath, iid: $iid }) {
            errors
          }
        }`,
        { projectPath: project, iid }
      )) as { mergeRequestRequestChanges?: { errors?: string[] } | null };
      const errors = data.mergeRequestRequestChanges?.errors ?? [];
      // #region START_REJECT_REQUEST_CHANGES_PROVIDER_ERRORS
      if (errors.length > 0) {
        throw new Error(`[VcsGitlabClient#requestChanges] ${errors.join('; ')}`);
      }
      // #endregion END_REJECT_REQUEST_CHANGES_PROVIDER_ERRORS
    } catch (cause) {
      const error = new Error(
        `[VcsGitlabClient#requestChanges] Native request-changes failed for ${project}!${iid}`,
        { cause }
      );
      logger.error(
        '[VcsGitlabClient#requestChanges] [applying → failed] Native request-changes failed',
        { error, project, iid }
      );
      throw error;
    }
    // #endregion END_REQUEST_CHANGES_MUTATION
  }

  /**
   * @purpose Read the authenticated operator's native review state for one MR.
   * @param project Canonical project path.
   * @param iid MR internal ID.
   * @returns Uppercase GraphQL review state, or null when no interaction is exposed.
   * @sideEffect Network: two GraphQL reads; no mutation.
   */
  async getCurrentUserReviewState(project: string, iid: string): Promise<string | null> {
    // #region START_READ_CURRENT_USER_REVIEW_STATE
    try {
      const mrData = (await this._graphql(
        `query ReviewStateMr($projectPath: ID!, $iid: String!) {
          project(fullPath: $projectPath) { mergeRequest(iid: $iid) { id } }
        }`,
        { projectPath: project, iid }
      )) as { project?: { mergeRequest?: { id?: string } | null } | null };
      const id = mrData.project?.mergeRequest?.id;
      if (!id) return null;
      const interactionData = (await this._graphql(
        `query ReviewStateInteraction($id: MergeRequestID!) {
          currentUser { mergeRequestInteraction(id: $id) { reviewState } }
        }`,
        { id }
      )) as {
        currentUser?: { mergeRequestInteraction?: { reviewState?: string } | null } | null;
      };
      return interactionData.currentUser?.mergeRequestInteraction?.reviewState ?? null;
    } catch (cause) {
      const error = new Error(
        `[VcsGitlabClient#getCurrentUserReviewState] Reviewer-state read failed for ${project}!${iid}`,
        { cause }
      );
      logger.error(
        '[VcsGitlabClient#getCurrentUserReviewState] [reading → failed] Reviewer-state read failed',
        { error, project, iid }
      );
      throw error;
    }
    // #endregion END_READ_CURRENT_USER_REVIEW_STATE
  }
}
