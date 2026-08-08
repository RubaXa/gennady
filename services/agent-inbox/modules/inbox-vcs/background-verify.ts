// @file: BackgroundVerifier — periodic (~1/min) poll of active MRs: sha/new-discussion detection → gitlab_event journal entries.
// @consumers: inbox-queue (reads gitlab_event entries; BackgroundVerifier does NOT call queue directly)
// @tasks: TSK-158

import { logger } from '#logger';
import type { VcsPort } from './vcs-port.ts';
import type { EventJournal } from '../inbox-core/event-journal.ts';

/** @purpose Minimal state tracked per active MR for background verification. */
type TrackedMr = {
  /** @purpose MR web URL for registry lookup */
  webUrl: string;
  /** @purpose Project full path */
  project: string;
  /** @purpose MR internal ID */
  iid: string;
  /** @purpose Last known head SHA */
  lastKnownSha: string;
  /** @purpose Last known updatedAt timestamp */
  lastKnownUpdatedAt: string;
  /** @purpose IDs present at registration; later IDs are emitted as new_threads exactly once. */
  knownDiscussionIds?: string[];
};

/** @purpose Configuration for BackgroundVerifier interval and behaviour. */
export type BackgroundVerifierConfig = {
  /** @purpose Poll interval in milliseconds | @invariant Default: 60_000 (1 minute) */
  intervalMs: number;
};

/**
 * @purpose Periodically polls active MRs for changes: new commits (sha change) and new discussions.
 * @invariant Writes gitlab_event entries to the journal — does NOT call inbox-queue directly (queue reads events).
 * @invariant Interval can be started/stopped; cleanup via stop().
 * @consumer inbox-queue (via journal events, not direct coupling)
 */
export class BackgroundVerifier {
  /** @purpose VCS port for network calls */
  protected _vcs: VcsPort;
  /** @purpose Event journal for gitlab_event entries */
  protected _journal: EventJournal;
  /** @purpose Poll interval in milliseconds */
  protected _intervalMs: number;
  /** @purpose Active MRs being tracked */
  protected _tracked: Map<string, TrackedMr>;
  /** @purpose Interval handle for cleanup */
  protected _intervalHandle: ReturnType<typeof setInterval> | null;

  /**
   * @purpose Create a BackgroundVerifier bound to a VCS port and event journal.
   * @param vcs VCS port for network calls.
   * @param journal Event journal for gitlab_event entries.
   * @param [config] Interval configuration.
   */
  constructor(vcs: VcsPort, journal: EventJournal, config?: BackgroundVerifierConfig) {
    this._vcs = vcs;
    this._journal = journal;
    this._intervalMs = config?.intervalMs ?? 60_000;
    this._tracked = new Map();
    this._intervalHandle = null;
  }

  /**
   * @purpose Start periodic background verification.
   * @sideEffect Sets an interval timer; first poll runs immediately.
   */
  start(): void {
    if (this._intervalHandle !== null) {
      logger.debug('[BackgroundVerifier#start] [idle → skipped] Already running');
      return;
    }

    logger.info('[BackgroundVerifier#start] [idle → started]', { intervalMs: this._intervalMs });

    // #region START_POLL_LOOP — immediate first poll, then every intervalMs
    this._pollCycle();
    this._intervalHandle = setInterval(() => {
      this._pollCycle();
    }, this._intervalMs);
    // #endregion END_POLL_LOOP
  }

  /**
   * @purpose Stop background verification and clear the interval.
   */
  stop(): void {
    if (this._intervalHandle === null) return;
    clearInterval(this._intervalHandle);
    this._intervalHandle = null;
    logger.info('[BackgroundVerifier#stop] [started → stopped]');
  }

  /**
   * @purpose Register an MR for background tracking — called when an MR becomes active (gets queue/work).
   * @param mr MR identifier and initial state.
   */
  register(mr: TrackedMr): void {
    this._tracked.set(mr.webUrl, mr);
    logger.debug('[BackgroundVerifier#register] [idle → registered]', { webUrl: mr.webUrl });
  }

  /**
   * @purpose Run one verification cycle on demand, without exposing protected implementation details to callers/tests.
   * @returns Resolves after poll, commit and discussion detection complete.
   */
  async verifyOnce(): Promise<void> {
    await this._pollCycle();
  }

