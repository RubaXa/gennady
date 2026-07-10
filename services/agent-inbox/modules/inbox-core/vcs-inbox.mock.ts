// @file: VcsInboxMock — deterministic mock implementation of VcsInboxPort for dev/e2e.
// @consumers: inbox-api (DI), inbox-dashboard (dev), e2e tests
// @tasks: TSK-110

import {
  VcsInboxPort,
  type MrContext,
  type Discussion,
  type DiscussionOpts,
} from './vcs-inbox.port.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';

/**
 * @purpose Deterministic in-memory VCS adapter for development and e2e testing.
 * @invariant Pure data store: no network, no filesystem, no side effects.
 * @invariant Returns exactly the data seeded — no transformations, no filtering.
 * @consumer DI container (replaces VcsInboxReal in dev/e2e)
 */
export class VcsInboxMock extends VcsInboxPort {
  /** @purpose Seeded MRs to return from getActionable(). */
  protected _mrs: VcsActionableMr[];
  /** @purpose Seeded MR contexts keyed by webUrl. */
  protected _contexts: Map<string, MrContext>;
  /** @purpose Seeded discussions keyed by webUrl. */
  protected _discussions: Map<string, Discussion[]>;

  /**
   * @purpose Create an empty mock — call seed() to populate before use.
   */
  constructor() {
    super();
    this._mrs = [];
    this._contexts = new Map();
    this._discussions = new Map();
  }

  /**
   * @purpose Pre-load mock data: actionable MRs and per-MR contexts.
   * @param mrs Actionable MRs to return from getActionable().
   * @param [contexts] Optional map of webUrl → MrContext for getMrContext().
   * @param [discussions] Optional map of webUrl → Discussion[] for getDiscussions().
   * @sideEffect Replaces all previously seeded data.
   */
  seed(
    mrs: VcsActionableMr[],
    contexts?: Record<string, MrContext>,
    discussions?: Record<string, Discussion[]>
  ): void {
    this._mrs = [...mrs];
    this._contexts.clear();
    this._discussions.clear();

    if (contexts) {
      for (const [url, ctx] of Object.entries(contexts)) {
        this._contexts.set(url, ctx);
      }
    }

    if (discussions) {
      for (const [url, disc] of Object.entries(discussions)) {
        this._discussions.set(url, disc);
      }
    }
  }

  /**
   * @returns Deduplicated actionable MRs.
   * @see {VcsInboxPort#getActionable}
   */
  async getActionable(): Promise<VcsActionableMr[]> {
    return [...this._mrs];
  }

  /**
   * @param webUrl MR web URL.
   * @returns MR metadata.
   * @see {VcsInboxPort#getMrContext}
   */
  async getMrContext(webUrl: string): Promise<MrContext> {
    const ctx = this._contexts.get(webUrl);
    if (!ctx) {
      // #region START_MOCK_DEFAULT_CONTEXT — return a minimal synthetic context when not seeded
      const parsed = this._parseMrUrl(webUrl);
      return {
        project: parsed.project,
        iid: parsed.iid,
        webUrl,
        title: `Mock MR ${parsed.iid}`,
        sourceBranch: `feature/mock-${parsed.iid}`,
        targetBranch: 'master',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'mock-user',
        reviewers: [],
        approvedBy: [],
        description: 'Mock MR description',
        myRole: 'reviewer',
      };
      // #endregion END_MOCK_DEFAULT_CONTEXT
    }
    return ctx;
  }

  /**
   * @param webUrl MR web URL.
   * @param [_opts] Filtering options (unused in mock).
   * @returns Normalized discussion threads.
   * @see {VcsInboxPort#getDiscussions}
   */
  async getDiscussions(webUrl: string, _opts?: DiscussionOpts): Promise<Discussion[]> {
    const discussions = this._discussions.get(webUrl);
    return discussions ? [...discussions] : [];
  }

  /**
   * @purpose Extract project path and MR iid from a GitLab web URL.
   * @invariant Handles standard GitLab MR URL format: https://<host>/<project>/-/merge_requests/<iid>
   * @param webUrl Full MR web URL.
   * @returns Extracted project and iid, or defaults on parse failure.
   */
  protected _parseMrUrl(webUrl: string): { project: string; iid: string } {
    try {
      const u = new URL(webUrl);
      const match = u.pathname.match(/^\/(.+?)\/-\/merge_requests\/(\d+)/);
      if (match) {
        return { project: match[1], iid: match[2] };
      }
    } catch {
      // fall through to defaults
    }
    return { project: 'unknown/project', iid: '0' };
  }
}
