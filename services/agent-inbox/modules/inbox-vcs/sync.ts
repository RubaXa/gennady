// @file: SyncService — two-tier sync orchestrator: poll all MRs, detail for active/visible, derive myRole/attention/stage, produce SyncSnapshot.
// @consumers: inbox-queue, inbox-api
// @tasks: TSK-158, TSK-173

import { logger } from '#logger';
import { randomUUID } from 'node:crypto';
import type { VcsPort, VcsDiscussion } from './vcs-port.ts';
import type { InboxRegistryAccess } from '../inbox-core/inbox-registry.ts';
import type { EventJournal, JournalPort } from '../inbox-core/event-journal.ts';
import type { ClockPort } from '../inbox-core/ports/clock.port.ts';
import { ReviewConfig } from '../inbox-core/review-config.ts';
import { ReviewState } from '../inbox-core/state/review-state.ts';
import { ReviewEvent } from '../inbox-core/types/review-event.type.ts';
import {
  deriveAttention,
  type AttentionState,
  type AttentionResult,
  type AttentionThread,
} from './attention.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';

/** @purpose Internal stage mapping: review_needed | reply_needed | awaiting_reply | idle — computed from discussions. */
export type MrStage = 'review_needed' | 'reply_needed' | 'awaiting_reply' | 'idle';

/** @purpose Dependencies controlling retry timing for the sync boundary. */
export type SyncServiceConfig = {
  /**
   * @purpose Delay function used after GitLab explicitly asks the client to retry later.
   * @param delayMs Server-directed wait duration in milliseconds.
   * @returns Completion after the requested delay.
   */
  sleep?: (delayMs: number) => Promise<void>;
  /** @purpose Canonical journal, policy and clock used by the real review-state runtime path. */
  canonicalReview?: {
    journal: JournalPort;
    config: ReviewConfig;
    clock: ClockPort;
  };
};

/** @purpose Sync snapshot — DTO for inbox-api, board projection, and seed fixtures. */
export type SyncSnapshot = {
  /** @purpose Original actionable MR from poll tier */
  mr: VcsActionableMr;
  /** @purpose My role relative to this MR */
  role: string | null;
  /** @purpose Computed attention state (emoji) */
  attention: AttentionState;
  /** @purpose Internal stage (not exposed in UI directly) */
  stage: MrStage;
  /** @purpose Approval state: n approved out of m required, plus approver list */
  approvals: { n: number; m: number; approvedBy: string[] };
  /** @purpose Assigned reviewer usernames */
  reviewers: string[];
  /** @purpose CI pipeline status snapshot */
  ci: { status: string | null };
  /** @purpose Discussion thread counters */
  threads: { open: number; total: number; awaitingMe: number };
  /** @purpose Current head commit SHA */
  headSha: string;
  /** @purpose Last head SHA I reviewed (null = never) */
  lastReviewedHeadSha: string | null;
  /** @purpose ISO timestamp of the MR update */
  updatedAt: string;
  /** @purpose Whether attention was computed from poll-only fields */
  estimated: boolean;
  /** @purpose Whether the detail tier failed and this active snapshot fell back to partial data */
  degraded?: boolean;
};

/** @purpose Poll-tier fields extracted from VcsActionableMr — used before detail tier is available. */
type PollFields = {
  /** @purpose MR web URL */
  webUrl: string;
  /** @purpose Project full path */
  project: string;
  /** @purpose MR internal ID */
  iid: string;
  /** @purpose MR head SHA (from diffRefs or sha field) */
  headSha: string;
  /** @purpose My role from VCS (reviewer/author; mentioned is provisional) */
  myRole: 'reviewer' | 'author' | 'mentioned' | null;
  /** @purpose Approved by usernames */
  approvedBy: string[];
  /** @purpose Approval count out of required */
  approvals: { n: number; m: number };
  /** @purpose CI pipeline status string */
  pipelineStatus: string | null;
  /** @purpose Whether MR is a draft */
  draft: boolean;
  /** @purpose ISO updatedAt timestamp */
  updatedAt: string;
};

/**
 * @purpose Orchestrates two-tier sync: poll (all MRs, cheap) → detail (active/visible, richer).
 * @invariant Poll tier provides myRole, approvals, CI, sha; detail tier adds discussions and refines attention.
 * @invariant lastReviewedHeadSha read from InboxRegistryAccess; stage is internal, not exposed in UI.
 * @consumer inbox-queue
 */
