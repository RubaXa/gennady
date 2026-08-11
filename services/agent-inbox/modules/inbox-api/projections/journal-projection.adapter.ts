// @file: JournalProjectionAdapter — production journal-backed implementation of ProjectionPort.
// @consumers: HttpServer, inbox-api composition root, review-api.integration.test.ts
// @tasks: TSK-179

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '#logger';
import type { ProjectionPort } from './projection.port.ts';
import type {
  ReviewBoardProjection,
  ReviewBoardCard,
  ReviewRoleChip,
} from './review-board.projection.ts';
import type { ReviewFeedProjection } from './review-feed.projection.ts';
import type { ReviewMrProjection, ReviewFinding } from './review-mr.projection.ts';
import type {
  ReviewPackageProjection,
  ReviewPackageItem,
  PackageOutcome,
  PackageStaleness,
} from './review-package.projection.ts';
import type {
  ReviewTestRunProjection,
  ReviewTestRun,
  ReviewTestPrecondition,
} from './review-test-run.projection.ts';
import type { SyncSnapshot } from '../../inbox-vcs/sync.ts';
import type { EventJournal } from '../../inbox-core/event-journal.ts';
import type { InboxRegistryAccess } from '../../inbox-core/inbox-registry.ts';
import type { ArtifactRef } from '../types.ts';
import { mrReportsDir } from '../../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { FeedProjection } from './feed-projection.ts';

/** @purpose Horizon in milliseconds after which merged/closed MRs with no recent activity become inactive. */
const BOARD_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

/** @purpose Known top-level report filenames materialized under reports/<mr>/. */
const KNOWN_REPORT_FILES = ['REPORT.md', 'README.md', 'PLAN.md', 'HISTORY.md'];

/** @purpose System event kind emitted by complete_mr command to track board completion state. */
const MR_BOARD_COMPLETE_KIND = 'mr_board_complete';

/** @purpose Payload of a mr_board_complete system event. */
type MrBoardCompletePayload = {
  kind: typeof MR_BOARD_COMPLETE_KIND;
  mrRef: string;
};

/** @purpose Parsed proposal entry from the decision journal event payload. */
type ProposalPayload = {
  proposalId?: string;
  capability?: string;
  revision?: number;
  payload?: Record<string, unknown>;
};

/** @purpose Parsed decision entry from the decision journal event payload. */
type DecisionPayload = {
  proposalId?: string;
  verdict?: string;
  taskId?: string;
};

/**
 * @purpose Dependencies injected into JournalProjectionAdapter.
 * @invariant journal and snapshots are the primary truth sources; stateDir is for disk review artifacts.
 */
export type JournalProjectionAdapterDeps = {
  /** @purpose Append-only event journal — primary truth source for all projections. */
  journal: EventJournal;
  /** @purpose Registry access for per-MR lastReadAt lookups (unread counter, feed cursor). */
  registry: InboxRegistryAccess;
  /** @purpose Gennady state root — review.json and artifact files live under <stateDir>/agent-inbox/reports/. */
  stateDir: string;
  /** @purpose VCS sync snapshots for board metadata — updated after each twoTierSync. */
  snapshots?: SyncSnapshot[];
};

/**
 * @purpose Production journal-backed implementation of ProjectionPort.
 * @implements {ProjectionPort} in projections/projection.port.ts
 * @invariant All projections rebuild from journal entries — no in-memory scheduler state.
 * @invariant Board deduplicates MRs: an MR appears at most once across mine/assigned queues.
 * @invariant Stale packages remain visible with invalidation metadata; current packages are actionable.
 */
export class JournalProjectionAdapter implements ProjectionPort {
  /** @purpose Underlying event journal. */
  protected _journal: EventJournal;
  /** @purpose Registry access for feed cursor and unread tracking. */
  protected _registry: InboxRegistryAccess;
  /** @purpose Gennady state root for disk review artifacts. */
  protected _stateDir: string;
  /** @purpose Latest VCS sync snapshots — updated via updateSnapshots(). */
  protected _snapshots: SyncSnapshot[];
  /** @purpose FeedProjection delegate — reuses existing feed logic. */
  protected _feedProjection: FeedProjection;
  /** @purpose Highest journal seq seen at the last build. */
  protected _cursor: number;

