// @file: VcsInboxReal — production VCS integration through existing vcs-client (GitLab/GitHub).
// @consumers: inbox-api (production), CLI inbox commands
// @tasks: TSK-110

import {
  VcsInboxPort,
  type MrContext,
  type Discussion,
  type DiscussionOpts,
  type DiscussionNote,
} from './vcs-inbox.port.ts';
import { composeInboxError, type InboxErrorResponse } from './errors.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import { logger } from '#logger';

/**
 * @purpose Options for creating a VcsInboxReal instance.
 * @consumer VcsInboxReal constructor
 */
export type VcsInboxRealOptions = {
  /** @purpose VCS host (e.g. gitlab.example.com, github.com) */
  host?: string;
  /** @purpose Personal access token for VCS API */
  token?: string;
  /** @purpose Base URL override (e.g. https://gitlab.example.com/api/v4) */
  baseUrl?: string;
  /** @purpose VCS provider — auto-detected from host by default */
  provider?: 'gitlab' | 'github';
};

/**
 * @purpose Production VCS adapter wrapping the existing vcs-client layer.
 * @invariant No caching: every call is a fresh API request.
 * @invariant Normalized return types: raw API shapes are converted to port types.
 * @consumer DI container (production mode)
 */
export class VcsInboxReal extends VcsInboxPort {
  /** @purpose VCS host (e.g. gitlab.example.com). */
  protected _host: string;
  /** @purpose Personal access token for VCS API. */
  protected _token: string;
  /** @purpose Base URL for VCS API calls. */
  protected _baseUrl: string;
  /** @purpose VCS provider type. */
  protected _provider: 'gitlab' | 'github';

  /**
   * @purpose Create a Real adapter with VCS credentials.
   * @param [opts] Configuration — host, token, optional baseUrl and provider.
   * @throws If neither `token` nor env var is provided — constructor only stores values; network errors happen at call time.
   */
  constructor(opts: VcsInboxRealOptions = {}) {
    super();
    this._host = opts.host ?? '';
    this._token = opts.token ?? process.env.GITLAB_PERSONAL_TOKEN ?? '';
    this._provider = opts.provider ?? (/github/i.test(this._host) ? 'github' : 'gitlab');

    this._baseUrl = opts.baseUrl ?? '';
    if (!this._baseUrl) {
      if (this._provider === 'github') {
        this._baseUrl = 'https://api.github.com';
      } else {
        this._baseUrl = this._host ? `https://${this._host}/api/v4` : '';
      }
    }
  }

  /**
   * @purpose Check that required credentials are available before making API calls.
   * @returns InboxErrorResponse or null if credentials are valid.
   */
  protected _verifyCredentials(): InboxErrorResponse | null {
    if (!this._token) {
      return composeInboxError(
        'AUTH',
        'No VCS token available. Set GITLAB_PERSONAL_TOKEN or pass token to constructor.'
      );
    }
    if (!this._host && !this._baseUrl) {
      return composeInboxError('CONFIG', 'No VCS host configured. Pass host to constructor.');
    }
    return null;
  }

  /**
   * @purpose Provider-aware VCS client factory — lazy imports and creates the right client.
   * @returns VCS client with Inbox and getCurrentUser methods.
   */
  protected async _resolveInboxClient(): Promise<{
    Inbox: { getActionable(): Promise<VcsActionableMr[]> };
    getCurrentUser(): Promise<{ login: string }>;
  }> {
    if (this._provider === 'github') {
      throw new Error('[VcsInboxReal] GitHub provider is not yet implemented');
    }
    const { VcsGitlabClient } = await import('../../../vcs-client/gitlab/vcs-gitlab-client.ts');
    return new VcsGitlabClient({ token: this._token, baseUrl: this._baseUrl });
  }

  /**
   * @purpose Dynamically import the VCS context resolver and client factory.
   * @param webUrl MR web URL for context resolution.
   * @returns Resolved client with project, iid, and host.
   */
  protected async _resolveClientForMr(webUrl: string): Promise<{
    client: {
      MergeRequests: {
        getByIid(query: { project: string; iid: string }): Promise<unknown>;
      };
      MergeDiscussions?: {
        getAll(query: { project: string; iid: string | number }): Promise<unknown[]>;
        listDraftNotes(query: { project: string; iid: string | number }): Promise<unknown[]>;
      };
    };
    project: string;
    iid: string;
    host: string;
  }> {
    const { resolveVcsContext } =
      await import('../../../../cli/cmd/_shared/vcs-context-resolver.ts');
    const { createVcsClient } = await import('../../../../cli/cmd/_shared/create-vcs-client.ts');

    const context = await resolveVcsContext({ url: webUrl });
    const client = createVcsClient(context);

    return {
      client: client as unknown as {
        MergeRequests: { getByIid(query: { project: string; iid: string }): Promise<unknown> };
        MergeDiscussions?: {
          getAll(query: { project: string; iid: string | number }): Promise<unknown[]>;
          listDraftNotes(query: { project: string; iid: string | number }): Promise<unknown[]>;
        };
      },
      project: context.project,
      iid: String(context.iid),
      host: context.host,
    };
  }