export class SyncService {
  /** @purpose VCS port for network calls */
  protected _vcs: VcsPort;
  /** @purpose Registry access for lastReviewedHeadSha */
  protected _registry: InboxRegistryAccess;
  /** @purpose Event journal for sync event logging */
  protected _journal: EventJournal;
  /** @purpose Authenticated user login — resolved lazily */
  protected _myLogin: string | null;
  /** @purpose Injectable delay keeps Retry-After behaviour observable without real-time test waits. */
  protected _sleep: (delayMs: number) => Promise<void>;
  /** @purpose Optional canonical state runtime enabled by the production composition root. */
  protected _canonicalReview: SyncServiceConfig['canonicalReview'];
  /** @purpose Per-MR cancellation handles for superseded quiet/debounce deadlines. */
  protected _verificationTimers = new Map<string, { cancel(): void }>();

  /**
   * @purpose Create a SyncService bound to a VCS port, registry, and journal.
   * @param vcs VCS port for network calls.
   * @param registry Registry for lastReviewedHeadSha lookups.
   * @param journal Event journal for gitlab_event entries.
   * @param [config] Optional retry-timing dependencies.
   */
  constructor(
    vcs: VcsPort,
    registry: InboxRegistryAccess,
    journal: EventJournal,
    config?: SyncServiceConfig
  ) {
    this._vcs = vcs;
    this._registry = registry;
    this._journal = journal;
    this._myLogin = null;
    this._sleep =
      config?.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this._canonicalReview = config?.canonicalReview;
  }

  /**
   * @purpose Run a full two-tier sync: poll all actionable MRs, then detail-sync active ones.
   * @returns Sync snapshots for all MRs — poll-only for inactive, full for active.
   * @sideEffect Network: poll (1 GraphQL call) + N detail calls for active MRs.
   */
  async twoTierSync(): Promise<SyncSnapshot[]> {
    logger.debug('[SyncService#twoTierSync] [idle → polling]');

    // #region START_POLL_TIER — single cheap GraphQL call for all actionable MRs
    const mrs = await this._getInboxWithRetryAfter();
    logger.info('[SyncService#twoTierSync] [polling → poll_fetched]', { count: mrs.length });

    await this._resolveMyLogin();

    const snapshots: SyncSnapshot[] = [];
    for (const mr of mrs) {
      const poll = this._extractPollFields(mr);
      const lastReviewedHeadSha = this._readLastReviewedHeadSha(poll.webUrl);
      const isActive = this._isActive(poll);

      if (!isActive) {
        // #region START_POLL_ONLY_SNAPSHOT — inactive MR: attention from poll fields only (estimated)
        const attention = deriveAttention({
          myRole: poll.myRole,
          myLogin: this._myLogin ?? '',
          lastReviewedHeadSha,
          headSha: poll.headSha,
          threads: [],
          approvals: {
            n: poll.approvals.n,
            m: poll.approvals.m,
            approvedByMe: this._myLogin ? poll.approvedBy.includes(this._myLogin) : false,
          },
          estimated: true,
        });
        snapshots.push(this._buildSnapshot(mr, poll, attention, lastReviewedHeadSha, []));
        // #endregion END_POLL_ONLY_SNAPSHOT
        continue;
      }

      // #region START_DETAIL_TIER — active MR: fetch discussions and detail for full attention
      let enrichedPoll = { ...poll };
      let detailFailed = false;
      try {
        const detail = await this._vcs.getMrDetail(poll.project, poll.iid);
        enrichedPoll = {
          ...poll,
          headSha: detail.headSha || poll.headSha,
          pipelineStatus: detail.pipelineStatus ?? poll.pipelineStatus,
          approvals: {
            n: detail.approvedBy?.length ?? poll.approvals.n,
            m: detail.approvalsRequired ?? poll.approvals.m,
          },
        };
      } catch {
        detailFailed = true;
        logger.debug(
          '[SyncService#twoTierSync] [detail_fetch → skipped] getMrDetail failed, using poll-only',
          {
            mr: poll.webUrl,
          }
        );
      }

      const discussions = await this._fetchAllDiscussions(enrichedPoll.project, enrichedPoll.iid);
      const attention = this._computeFullAttention(enrichedPoll, lastReviewedHeadSha, discussions);
      const snapshot = this._buildSnapshot(
        mr,
        enrichedPoll,
        attention,
        lastReviewedHeadSha,
        discussions
      );
      // Inactivity-driven poll-only snapshots are normal operation; only a failed detail
      // fetch on an ACTIVE MR marks the board degraded.
      if (detailFailed) snapshot.degraded = true;
      snapshots.push(snapshot);
      // #endregion END_DETAIL_TIER
    }
    // #endregion END_POLL_TIER

    if (this._canonicalReview) await this._recordCanonicalReviewObservations(snapshots);

    logger.info('[SyncService#twoTierSync] [polling → completed]', {
      total: snapshots.length,
      active: snapshots.filter((s) => !s.estimated).length,
      estimated: snapshots.filter((s) => s.estimated).length,
    });
    return snapshots;
  }

