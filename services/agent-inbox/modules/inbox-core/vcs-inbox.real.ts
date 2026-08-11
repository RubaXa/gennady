// @file: VcsInboxReal — production VCS integration through existing vcs-client (GitLab/GitHub).
// @consumers: inbox-api (production), CLI inbox commands
// @tasks: TSK-110, TSK-174

import {
  VcsInboxPort,
  type MrContext,
  type Discussion,
  type DiscussionOpts,
  type DiscussionNote,
} from './vcs-inbox.port.ts';
import { composeInboxError, type InboxErrorResponse } from './errors.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import { isValidMrUrl } from './vcs-validators.ts';
import { logger } from '#logger';
import type { VcsDiscussion, VcsPort } from '../inbox-vcs/vcs-port.ts';

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
  /** @purpose Canonical TSK-174 provider root shared with sync/effects in production */
  truth?: VcsPort;
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
  /** @purpose Optional canonical provider root eliminating a parallel production client. */
  protected _truth: VcsPort | undefined;

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
    this._truth = opts.truth;

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
   * @returns Configured VCS hostname.
   * @see {VcsInboxPort#getHost}
   */
  getHost(): string {
    return this._truth?.getHost() ?? this._host;
  }

  /** @purpose Cached authenticated login — resolved once per adapter lifetime. */
  protected _myLogin: string | null = null;

  /**
   * @returns Authenticated user login (cached); empty string when identity lookup fails.
   * @see {VcsInboxPort#getMyLogin}
   */
  override async getMyLogin(): Promise<string> {
    if (this._myLogin !== null) return this._myLogin;
    if (this._truth) {
      this._myLogin = await this._truth.getCurrentUserLogin();
      return this._myLogin;
    }
    try {
      const client = await this._resolveInboxClient();
      const me = await client.getCurrentUser();
      this._myLogin = me.login;
    } catch {
      this._myLogin = '';
    }
    return this._myLogin;
  }

  /**
   * @purpose Check that required credentials are available before making API calls.
   * @returns InboxErrorResponse or null if credentials are valid.
   */
  protected _verifyCredentials(): InboxErrorResponse | null {
    if (this._truth) return null;
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
    if (this._truth) return this._truth.getInbox();
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
    // #region START_VALIDATE_MR_URL — prevent SSRF: only allow URLs matching our VCS host
    if (!isValidMrUrl(webUrl, this._host)) {
      const error = composeInboxError(
        'INVALID_URL',
        `MR URL does not match configured VCS host: ${webUrl}`
      );
      logger.error('[VcsInboxReal#getMrContext] [idle → invalid_url]', { error });
      throw new Error(`[VcsInboxReal] INVALID_URL: ${webUrl}`, { cause: error });
    }
    // #endregion END_VALIDATE_MR_URL

    if (this._truth) {
      const ref = this._parseTruthReference(webUrl);
      const [detail, myLogin] = await Promise.all([
        this._truth.getMrDetail(ref.project, ref.iid),
        this.getMyLogin(),
      ]);
      return {
        project: ref.project,
        iid: ref.iid,
        webUrl: detail.webUrl || webUrl,
        title: detail.title,
        sourceBranch: detail.sourceBranch ?? '',
        targetBranch: detail.targetBranch ?? '',
        createdAt: detail.createdAt ?? '',
        updatedAt: detail.updatedAt,
        author: detail.author,
        reviewers: detail.reviewers,
        approvedBy: detail.approvedBy,
        description: detail.description,
        myRole:
          detail.author === myLogin
            ? 'author'
            : detail.reviewers.includes(myLogin)
              ? 'reviewer'
              : 'mentioned',
      };
    }

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
    // #region START_VALIDATE_MR_URL — prevent SSRF: only allow URLs matching our VCS host
    if (!isValidMrUrl(webUrl, this._host)) {
      const error = composeInboxError(
        'INVALID_URL',
        `MR URL does not match configured VCS host: ${webUrl}`
      );
      logger.error('[VcsInboxReal#getDiscussions] [idle → invalid_url]', { error });
      throw new Error(`[VcsInboxReal] INVALID_URL: ${webUrl}`, { cause: error });
    }
    // #endregion END_VALIDATE_MR_URL

    if (this._truth) {
      const ref = this._parseTruthReference(webUrl);
      const all: VcsDiscussion[] = [];
      let cursor: string | null = null;
      while (true) {
        const page = await this._truth.getDiscussions(ref.project, ref.iid, cursor);
        all.push(...page.discussions);
        if (!page.pageInfo.hasNextPage) break;
        if (!page.pageInfo.endCursor) {
          throw new Error('[VcsInboxReal#getDiscussions] Canonical pagination is incomplete');
        }
        cursor = page.pageInfo.endCursor;
      }
      const myLogin = opts?.my ? await this.getMyLogin() : '';
      return all
        .filter((discussion) => opts?.all || !discussion.resolved)
        .filter(
          (discussion) => !opts?.my || discussion.notes.some((note) => note.author === myLogin)
        )
        .map((discussion) => this._adaptTruthDiscussion(discussion));
    }

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
   * @purpose Parse one already host-validated GitLab MR URL for canonical truth calls.
   * @param webUrl Provider MR URL.
   * @throws {Error} When the URL lacks a GitLab MR path.
   * @returns Canonical project and IID.
   */
  protected _parseTruthReference(webUrl: string): { project: string; iid: string } {
    const match = new URL(webUrl).pathname.match(/^\/(.+?)\/-\/merge_requests\/(\d+)/);
    if (!match) throw new Error(`[VcsInboxReal#_parseTruthReference] Invalid MR URL: ${webUrl}`);
    return { project: match[1], iid: match[2] };
  }

  /**
   * @purpose Adapt canonical discussion truth to the temporary legacy consumer DTO.
   * @param discussion Canonical provider discussion.
   * @returns Temporary legacy discussion projection.
   */
  protected _adaptTruthDiscussion(discussion: VcsDiscussion): Discussion {
    const first = discussion.notes[0];
    return {
      id: discussion.id,
      shortId: discussion.id.slice(0, 8),
      author: first?.author ?? 'unknown',
      body: first?.body ?? '',
      ...(discussion.position
        ? { file: discussion.position.path, line: discussion.position.line }
        : {}),
      resolved: discussion.resolved,
      notes: discussion.notes.map((note) => ({
        id: note.id,
        author: note.author,
        username: note.author,
        body: note.body,
        createdAt: note.createdAt,
      })),
    };
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
