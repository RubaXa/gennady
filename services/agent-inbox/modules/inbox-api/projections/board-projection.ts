// @file: BoardProjection — projects SyncSnapshot[] + EventJournal → attention-grouped MrCard[].
//   Never reads executor in-memory state — only journal + sync snapshot (D-306).
// @consumers: board.router.ts, inbox-dashboard
// @tasks: TSK-158, TSK-162

import { logger } from '#logger';
import type { SyncSnapshot } from '../../inbox-vcs/sync.ts';
import type { AttentionState } from '../../inbox-vcs/attention.ts';
import type { EventJournal } from '../../inbox-core/event-journal.ts';
import type { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import type { MrCard, MrRef, MrWork, MrWorkState } from '../dto/mr-card.type.ts';
import type { SseHub } from '../sse-hub.ts';

/** @purpose Result shape returned by BoardProjection#project — consumed by GET /api/board. */
export type BoardProjectionResult = {
  /** @purpose MR refs grouped by attention state — keys in canonical order */
  groups: Record<AttentionState, MrRef[]>;
  /** @purpose Flat card list — every MR card in board order */
  cards: MrCard[];
  /** @purpose Sync health indicator — `degraded` when any snapshot is poll-only (estimated), `syncing` while the first truth load is still in flight */
  syncState: 'ok' | 'degraded' | 'syncing';
};

/**
 * @purpose Projects sync snapshots + journal into the attention-grouped board view (D-306).
 * @invariant Reads only SyncSnapshot[] and EventJournal — never touches executor/queue in-memory state.
 * @invariant Attention groups are closed (5 keys) — every MR lands in exactly one group.
 */
export class BoardProjection {
  /** @purpose Last sync snapshots — populated by caller after each twoTierSync */
  protected _snapshots: SyncSnapshot[];
  /** @purpose Event journal for unread counter computation */
  protected _journal: EventJournal;
  /** @purpose Registry access for lastReadAt lookups */
  protected _registry: InboxRegistryAccess;
  /** @purpose SSE hub for broadcasting board_hint on degraded sync — optional, null-safe */
  protected _hub: SseHub | null;
  /** @purpose Optional live truth loader, invoked by the HTTP board boundary before projection. */
  protected _loadSnapshots: (() => Promise<SyncSnapshot[]>) | null;
  /** @purpose In-flight refresh — single-flight so concurrent board polls never stack syncs. */
  protected _refreshing: Promise<void> | null;
  /** @purpose Completion time of the last successful truth load; null = never loaded. */
  protected _lastRefreshedAt: number | null;

  /**
   * @purpose Create a BoardProjection backed by snapshots, journal, registry, and optional SSE hub.
   * @param snapshots Sync snapshots from the latest SyncService#twoTierSync.
   * @param journal Event journal for unread/feed counters.
   * @param registry Registry access for per-MR lastReadAt timestamps.
   * @param [hub] Optional SseHub for broadcasting board_hint when sync degrades.
   * @param [loadSnapshots] Authoritative VCS snapshot loader for live board requests.
   */
  constructor(
    snapshots: SyncSnapshot[],
    journal: EventJournal,
    registry: InboxRegistryAccess,
    hub?: SseHub,
    loadSnapshots?: () => Promise<SyncSnapshot[]>
  ) {
    this._snapshots = snapshots;
    this._journal = journal;
    this._registry = registry;
    this._hub = hub ?? null;
    this._loadSnapshots = loadSnapshots ?? null;
    this._refreshing = null;
    // Constructor-seeded snapshots count as warm truth — only an empty cache starts cold
    // ('syncing'), e.g. the real-mode slow bootstrap path.
    this._lastRefreshedAt = snapshots.length > 0 ? Date.now() : null;
  }

  /**
   * @purpose Whether the cached truth is older than the given TTL (or never loaded).
   * @param ttlMs Max acceptable cache age in milliseconds.
   * @returns True when a background refresh should be triggered.
   */
  isStale(ttlMs: number): boolean {
    return this._lastRefreshedAt === null || Date.now() - this._lastRefreshedAt > ttlMs;
  }

  /**
   * @purpose Fire-and-forget truth refresh — failures are logged inside refreshFromTruth;
   *   the stale cache remains the serving authority.
   */
  refreshInBackground(): void {
    void this.refreshFromTruth().catch(() => {
      /* failure already logged by refreshFromTruth — stale cache stays authoritative */
    });
  }

  /**
   * @purpose Update the snapshot set — called after each sync cycle.
   * @param snapshots Fresh sync snapshots.
   */
  updateSnapshots(snapshots: SyncSnapshot[]): void {
    this._snapshots = snapshots;
    this._lastRefreshedAt = Date.now();
    logger.debug('[BoardProjection#updateSnapshots] [idle → updated]', {
      count: snapshots.length,
    });
  }

  /**
   * @purpose Refresh the board truth from its configured VCS source before an HTTP projection.
   * @invariant A configured loader replaces the whole snapshot set atomically; absent loader retains
   * constructor-provided snapshots for isolated and backward-compatible runtimes.
   * @throws {Error} When the authoritative sync source rejects.
   * @returns Completion after the current truth snapshot is installed.
   * @sideEffect Network: delegates to SyncService#twoTierSync through the composition root.
   */
  async refreshFromTruth(): Promise<void> {
    if (!this._loadSnapshots) return;
    if (!this._refreshing) {
      const run = this._doRefresh();
      this._refreshing = run;
      const clear = (): void => {
        if (this._refreshing === run) this._refreshing = null;
      };
      void run.then(clear, clear);
    }
    return this._refreshing;
  }

  /**
   * @purpose Execute one truth load and install its snapshots atomically.
   * @throws {Error} When the authoritative sync source rejects.
   * @returns Completion after the current truth snapshot is installed.
   * @sideEffect Network: delegates to SyncService#twoTierSync through the composition root.
   */
  protected async _doRefresh(): Promise<void> {
    logger.debug('[BoardProjection#refreshFromTruth] [stale → synchronizing]');
    try {
      const snapshots = await this._loadSnapshots!();
      this.updateSnapshots(snapshots);
      logger.info('[BoardProjection#refreshFromTruth] [synchronizing → current]', {
        count: snapshots.length,
      });
    } catch (cause) {
      const error = new Error('[BoardProjection#refreshFromTruth] VCS truth refresh failed', {
        cause,
      });
      logger.error('[BoardProjection#refreshFromTruth] [synchronizing → failed]', { error });
      throw error;
    }
  }

  /**
   * @purpose Project the current board view — attention groups, flat cards, sync health.
   * @returns BoardProjectionResult with grouped MrCard[] and syncState indicator.
   */
  project(): BoardProjectionResult {
    logger.debug('[BoardProjection#project] [idle → projecting]', {
      snapshotCount: this._snapshots.length,
    });

    // #region START_BUILD_CARDS — map each sync snapshot to MrCard, then group by attention
    const cards = this._snapshots.map((snap) => this._toCard(snap));
    const groups: Record<AttentionState, MrRef[]> = {
      '⏳': [],
      '💬': [],
      '🔀': [],
      '✅': [],
      '😴': [],
    };

    for (const card of cards) {
      groups[card.attention].push(card.ref);
    }
    // #endregion END_BUILD_CARDS

    // #region START_DETECT_DEGRADED — sync is degraded when any snapshot is poll-only (estimated=true); broadcast board_hint to all connected dashboards
    const hasEstimated = this._snapshots.some((s) => s.estimated);
    // Cold load in flight → 'syncing' so the SPA can show progress instead of an empty board.
    const syncState =
      this._lastRefreshedAt === null && this._refreshing !== null
        ? 'syncing'
        : hasEstimated
          ? 'degraded'
          : 'ok';

    if (syncState === 'degraded' && this._hub) {
      this._hub.broadcastAll({ type: 'board_hint', timestamp: new Date().toISOString() });
      logger.debug('[BoardProjection#project] [degraded → board_hint_sent]');
    }
    // #endregion END_DETECT_DEGRADED

    logger.info('[BoardProjection#project] [projecting → projected]', {
      cardCount: cards.length,
      syncState,
    });

    return { groups, cards, syncState };
  }

  /**
   * @purpose Convert one SyncSnapshot into an MrCard DTO — pure projection, no I/O.
   * @param snap Sync snapshot from the latest twoTierSync.
   * @returns Populated canonical MrCard with attention, counters, and durable work.
   */
  protected _toCard(snap: SyncSnapshot): MrCard {
    const mrKey = `${snap.mr.project}!${snap.mr.iid}`;
    const webUrl = snap.mr.webUrl;

    // #region START_RESOLVE_LAST_READ — read lastReadAt from registry; fallback to null
    let lastReadAt: string | null = null;
    try {
      const reg = this._registry.load();
      const entry = reg.entries[webUrl] as Record<string, unknown> | undefined;
      lastReadAt = (entry?.lastReadAt as string) ?? null;
    } catch {
      // registry unavailable — unread counter degrades to 0 rather than breaking the board
    }
    // #endregion END_RESOLVE_LAST_READ

    // #region START_COMPUTE_UNREAD — count journal entries newer than lastReadAt for this MR
    let unread = 0;
    if (lastReadAt) {
      const { entries } = this._journal.since(0);
      unread = entries.filter(
        (e) => e.mr === mrKey && e.ts > lastReadAt && e.kind !== 'system'
      ).length;
    }
    // #endregion END_COMPUTE_UNREAD

    const newCommits =
      snap.lastReviewedHeadSha && snap.headSha !== snap.lastReviewedHeadSha ? 1 : 0;

    return {
      ref: mrKey,
      title: snap.mr.title,
      author: snap.mr.author,
      myRole: snap.role,
      attention: snap.attention,
      counters: {
        approvals: `${snap.approvals.n}/${snap.approvals.m}`,
        reviewers: snap.reviewers.map((user) => ({
          user,
          voted: snap.approvals.approvedBy.includes(user),
        })),
        ci: snap.ci.status,
        threads: `${snap.threads.open}/${snap.threads.total}`,
        awaitingMe: snap.threads.awaitingMe,
        newCommits,
        unread,
      },
      work: this._workFor(mrKey),
    };
  }

  /**
   * @purpose Project the newest task status for one MR from durable journal events.
   * @param mrRef Composite MR reference.
   * @returns Canonical work object without consulting queue or executor memory.
   */
  protected _workFor(mrRef: string): MrWork {
    const entries = this._journal.since(0).entries.filter((entry) => entry.mr === mrRef);
    const createdLabels = new Map<string, string>();
    const startedAtByTask = new Map<string, string>();
    let latest: { taskId: string; state: MrWorkState; startedAt: string | null } | null = null;

    for (const entry of entries) {
      const payload = entry.payload ?? {};
      const taskId = typeof payload.taskId === 'string' ? payload.taskId : null;
      if (!taskId) continue;

      if (entry.kind === 'task_created' && typeof payload.type === 'string') {
        createdLabels.set(taskId, payload.type);
        continue;
      }

      if (entry.kind !== 'task_status' || typeof payload.status !== 'string') continue;
      if (!this._isWorkState(payload.status)) continue;
      if (payload.status === 'running') startedAtByTask.set(taskId, entry.ts);
      latest = {
        taskId,
        state: payload.status,
        startedAt: startedAtByTask.get(taskId) ?? null,
      };
    }

    if (!latest) {
      return { state: 'idle', label: 'Нет активной задачи', startedAt: null };
    }

    return {
      state: latest.state,
      label:
        createdLabels.get(latest.taskId) ??
        this._workLabel(latest.state as Exclude<MrWorkState, 'idle'>),
      taskId: latest.taskId,
      startedAt: latest.startedAt,
    };
  }

  /**
   * @purpose Narrow an event status to the closed public board work-state set.
   * @param status Candidate task status from a journal payload.
   * @returns Whether status is valid as a non-idle public work state.
   */
  protected _isWorkState(status: string): status is Exclude<MrWorkState, 'idle'> {
    return ['queued', 'running', 'waiting_dep', 'done', 'failed', 'cancelled'].includes(status);
  }

  /**
   * @purpose Supply a stable readable fallback when task_created was compacted or unavailable.
   * @param state Durable non-idle task state.
   * @returns Human-readable fallback label for the board card.
   */
  protected _workLabel(state: Exclude<MrWorkState, 'idle'>): string {
    return (
      {
        queued: 'Задача в очереди',
        running: 'Задача выполняется',
        waiting_dep: 'Ожидание зависимости',
        done: 'Задача завершена',
        failed: 'Задача завершилась ошибкой',
        cancelled: 'Задача отменена',
      } satisfies Record<Exclude<MrWorkState, 'idle'>, string>
    )[state];
  }
}