  /**
   * @returns Deduplicated actionable MRs.
   * @see {VcsInboxPort#getActionable}
   */
  async getActionable(): Promise<VcsActionableMr[]> {
    const credErr = this._verifyCredentials();
    if (credErr) {
      logger.error('[VcsInboxReal#getActionable] [idle → failed]', { error: credErr });
      throw new Error(`[VcsInboxReal] ${credErr.error}: ${credErr.detail}`);
    }

    logger.debug('[VcsInboxReal#getActionable] [idle → requesting]');

    // #region START_GET_ACTIONABLE_API
    try {
      const client = await this._resolveInboxClient();
      const mrs = await client.Inbox!.getActionable();

      logger.info('[VcsInboxReal#getActionable] [requesting → done]', { count: mrs.length });
      return mrs;
    } catch (cause) {
      const msg = (cause as Error).message ?? 'Network failure';
      const code = this._classifyNetworkError(msg);
      const error = composeInboxError(code, msg, cause);
      logger.error('[VcsInboxReal#getActionable] [requesting → failed]', { error });
      throw new Error(`[VcsInboxReal] ${code}: ${msg}`, { cause });
    }
    // #endregion END_GET_ACTIONABLE_API
  }

  /**
   * @param webUrl MR web URL.
   * @returns MR metadata — project, title, branches, author, reviewers, etc.
   * @see {VcsInboxPort#getMrContext}
   */
  async getMrContext(webUrl: string): Promise<MrContext> {
    const credErr = this._verifyCredentials();
    if (credErr) {
      logger.error('[VcsInboxReal#getMrContext] [idle → failed]', { error: credErr });
      throw new Error(`[VcsInboxReal] ${credErr.error}: ${credErr.detail}`);
    }

    logger.debug('[VcsInboxReal#getMrContext] [idle → resolving]', { webUrl });

    // #region START_GET_MR_CONTEXT_API
    try {
      const { resolveVcsContext } =
        await import('../../../../cli/cmd/_shared/vcs-context-resolver.ts');
      const { createVcsClient } = await import('../../../../cli/cmd/_shared/create-vcs-client.ts');

      const context = await resolveVcsContext({ url: webUrl });
      const client = createVcsClient(context);
      const project = context.project;
      const iidStr = String(context.iid);

      // #region START_FETCH_MR_METADATA
      const mr = (await client.MergeRequests.getByIid({
        project,
        iid: iidStr,
      })) as Record<string, unknown> | null;

      if (!mr) {
        const error = composeInboxError('NOT_FOUND', `MR not found: ${webUrl}`);
        logger.error('[VcsInboxReal#getMrContext] [resolving → not_found]', { error });
        throw new Error(`[VcsInboxReal] NOT_FOUND: ${webUrl}`, {
          cause: new Error('MR not found'),
        });
      }
      // #endregion END_FETCH_MR_METADATA

      // #region START_DETERMINE_MY_ROLE — check currentUser against author/reviewers
      let myLogin = '';
      let myRole: string | null = null;

      try {
        const inboxClient = await this._resolveInboxClient();
        const me = await inboxClient.getCurrentUser();
        myLogin = me.login;

        const author = (mr.author as { username?: string } | null)?.username ?? '';
        const reviewers = ((mr.reviewers as Array<{ username?: string }> | null) ?? []).map(
          (r) => r.username ?? ''
        );

        if (myLogin === author) {
          myRole = 'author';
        } else if (reviewers.includes(myLogin)) {
          myRole = 'reviewer';
        } else {
          myRole = 'mentioned';
        }
      } catch {
        // best-effort: myLogin/mrRole left empty if identity lookup fails
      }
      // #endregion END_DETERMINE_MY_ROLE

      const result: MrContext = {
        project,
        iid: iidStr,
        webUrl: (mr.web_url as string) ?? webUrl,
        title: (mr.title as string) ?? '',
        sourceBranch: (mr.source_branch as string) ?? '',
        targetBranch: (mr.target_branch as string) ?? '',
        createdAt: (mr.created_at as string) ?? '',
        updatedAt: (mr.updated_at as string) ?? '',
        author: (mr.author as { username?: string } | null)?.username ?? '',
        reviewers: ((mr.reviewers as Array<{ username?: string }> | null) ?? []).map(
          (r) => r.username ?? ''
        ),
        approvedBy: (
          (mr.approved_by as Array<{ username?: string }> | null) ??
          (mr.approvedBy as Array<{ username?: string }> | null) ??
          []
        ).map((r) => r.username ?? ''),
        description: (mr.description as string) ?? '',
        myRole,
      };

      logger.info('[VcsInboxReal#getMrContext] [resolving → done]', {
        project,
        iid: iidStr,
        myRole,
      });
      return result;
    } catch (cause) {
      // re-throw our own errors as-is
      if ((cause as Error).message?.startsWith('[VcsInboxReal]')) throw cause;

      const msg = (cause as Error).message ?? 'Network failure';
      const code = this._classifyNetworkError(msg);
      const error = composeInboxError(code, msg, cause);
      logger.error('[VcsInboxReal#getMrContext] [resolving → failed]', { error });
      throw new Error(`[VcsInboxReal] ${code}: ${msg}`, { cause });
    }
    // #endregion END_GET_MR_CONTEXT_API
  }