  /**
   * @purpose Create a JournalProjectionAdapter backed by journal, registry, and state directory.
   * @param deps Injected dependencies.
   */
  constructor(deps: JournalProjectionAdapterDeps) {
    this._journal = deps.journal;
    this._registry = deps.registry;
    this._stateDir = deps.stateDir;
    this._snapshots = deps.snapshots ?? [];
    this._feedProjection = new FeedProjection(deps.journal, deps.registry);
    this._cursor = 0;
  }

  /**
   * @purpose Replace the snapshot set after a VCS sync cycle.
   * @param snapshots Fresh sync snapshots.
   */
  updateSnapshots(snapshots: SyncSnapshot[]): void {
    this._snapshots = snapshots;
    logger.debug('[JournalProjectionAdapter#updateSnapshots] [idle → updated]', {
      count: snapshots.length,
    });
  }

  /** @see {ProjectionPort#cursor} in projections/projection.port.ts */
  cursor(): number {
    return this._cursor;
  }

  /** @see {ProjectionPort#board} in projections/projection.port.ts */
  board(): ReviewBoardProjection {
    logger.debug('[JournalProjectionAdapter#board] [idle → projecting]', {
      snapshots: this._snapshots.length,
    });

    const { entries, nextCursor } = this._journal.since(0);
    this._cursor = nextCursor;

    // #region START_COMPUTE_COMPLETION_STATE — scan system events to find completed MR refs and their last seq
    const completedAt = new Map<string, number>();
    for (const entry of entries) {
      if (entry.kind !== 'system') continue;
      const p = entry.payload as Partial<MrBoardCompletePayload>;
      if (p.kind === MR_BOARD_COMPLETE_KIND && typeof p.mrRef === 'string') {
        completedAt.set(p.mrRef, entry.seq);
      }
    }
    // #endregion END_COMPUTE_COMPLETION_STATE

    // #region START_COMPUTE_LAST_ACTIVITY — find most recent journal event per MR for horizon check
    const lastActivitySeqByMr = new Map<string, { seq: number; ts: string }>();
    for (const entry of entries) {
      if (entry.mr === 'system') continue;
      const prev = lastActivitySeqByMr.get(entry.mr);
      if (!prev || entry.seq > prev.seq) {
        lastActivitySeqByMr.set(entry.mr, { seq: entry.seq, ts: entry.ts });
      }
    }
    // #endregion END_COMPUTE_LAST_ACTIVITY

    const now = Date.now();
    const mine: ReviewBoardCard[] = [];
    const assigned: ReviewBoardCard[] = [];
    const seen = new Set<string>();

    // #region START_BUILD_BOARD_CARDS — one card per MR; mine queue has priority for deduplication
    for (const snap of this._snapshots) {
      const mrRef = `${snap.mr.project}!${snap.mr.iid}`;
      if (seen.has(mrRef)) continue;

      const roles = this._computeRoles(snap);
      if (roles.length === 0) continue;

      const lastActivityEntry = lastActivitySeqByMr.get(mrRef);
      const lastActivity = lastActivityEntry?.ts ?? snap.updatedAt ?? snap.mr.updatedAt ?? '';

      // Horizon check: merged/closed MRs inactive beyond horizon (unless they have recent journal events)
      const isTerminal = snap.mr.state === 'merged' || snap.mr.state === 'closed';
      if (isTerminal && lastActivity) {
        const age = now - new Date(lastActivity).getTime();
        if (age > BOARD_HORIZON_MS) continue;
      }

      // Completion check: MR is completed only when the last completion event is newer than the last regular event
      const completionSeq = completedAt.get(mrRef) ?? -1;
      const lastEventSeq = lastActivityEntry?.seq ?? -1;
      if (completionSeq >= 0 && completionSeq >= lastEventSeq) {
        // completed and no newer activity — skip board display
        continue;
      }

      const mrState = (
        snap.mr.state === 'merged' ? 'merged' : snap.mr.state === 'closed' ? 'closed' : 'open'
      ) as ReviewBoardCard['mrState'];

      const card: ReviewBoardCard = {
        ref: mrRef,
        title: snap.mr.title,
        webUrl: snap.mr.webUrl,
        author: snap.mr.author ?? '',
        roles,
        queue: roles.includes('author') ? 'mine' : 'assigned',
        attention: snap.attention,
        mrState,
        lastActivity,
      };

      seen.add(mrRef);
      if (card.queue === 'mine') {
        mine.push(card);
      } else {
        assigned.push(card);
      }
    }
    // #endregion END_BUILD_BOARD_CARDS

    const visible = [...mine.map((c) => c.ref), ...assigned.map((c) => c.ref)];

    logger.info('[JournalProjectionAdapter#board] [projecting → projected]', {
      mine: mine.length,
      assigned: assigned.length,
      cursor: nextCursor,
    });

    return { mine, assigned, visible, cursor: nextCursor };
  }