  /**
   * @purpose Remove an MR from background tracking — called when MR becomes inactive.
   * @param webUrl MR web URL to unregister.
   */
  unregister(webUrl: string): void {
    this._tracked.delete(webUrl);
    logger.debug('[BackgroundVerifier#unregister] [registered → unregistered]', { webUrl });
  }

  /**
   * @purpose Execute one poll cycle: fetch inbox, filter active MRs, detect sha/discussion changes.
   * @returns Resolves after poll cycle completes.
   * @sideEffect Network: poll tier call; journal: gitlab_event entries for detected changes.
   */
  protected async _pollCycle(): Promise<void> {
    logger.debug('[BackgroundVerifier#_pollCycle] [idle → polling]');

    // #region START_FETCH_INBOX — get current MR state from poll tier
    try {
      const mrs = await this._vcs.getInbox();

      for (const mr of mrs) {
        const tracked = this._tracked.get(mr.webUrl);
        if (!tracked) continue;

        await this._detectChanges(tracked, mr);
      }

      logger.debug('[BackgroundVerifier#_pollCycle] [polling → completed]', {
        active: this._tracked.size,
        checked: mrs.filter((m) => this._tracked.has(m.webUrl)).length,
      });
    } catch (cause) {
      const error = new Error('[BackgroundVerifier#_pollCycle] Poll cycle failed', { cause });
      logger.error('[BackgroundVerifier#_pollCycle] [polling → failed]', { error });
    }
    // #endregion END_FETCH_INBOX
  }

  /**
   * @purpose Detect SHA changes for a tracked MR — new commits → gitlab_event(new_commits).
   * @param tracked Tracked MR with last-known SHA and updatedAt.
   * @param mr Current MR snapshot from poll tier.
   * @returns Resolves after detection; writes journal entry if SHA changed.
   * @sideEffect Journal: gitlab_event(new_commits) when SHA changed.
   */
  protected async _detectChanges(
    tracked: TrackedMr,
    mr: { webUrl: string; updatedAt: string }
  ): Promise<void> {
    // #region START_DETECT_SHA_CHANGE — poll-tier sha check; use updatedAt as proxy when sha unavailable in poll
    if (mr.updatedAt === tracked.lastKnownUpdatedAt) return;

    try {
      const detail = await this._vcs.getMrDetail(tracked.project, tracked.iid);
      const newSha = detail.headSha;

      if (newSha && newSha !== tracked.lastKnownSha) {
        // #region START_JOURNAL_NEW_COMMITS — sha changed: write gitlab_event(new_commits) to journal
        await this._journal.append({
          ts: new Date().toISOString(),
          mr: tracked.webUrl,
          kind: 'gitlab_event',
          actor: 'background-verify',
          payload: {
            event: 'new_commits',
            fromSha: tracked.lastKnownSha,
            toSha: newSha,
          },
        });
        logger.info('[BackgroundVerifier#_detectShaChange] [detecting → new_commits]', {
          webUrl: tracked.webUrl,
          fromSha: tracked.lastKnownSha,
          toSha: newSha,
        });
        // #endregion END_JOURNAL_NEW_COMMITS

        tracked.lastKnownSha = newSha;
      }
      const discussions = await this._vcs.getDiscussions(tracked.project, tracked.iid);
      const known = new Set(tracked.knownDiscussionIds ?? []);
      const newDiscussionIds = discussions.discussions
        .filter((discussion) => !known.has(discussion.id))
        .map((discussion) => discussion.id);
      if (newDiscussionIds.length > 0) {
        await this._journal.append({
          ts: new Date().toISOString(),
          mr: tracked.webUrl,
          kind: 'gitlab_event',
          actor: 'background-verify',
          payload: { event: 'new_threads', discussionIds: newDiscussionIds },
        });
        logger.info('[BackgroundVerifier#_detectChanges] [detecting → new_threads]', {
          webUrl: tracked.webUrl,
          count: newDiscussionIds.length,
        });
      }
      tracked.knownDiscussionIds = discussions.discussions.map((discussion) => discussion.id);
      tracked.lastKnownUpdatedAt = mr.updatedAt;
    } catch (cause) {
      logger.debug(
        '[BackgroundVerifier#_detectShaChange] [detecting → skipped] Detail fetch failed',
        {
          webUrl: tracked.webUrl,
          error: (cause as Error).message,
        }
      );
    }
    // #endregion END_DETECT_SHA_CHANGE
  }
}