  /**
   * @purpose Durably ingest real sync snapshots into journal-backed ReviewState and re-arm ClockPort timers.
   * @param snapshots Settled real GitLab observations from this sync pass.
   * @returns Completion after every observation is durable and its timer is armed.
   * @sideEffect Appends canonical events and schedules timer-driven verification requests.
   */
  protected async _recordCanonicalReviewObservations(snapshots: SyncSnapshot[]): Promise<void> {
    const runtime = this._canonicalReview!;
    // #region START_INGEST_REAL_CANONICAL_REVIEW_STATE
    for (const snapshot of snapshots) {
      const occurredAt = snapshot.updatedAt || runtime.clock.now();
      const participation = {
        author: snapshot.mr.author === this._myLogin || snapshot.mr.role === 'author',
        reviewer:
          snapshot.reviewers.includes(this._myLogin ?? '') || snapshot.mr.role === 'reviewer',
        assignee: false,
        mentioned: snapshot.mr.role === 'mentioned' || snapshot.mr.directlyAddressed,
        commented: snapshot.threads.total > 0,
        approved: snapshot.approvals.approvedBy.includes(this._myLogin ?? ''),
        estimated: snapshot.estimated ? ['assignee', 'commented'] : ['assignee'],
      };
      const event = ReviewEvent.validate({
        version: 1,
        id: `sync-${randomUUID()}`,
        mr: { project: snapshot.mr.project, iid: snapshot.mr.iid },
        kind: 'mr_observed',
        actor: { kind: 'system', id: 'gitlab-sync' },
        occurredAt,
        payload: {
          state:
            snapshot.mr.state === 'opened'
              ? 'open'
              : snapshot.mr.state === 'merged'
                ? 'merged'
                : 'closed',
          participation,
          ...(snapshot.headSha ? { headSha: snapshot.headSha } : {}),
          descriptionRevision: snapshot.mr.description,
          approvals: snapshot.approvals,
          threads: snapshot.threads,
        },
      });
      const events = runtime.journal
        .replayReviewEvents()
        .filter((candidate) => candidate.identifyMr() === event.identifyMr());
      const latestObserved = [...events]
        .reverse()
        .find((candidate) => candidate.kind === 'mr_observed');
      const observationChanged =
        !latestObserved ||
        latestObserved.occurredAt !== event.occurredAt ||
        JSON.stringify(latestObserved.payload) !== JSON.stringify(event.payload);
      if (observationChanged) {
        await runtime.journal.appendReviewEvent(event);
        events.push(event);
      }
      const state = ReviewState.fold(events, runtime.config);
      const deadline = state.changeBatch().nextVerificationAt();
      this._verificationTimers.get(event.identifyMr())?.cancel();
      if (!deadline) continue;
      const handle = runtime.clock.schedule(deadline, () => {
        const request = ReviewEvent.validate({
          version: 1,
          id: `timer-${randomUUID()}`,
          mr: event.mr,
          kind: 'verification_requested',
          actor: { kind: 'system', id: runtime.clock.identity },
          occurredAt: runtime.clock.now(),
          payload: { mode: 'timer' },
        });
        void runtime.journal.appendReviewEvent(request).catch((cause: unknown) => {
          logger.error('[SyncService#_recordCanonicalReviewObservations] [timer → failed]', {
            error: new Error('Canonical timer request append failed', { cause }),
            mr: event.identifyMr(),
          });
        });
      });
      this._verificationTimers.set(event.identifyMr(), handle);
    }
    // #endregion END_INGEST_REAL_CANONICAL_REVIEW_STATE
  }