  /** @see {ProjectionPort#feed} in projections/projection.port.ts */
  feed(mrRef: string, cursor: number): ReviewFeedProjection {
    const result = this._feedProjection.project(cursor, mrRef);

    // #region START_COMPUTE_UNREAD — count feed entries the operator hasn't seen since their read cursor
    let lastReadAt: string | null = null;
    try {
      const reg = this._registry.load();
      const webUrl = this._resolveWebUrl(mrRef);
      if (webUrl) {
        const entry = reg.entries[webUrl] as Record<string, unknown> | undefined;
        lastReadAt = (entry?.lastReadAt as string) ?? null;
      }
    } catch {
      /* registry unavailable — unread degrades to 0 */
    }

    const allEntries = this._journal.since(0).entries;
    const unread = lastReadAt
      ? allEntries.filter((e) => e.mr === mrRef && e.ts > lastReadAt! && e.kind !== 'system').length
      : 0;
    // #endregion END_COMPUTE_UNREAD

    return { ...result, unread };
  }

  /** @see {ProjectionPort#mr} in projections/projection.port.ts */
  mr(mrRef: string): ReviewMrProjection | null {
    const { nextCursor } = this._journal.since(0);
    this._cursor = nextCursor;

    const snap = this._snapshots.find((s) => `${s.mr.project}!${s.mr.iid}` === mrRef);

    const disk = this._readDiskReview(mrRef);
    if (!disk && !snap) return null;

    const mrState: ReviewMrProjection['mrState'] =
      snap?.mr.state === 'merged' ? 'merged' : snap?.mr.state === 'closed' ? 'closed' : 'open';

    const artifacts = this._listArtifacts(mrRef);

    return {
      ref: mrRef,
      title: snap?.mr.title ?? mrRef,
      webUrl: snap?.mr.webUrl ?? '',
      author: snap?.mr.author ?? '',
      mrState,
      findings: disk?.findings ?? [],
      verdict: disk?.verdict ?? '',
      revision: disk?.revision ?? 0,
      artifacts,
      cursor: nextCursor,
    };
  }

