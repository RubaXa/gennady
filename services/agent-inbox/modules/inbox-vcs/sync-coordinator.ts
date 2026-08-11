// @file: VcsSyncCoordinator — inclusive discovery, complete polling, ordered journal append, and cursor ownership.
// @consumers: inbox boot, queue verification triggers
// @tasks: TSK-174

import { logger } from '#logger';
import type { JournalPort } from '../inbox-core/event-journal.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import { VcsEventNormalizer } from './event-normalizer.ts';
import type { VcsPort, VcsSnapshot } from './vcs-port.ts';

const ACTIVE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

/** @purpose Canonical MR identity selected for refresh. */
export type VcsSyncTarget = {
  /** @purpose Canonical project path */
  project: string;
  /** @purpose MR internal ID */
  iid: string;
};

/** @purpose One poll decision preserving cursor and effect safety evidence. */
export type VcsSyncResult = {
  /** @purpose Canonical MR identity */
  target: VcsSyncTarget;
  /** @purpose Last safely persisted provider cursor */
  cursor: string | null;
  /** @purpose Number of canonical events durably appended */
  appendedEvents: number;
  /** @purpose Whether effects must wait for a complete observation */
  effectsPostponed: boolean;
  /** @purpose Complete/partial/failure decision evidence */
  evidence: string;
};

/**
 * @purpose Own inclusive discovery, polling, recovery, event ordering, and per-MR cursors.
 * @invariant Cursor advances only after a complete observation and every normalized event is durable.
 * @invariant Poll failure retains prior snapshot/cursor and postpones effects.
 */
export class VcsSyncCoordinator {
  /** @purpose Existing unified provider read root. */
  protected readonly _vcs: VcsPort;
  /** @purpose Canonical TSK-173 journal boundary. */
  protected readonly _journal: JournalPort;
  /** @purpose Stateless complete-snapshot delta normalizer. */
  protected readonly _normalizer: VcsEventNormalizer;
  /** @purpose Last complete observation per canonical MR. */
  protected readonly _snapshots = new Map<string, VcsSnapshot>();
  /** @purpose Last cursor made durable after canonical event append. */
  protected readonly _cursors = new Map<string, string>();
  /** @purpose Injectable current time for deterministic visibility horizon tests. */
  protected readonly _now: () => string;

  /**
   * @purpose Bind one process-scoped coordinator to provider and canonical journal.
   * @param vcs Existing unified provider boundary.
   * @param journal Canonical review event journal.
   * @param [normalizer] Optional deterministic normalizer override.
   * @param [now] Optional controlled time source.
   */
  constructor(
    vcs: VcsPort,
    journal: JournalPort,
    normalizer = new VcsEventNormalizer(),
    now: () => string = () => new Date().toISOString()
  ) {
    this._vcs = vcs;
    this._journal = journal;
    this._normalizer = normalizer;
    this._now = now;
  }

  /**
   * @purpose Discover each active open MR with any independent participation signal exactly once.
   * @returns Deduplicated canonical targets within the activity horizon.
   * @sideEffect Reads provider inbox and identity-owned participation sources.
   */
  async discover(): Promise<VcsSyncTarget[]> {
    const discovered = await this._vcs.getInbox();
    const targets = new Map<string, VcsSyncTarget>();
    for (const mr of discovered) {
      if (mr.state !== 'opened' || !this._hasParticipation(mr) || this._isInactive(mr)) continue;
      const target = { project: mr.project, iid: mr.iid };
      targets.set(this._identify(target), target);
    }
    return [...targets.values()];
  }

  /**
   * @purpose Refresh all explicitly selected targets through the same cursor contract as discovery/recovery.
   * @param targets Canonical targets selected by discovery, timer, or explicit refresh.
   * @returns One ordered sync decision per target.
   */
  async synchronize(targets: readonly VcsSyncTarget[]): Promise<VcsSyncResult[]> {
    const results: VcsSyncResult[] = [];
    for (const target of targets) results.push(await this.synchronizeOne(target));
    return results;
  }

  /**
   * @purpose Read, normalize, append, and advance one MR cursor atomically at the boundary level.
   * @param target Canonical MR identity.
   * @returns Cursor/effect decision after the poll attempt.
   */
  async synchronizeOne(target: VcsSyncTarget): Promise<VcsSyncResult> {
    const key = this._identify(target);
    const previous = this._snapshots.get(key);
    let current: VcsSnapshot;
    try {
      current = await this._vcs.readSnapshot(target.project, target.iid, previous);
    } catch (cause) {
      logger.error('[VcsSyncCoordinator#synchronizeOne] [polling → failed_cursor_retained]', {
        cause,
        target,
      });
      return {
        target,
        cursor: this._cursors.get(key) ?? null,
        appendedEvents: 0,
        effectsPostponed: true,
        evidence: 'poll-failed-cursor-retained',
      };
    }

    const normalized = this._normalizer.normalize(previous, current);
    if (!normalized.cursorAdvance) {
      return {
        target,
        cursor: this._cursors.get(key) ?? null,
        appendedEvents: 0,
        effectsPostponed: true,
        evidence: normalized.evidence,
      };
    }

    let appendedEvents = 0;
    // #region START_APPEND_ALL_EVENTS_BEFORE_CURSOR_ADVANCE
    try {
      const durableIds = new Set(this._journal.replayReviewEvents().map((event) => event.id));
      for (const event of normalized.events) {
        if (durableIds.has(event.id)) continue;
        await this._journal.appendReviewEvent(event);
        appendedEvents += 1;
      }
    } catch (cause) {
      logger.error('[VcsSyncCoordinator#synchronizeOne] [appending → failed_cursor_retained]', {
        cause,
        target,
      });
      return {
        target,
        cursor: this._cursors.get(key) ?? null,
        appendedEvents,
        effectsPostponed: true,
        evidence: 'journal-append-failed-cursor-retained',
      };
    }
    this._snapshots.set(key, current);
    this._cursors.set(key, current.cursor);
    // #endregion END_APPEND_ALL_EVENTS_BEFORE_CURSOR_ADVANCE

    return {
      target,
      cursor: current.cursor,
      appendedEvents,
      effectsPostponed: false,
      evidence: normalized.evidence,
    };
  }

  /**
   * @purpose Detect any inclusive discovery signal while retaining compatibility with pre-TSK-174 DTOs.
   * @param mr Provider discovery candidate.
   * @returns Whether any inclusive participation signal is present.
   */
  protected _hasParticipation(mr: VcsActionableMr): boolean {
    const participation = mr.participation;
    return participation
      ? Object.values(participation).some(Boolean)
      : mr.role !== null || mr.directlyAddressed || mr.approvedBy.length > 0;
  }

  /**
   * @purpose Hide observations older than the active dashboard horizon.
   * @param mr Provider discovery candidate.
   * @returns Whether the observation exceeds the active horizon.
   */
  protected _isInactive(mr: VcsActionableMr): boolean {
    const observed = Date.parse(mr.updatedAt);
    return Number.isNaN(observed) || Date.parse(this._now()) - observed > ACTIVE_HORIZON_MS;
  }

  /**
   * @purpose Identify one MR consistently across snapshots and cursors.
   * @param target Canonical MR target.
   * @returns Stable project and IID identity.
   */
  protected _identify(target: VcsSyncTarget): string {
    return `${target.project}!${target.iid}`;
  }
}