  /**
   * @purpose Poll GitLab, respecting its explicit Retry-After instruction once before surfacing an error.
   * @invariant Only a 429-style error carrying a positive retryAfter value is retried; unrelated failures retain
   *   their original semantics.
   * @returns Actionable MRs from the successful poll attempt.
   * @sideEffect May wait for GitLab's requested backoff period before one retry.
   */
  protected async _getInboxWithRetryAfter(): ReturnType<VcsPort['getInbox']> {
    try {
      return await this._vcs.getInbox();
    } catch (cause) {
      const retryAfterMs = this._readRetryAfterMs(cause);
      if (retryAfterMs === null) throw cause;

      logger.warn('[SyncService#twoTierSync] [polling → rate_limited]', { retryAfterMs });
      await this._sleep(retryAfterMs);
      logger.info('[SyncService#twoTierSync] [rate_limited → retrying]', { retryAfterMs });
      return this._vcs.getInbox();
    }
  }

  /**
   * @purpose Normalize GitLab's Retry-After metadata from a rate-limit failure.
   * @param cause Rejection received from the VCS adapter.
   * @returns Delay in milliseconds, or null when the failure is not a retryable 429 response.
   */
  protected _readRetryAfterMs(cause: unknown): number | null {
    if (!(cause instanceof Error) || !/\b429\b/.test(cause.message)) return null;
    const retryAfter = (cause as Error & { retryAfter?: unknown }).retryAfter;
    const seconds = typeof retryAfter === 'number' ? retryAfter : Number(retryAfter);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
  }

  /**
   * @purpose Resolve the authenticated user's login — cached after first call.
   * @returns Resolved login string; empty on failure.
   * @sideEffect Network: calls VCS identity endpoint via getCurrentUserLogin.
   */
  protected async _resolveMyLogin(): Promise<void> {
    if (this._myLogin !== null) return;
    try {
      this._myLogin = await this._vcs.getCurrentUserLogin();
    } catch {
      this._myLogin = '';
    }
  }

  /**
   * @purpose Fetch all discussion pages for an MR via cursor-based pagination.
   * @invariant Iterates getDiscussions pages until hasNextPage === false, collecting all threads.
   * @param project Project full path.
   * @param iid MR internal ID.
   * @returns Complete list of discussion threads across all pages.
   * @sideEffect Network: N calls to getDiscussions, one per page.
   */
  protected async _fetchAllDiscussions(project: string, iid: string): Promise<VcsDiscussion[]> {
    // #region START_FETCH_ALL_DISCUSSIONS — paginate through all pages, collecting threads
    const all: VcsDiscussion[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const page = await this._vcs.getDiscussions(project, iid, cursor);
      all.push(...page.discussions);
      hasNextPage = page.pageInfo.hasNextPage;
      cursor = page.pageInfo.endCursor;
    }

    return all;
    // #endregion END_FETCH_ALL_DISCUSSIONS
  }

  /**
   * @purpose Extract poll-tier fields from a VcsActionableMr — all fields available without detail tier.
   * @param mr Actionable MR from poll tier.
   * @returns Normalized poll-tier field set.
   */
  protected _extractPollFields(mr: VcsActionableMr): PollFields {
    return {
      webUrl: mr.webUrl,
      project: mr.project,
      iid: mr.iid,
      headSha: mr.headSha ?? '',
      myRole: mr.role,
      approvedBy: mr.approvedBy,
      approvals: { n: mr.approvedBy.length, m: mr.approvalsRequired ?? 0 },
      pipelineStatus: mr.pipelineStatus ?? null,
      draft: mr.draft,
      updatedAt: mr.updatedAt,
    };
  }

  /**
   * @purpose Check whether an MR is active — has a non-null role and is in opened state.
   * @param poll Poll-tier fields for the MR.
   * @returns True when the MR has a defined role.
   */
  protected _isActive(poll: PollFields): boolean {
    return poll.myRole !== null;
  }

  /**
   * @purpose Read lastReviewedHeadSha from the registry for a given MR webUrl.
   * @param webUrl MR web URL key in the registry.
   * @returns Last reviewed head SHA; null when never reviewed.
   */
  protected _readLastReviewedHeadSha(webUrl: string): string | null {
    // #region START_READ_LAST_REVIEWED_SHA — registry stores lastReviewedHeadSha per MR; null if never reviewed
    const registry = this._registry.load();
    const entry = registry.entries[webUrl];
    return (entry as { lastReviewedHeadSha?: string } | undefined)?.lastReviewedHeadSha ?? null;
    // #endregion END_READ_LAST_REVIEWED_SHA
  }