  /** @see {ProjectionPort#packages} in projections/projection.port.ts */
  packages(mrRef: string): ReviewPackageProjection {
    const { entries, nextCursor } = this._journal.since(0);
    this._cursor = nextCursor;

    const diskRevision = this._readDiskReview(mrRef)?.revision ?? 0;

    // #region START_BUILD_PACKAGES — read proposal/decision events to build package projection
    const proposalById = new Map<string, { capability: string; revision: number; ts: string }>();
    const outcomesByProposal = new Map<string, PackageOutcome[]>();

    for (const entry of entries) {
      if (entry.mr !== mrRef) continue;

      // #region START_PROCESS_PROPOSAL — record package metadata from proposal events
      if (entry.kind === 'proposal') {
        const p = entry.payload as Partial<ProposalPayload>;
        const proposalId = typeof p.proposalId === 'string' ? p.proposalId : null;
        if (!proposalId) continue;
        const capability = typeof p.capability === 'string' ? p.capability : '';
        const innerPayload = p.payload ?? {};
        const revision = typeof innerPayload.revision === 'number' ? innerPayload.revision : 0;
        proposalById.set(proposalId, { capability, revision, ts: entry.ts });
      }
      // #endregion END_PROCESS_PROPOSAL

      // #region START_PROCESS_DECISION — record outcome from decision events
      if (entry.kind === 'decision') {
        const p = entry.payload as Partial<DecisionPayload>;
        const proposalId = typeof p.proposalId === 'string' ? p.proposalId : null;
        const verdict = typeof p.verdict === 'string' ? p.verdict : null;
        if (!proposalId || !verdict) continue;
        if (verdict !== 'accept' && verdict !== 'edit' && verdict !== 'reject') continue;

        const outcomeVerdict = (
          verdict === 'accept' ? 'accepted' : verdict === 'edit' ? 'edited' : 'rejected'
        ) as PackageOutcome['verdict'];

        const outcomes = outcomesByProposal.get(proposalId) ?? [];
        outcomes.push({
          outcomeId: `${entry.seq}`,
          verdict: outcomeVerdict,
          appliedAt: entry.ts,
          taskId: typeof p.taskId === 'string' ? p.taskId : undefined,
        });
        outcomesByProposal.set(proposalId, outcomes);
      }
      // #endregion END_PROCESS_DECISION
    }
    // #endregion END_BUILD_PACKAGES

    const current: ReviewPackageItem[] = [];
    const stale: ReviewPackageItem[] = [];

    for (const [proposalId, meta] of proposalById) {
      const outcomes = outcomesByProposal.get(proposalId) ?? [];
      const isStale = meta.revision < diskRevision;

      const item: ReviewPackageItem = {
        packageId: proposalId,
        proposalId,
        capability: meta.capability,
        revision: meta.revision,
        stale: isStale,
        staleness: isStale
          ? ({
              reason: 'Пакет создан для предыдущей версии ревью',
              atRevision: diskRevision,
            } satisfies PackageStaleness)
          : undefined,
        outcomes,
      };

      if (isStale) {
        stale.push(item);
      } else {
        current.push(item);
      }
    }

    return { current, stale, cursor: nextCursor };
  }

  /** @see {ProjectionPort#testRun} in projections/projection.port.ts */
  testRun(mrRef: string): ReviewTestRunProjection {
    const { entries, nextCursor } = this._journal.since(0);
    this._cursor = nextCursor;

    // #region START_BUILD_TEST_RUNS — derive runs from task_created/task_status events for test tasks
    const runsByTaskId = new Map<string, ReviewTestRun>();
    const preconditionsByTaskId = new Map<string, ReviewTestPrecondition[]>();
    let latestTestTaskId: string | null = null;

    for (const entry of entries) {
      if (entry.mr !== mrRef) continue;
      const p = entry.payload ?? {};
      const taskId = typeof p.taskId === 'string' ? p.taskId : null;
      if (!taskId) continue;
      const taskType = typeof p.type === 'string' ? p.type : '';

      if (entry.kind === 'task_created' && taskType.startsWith('test')) {
        runsByTaskId.set(taskId, {
          taskId,
          status: 'running',
          startedAt: null,
          completedAt: null,
        });
        latestTestTaskId = taskId;
      }

      if (entry.kind === 'task_status') {
        const status = typeof p.status === 'string' ? p.status : '';
        const existing = runsByTaskId.get(taskId);
        if (!existing) continue;

        const terminal = status === 'done' || status === 'failed' || status === 'cancelled';
        const mappedStatus: ReviewTestRun['status'] =
          status === 'done'
            ? 'passing'
            : status === 'failed'
              ? 'failing'
              : status === 'cancelled'
                ? 'cancelled'
                : 'running';

        runsByTaskId.set(taskId, {
          ...existing,
          status: mappedStatus,
          startedAt: status === 'running' ? (existing.startedAt ?? entry.ts) : existing.startedAt,
          completedAt: terminal ? entry.ts : null,
        });

        // #region START_COLLECT_PRECONDITIONS — extract adaptive preconditions from task_status payload
        if (Array.isArray(p.preconditions)) {
          const preconds: ReviewTestPrecondition[] = (p.preconditions as unknown[]).flatMap(
            (pc) => {
              if (
                typeof pc !== 'object' ||
                pc === null ||
                typeof (pc as Record<string, unknown>).key !== 'string'
              ) {
                return [];
              }
              const r = pc as Record<string, unknown>;
              return [
                {
                  key: r.key as string,
                  value: r.value as string | boolean | number,
                  observedAt: entry.ts,
                },
              ];
            }
          );
          preconditionsByTaskId.set(taskId, preconds);
        }
        // #endregion END_COLLECT_PRECONDITIONS
      }
    }
    // #endregion END_BUILD_TEST_RUNS

    const runs: ReviewTestRun[] = Array.from(runsByTaskId.values()).reverse();

    const lastStatus: ReviewTestRunProjection['status'] =
      runs.length === 0
        ? 'unknown'
        : runs[0].status === 'passing' ||
            runs[0].status === 'failing' ||
            runs[0].status === 'running'
          ? runs[0].status
          : 'unknown';

    const preconditions: ReviewTestPrecondition[] = latestTestTaskId
      ? (preconditionsByTaskId.get(latestTestTaskId) ?? [])
      : [];

    return {
      ref: mrRef,
      status: lastStatus,
      preconditions,
      runs,
      cursor: nextCursor,
    };
  }