  /**
   * @param webUrl MR web URL.
   * @param [opts] Filtering options: all (include resolved), my (my threads only), withDrafts.
   * @returns Normalized discussion threads.
   * @see {VcsInboxPort#getDiscussions}
   */
  async getDiscussions(webUrl: string, opts?: DiscussionOpts): Promise<Discussion[]> {
    const credErr = this._verifyCredentials();
    if (credErr) {
      logger.error('[VcsInboxReal#getDiscussions] [idle → failed]', { error: credErr });
      throw new Error(`[VcsInboxReal] ${credErr.error}: ${credErr.detail}`);
    }

    logger.debug('[VcsInboxReal#getDiscussions] [idle → requesting]', { webUrl, opts });

    // #region START_GET_DISCUSSIONS_API
    try {
      const { resolveVcsContext } =
        await import('../../../../cli/cmd/_shared/vcs-context-resolver.ts');
      const { createVcsClient } = await import('../../../../cli/cmd/_shared/create-vcs-client.ts');

      const context = await resolveVcsContext({ url: webUrl });
      const client = createVcsClient(context);
      const project = context.project;
      const iid = context.iid!;

      const rawDiscussions = (await client.MergeDiscussions!.getAll({
        project,
        iid,
      })) as Array<Record<string, unknown>>;

      let discussions = rawDiscussions;

      // #region START_APPLY_FILTERS
      if (!opts?.all) {
        discussions = discussions.filter((d) => {
          const firstNote = (d.notes as Array<Record<string, unknown>> | undefined)?.[0];
          return firstNote?.resolved !== true;
        });
      }

      if (opts?.my) {
        let myLogin = '';
        try {
          const inboxClient = await this._resolveInboxClient();
          const me = await inboxClient.getCurrentUser();
          myLogin = me.login;
        } catch {
          // best-effort: if identity lookup fails, return all discussions
        }

        if (myLogin) {
          discussions = discussions.filter((d) => {
            const notes = (d.notes as Array<Record<string, unknown>>) ?? [];
            return notes.some((n) => {
              const author = n.author as { username?: string } | undefined;
              return author?.username === myLogin;
            });
          });
        }
      }
      // #endregion END_APPLY_FILTERS

      const result: Discussion[] = discussions.map((d) => this._normalizeDiscussion(d));

      logger.info('[VcsInboxReal#getDiscussions] [requesting → done]', {
        total: rawDiscussions.length,
        filtered: result.length,
      });
      return result;
    } catch (cause) {
      if ((cause as Error).message?.startsWith('[VcsInboxReal]')) throw cause;

      const msg = (cause as Error).message ?? 'Network failure';
      const code = this._classifyNetworkError(msg);
      const error = composeInboxError(code, msg, cause);
      logger.error('[VcsInboxReal#getDiscussions] [requesting → failed]', { error });
      throw new Error(`[VcsInboxReal] ${code}: ${msg}`, { cause });
    }
    // #endregion END_GET_DISCUSSIONS_API
  }

  /**
   * @purpose Normalize a raw GitLab discussion object into the port's Discussion shape.
   * @param d Raw discussion from GitLab API.
   * @returns Normalized Discussion with notes flattened.
   */
  protected _normalizeDiscussion(d: Record<string, unknown>): Discussion {
    const id = String(d.id ?? '');
    const shortId = id.slice(0, 8);
    const notes = (d.notes as Array<Record<string, unknown>> | undefined) ?? [];
    const firstNote = notes[0];

    const author =
      (firstNote?.author as { name?: string; username?: string } | undefined)?.name ??
      (firstNote?.author as { name?: string; username?: string } | undefined)?.username ??
      'unknown';

    const body = String(firstNote?.body ?? '');

    const position = firstNote?.position as Record<string, unknown> | undefined;
    const file = position?.new_path as string | undefined;
    const line = position?.new_line as number | undefined;

    const resolved = (firstNote?.resolved as boolean) ?? null;

    const normalizedNotes: DiscussionNote[] = notes.map((n) => ({
      id: String(n.id ?? ''),
      author:
        (n.author as { name?: string })?.name ??
        (n.author as { username?: string })?.username ??
        'unknown',
      username: (n.author as { username?: string })?.username,
      body: String(n.body ?? ''),
      createdAt: String(n.created_at ?? ''),
    }));

    return { id, shortId, author, body, file, line, resolved, notes: normalizedNotes };
  }

  /**
   * @purpose Classify a network error message into a machine-readable InboxErrorCode.
   * @param message Error message from the API call.
   */
  protected _classifyNetworkError(message: string) {
    if (/rate.?limit|429/i.test(message)) return 'RATE_LIMIT' as const;
    if (/unauthorized|401|403|auth/i.test(message)) return 'AUTH' as const;
    if (/not.?found|404/i.test(message)) return 'NOT_FOUND' as const;
    return 'NETWORK' as const;
  }
}