  /**
   * @purpose Compute full attention from poll fields + detail-tier discussions.
   * @param poll Poll-tier fields for the MR.
   * @param lastReviewedHeadSha Last reviewed head SHA from registry.
   * @param discussions Full discussion list from detail tier.
   * @returns Computed attention state with estimated flag.
   */
  protected _computeFullAttention(
    poll: PollFields,
    lastReviewedHeadSha: string | null,
    discussions: VcsDiscussion[]
  ): AttentionResult {
    // #region START_COMPUTE_FULL_ATTENTION
    const attentionThreads: AttentionThread[] = discussions.map((d) => {
      const myNotes = d.notes.filter((n) => n.author === this._myLogin && !n.system);
      const hasResponseAfterMe =
        myNotes.length > 0 &&
        d.notes.some(
          (n) =>
            n.author !== this._myLogin &&
            !n.system &&
            myNotes.every((mn) => new Date(n.createdAt) > new Date(mn.createdAt))
        );
      const awaitingMyResponse =
        !d.resolved &&
        d.notes.some((n) => n.author !== this._myLogin && !n.system) &&
        !d.notes.some((n) => n.author === this._myLogin && !n.system);

      return {
        resolved: d.resolved,
        author: d.notes[0]?.author ?? '',
        hasResponseAfterMe,
        awaitingMyResponse,
      };
    });

    return deriveAttention({
      myRole: poll.myRole,
      myLogin: this._myLogin ?? '',
      lastReviewedHeadSha,
      headSha: poll.headSha,
      threads: attentionThreads,
      approvals: {
        n: poll.approvedBy.length,
        m: poll.approvals.m,
        approvedByMe: this._myLogin ? poll.approvedBy.includes(this._myLogin) : false,
      },
      estimated: false,
    });
    // #endregion END_COMPUTE_FULL_ATTENTION
  }

  /**
   * @purpose Compute internal stage from discussions and attention — for queue decision-making.
   * @param attention Computed attention state.
   * @param discussions Full discussion list from detail tier.
   * @returns Internal stage for queue task routing.
   */
  computeStage(attention: AttentionState, discussions: VcsDiscussion[]): MrStage {
    // #region START_COMPUTE_STAGE
    if (attention === '⏳') return 'review_needed';
    if (attention === '💬') return 'reply_needed';
    const hasOpenThreads = discussions.some((d) => !d.resolved);
    if (hasOpenThreads) return 'awaiting_reply';
    return 'idle';
    // #endregion END_COMPUTE_STAGE
  }

  /**
   * @purpose Build a SyncSnapshot from poll fields, attention result, and discussions.
   * @param mr Original actionable MR.
   * @param poll Poll-tier extracted fields.
   * @param attention Computed attention result.
   * @param lastReviewedHeadSha Last reviewed head SHA.
   * @param discussions Full discussion list.
   * @returns Complete sync snapshot for DTO consumers.
   */
  protected _buildSnapshot(
    mr: VcsActionableMr,
    poll: PollFields,
    attention: AttentionResult,
    lastReviewedHeadSha: string | null,
    discussions: VcsDiscussion[]
  ): SyncSnapshot {
    const openThreads = discussions.filter((d) => !d.resolved).length;
    const awaitingMe = discussions.filter((d) => {
      if (d.resolved) return false;
      return (
        d.notes.some((n) => n.author !== this._myLogin && !n.system) &&
        !d.notes.some((n) => n.author === this._myLogin && !n.system)
      );
    }).length;

    return {
      mr,
      role: poll.myRole,
      attention: attention.state,
      stage: this.computeStage(attention.state, discussions),
      approvals: {
        n: poll.approvedBy.length,
        m: poll.approvals.m,
        approvedBy: poll.approvedBy,
      },
      reviewers: mr.reviewers,
      ci: { status: poll.pipelineStatus },
      threads: {
        open: openThreads,
        total: discussions.length,
        awaitingMe,
      },
      headSha: poll.headSha,
      lastReviewedHeadSha,
      updatedAt: poll.updatedAt,
      estimated: attention.estimated,
    };
  }
}