  /**
   * @purpose Compute the operator's role chips for one sync snapshot.
   * @param snap VCS sync snapshot.
   * @returns Non-empty role chip array; empty when the operator has no known role on this MR.
   */
  protected _computeRoles(snap: SyncSnapshot): ReviewRoleChip[] {
    const chips: ReviewRoleChip[] = [];
    const role = snap.role;
    if (role === 'author') chips.push('author');
    if (role === 'reviewer') chips.push('reviewer');
    if (role === 'assignee') chips.push('assignee');
    // multi-role: if role is null but snap has assignees, still include reviewer/assignee via VCS metadata
    return chips;
  }

  /**
   * @purpose Resolve the canonical webUrl from a project!iid composite key using the registry.
   * @param mrRef MR composite reference.
   * @returns webUrl from the registry; null when not found.
   */
  protected _resolveWebUrl(mrRef: string): string | null {
    try {
      const registry = this._registry.load();
      for (const [webUrl, entry] of Object.entries(registry.entries)) {
        if (`${entry.project}!${entry.iid}` === mrRef) return webUrl;
      }
    } catch {
      /* registry unavailable */
    }
    return null;
  }

  /**
   * @purpose Read the structured review from disk — findings, verdict, revision, and role.
   * @invariant Returns null when review.json is absent or unreadable; degraded state never throws.
   * @param mrRef MR composite reference (project!iid).
   * @returns Parsed review data or null.
   */
  protected _readDiskReview(mrRef: string): {
    findings: ReviewFinding[];
    verdict: string;
    revision: number;
  } | null {
    try {
      const file = join(mrReportsDir(this._stateDir, mrRef), 'review.json');
      if (!existsSync(file)) return null;
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as {
        verdict?: unknown;
        findings?: unknown;
        revision?: unknown;
      };
      const findings = Array.isArray(parsed.findings) ? (parsed.findings as ReviewFinding[]) : [];
      const verdict = typeof parsed.verdict === 'string' ? parsed.verdict : '';
      const revision = typeof parsed.revision === 'number' ? parsed.revision : 0;
      return { findings, verdict, revision };
    } catch (cause) {
      logger.warn('[JournalProjectionAdapter#_readDiskReview] [reading → degraded]', {
        mrRef,
        error: String(cause),
      });
      return null;
    }
  }

  /**
   * @purpose List review artifacts materialized on disk under reports/<mr>/.
   * @param mrRef MR composite reference (project!iid).
   * @returns ArtifactRef[] for known report files; empty when directory is absent.
   */
  protected _listArtifacts(mrRef: string): ArtifactRef[] {
    const dir = mrReportsDir(this._stateDir, mrRef);
    if (!existsSync(dir)) return [];

    const refs: ArtifactRef[] = [];
    for (const name of KNOWN_REPORT_FILES) {
      if (existsSync(join(dir, name))) {
        const kind = name.endsWith('.json') ? 'json' : 'md';
        refs.push({ name, path: name, kind });
      }
    }
    return refs;
  }
}
