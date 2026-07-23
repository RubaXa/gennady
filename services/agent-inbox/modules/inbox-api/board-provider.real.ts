// @file: BoardProviderReal — real-mode BoardProviderPort impl backed by RoleScheduler instance states.
// @consumers: inbox-api routers, inbox-dashboard, DI container
// @tasks: TSK-117, TSK-122, TSK-131, TSK-145

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '#logger';
import { BoardProviderPort } from './board-provider.port.ts';
import type {
  BoardData,
  RoleView,
  MrCard,
  MrDetail,
  ArtifactRef,
  ArtifactContent,
  FixTaskCopyResult,
  FixTaskCopySnapshot,
} from './types.ts';
import type { RoleScheduler, RoleInstanceSnapshot } from '../inbox-roles/role-scheduler.ts';
import type { RoleEngine, RegisteredRole } from '../inbox-roles/role-engine.ts';
import type { VcsActionableMr } from '../../../vcs-client/entities/vcs-actionable-mr.type.ts';
import { parseVcsUrl } from '../../../vcs-client/parse-vcs-url.ts';
import { isValidMrUrl } from '../inbox-core/vcs-validators.ts';
import { isSafeArtifactPath } from './routers/artifact.router.ts';
import { mrReportsDir } from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { AuditLog, type AuditEntry } from '../inbox-core/audit-log.ts';
import {
  computeFindingSignatures,
  diffFindingSignatures,
} from '../inbox-core/finding-signature.ts';

/** @purpose Audit event name recorded on each "Copy fix task" click (SV-10, TSK-145). */
const COPIED_FIX_TASK_EVENT = 'copied_fix_task';

/** @purpose Known review-document filenames materialized directly under `reports/<mr>/` (TSK-122 gap-2). */
const KNOWN_REPORT_FILES = ['REPORT.md', 'README.md', 'PLAN.md', 'HISTORY.md'];

/**
 * @purpose Build a MrCard from a polled VcsActionableMr — real metadata for the dashboard (F7).
 * @param mr Actionable MR from the last VCS poll.
 * @param [role] Role name when the MR is under an instance.
 * @returns MrCard with real project/iid/title fields.
 */
function actionableToMrCard(mr: VcsActionableMr, role?: string): MrCard {
  return {
    project: mr.project,
    iid: Number(mr.iid) || 0,
    webUrl: mr.webUrl,
    title: mr.title,
    description: mr.description,
    author: mr.author,
    reviewers: mr.reviewers,
    approvedBy: mr.approvedBy,
    updatedAt: mr.updatedAt,
    draft: mr.draft,
    state: mr.state,
    role: (role ?? mr.role) as MrCard['role'],
    events: [],
    directlyAddressed: false,
    todoIds: [],
    stage: 'review_needed',
    sourceBranch: '',
    targetBranch: '',
  } as MrCard;
}

/**
 * @purpose Build a MrCard from a RoleInstanceSnapshot for dashboard display.
 * Skeleton fallback when the MR is not present in the last poll.
 * @param snap Instance snapshot from scheduler.
 * @returns MrCard populated from snapshot data.
 */
function snapshotToMrCard(snap: RoleInstanceSnapshot): MrCard {
  return {
    iid: '',
    project: '',
    webUrl: snap.mr,
    title: snap.mr,
    description: '',
    author: '',
    reviewers: [],
    approvedBy: [],
    updatedAt: '',
    draft: false,
    state: 'opened',
    role: snap.role,
    events: [],
    directlyAddressed: false,
    todoIds: [],
  } as unknown as MrCard;
}

/**
 * @purpose Render-hint from a `reports/<mr>/` file's extension.
 * @invariant Every materialized report file is markdown; mermaid ships as a fenced block inside
 *   README.md, never a standalone kind.
 * @param name Artifact file name or path.
 * @returns ArtifactKind driving the dashboard's viewer choice.
 */
function deriveArtifactKind(name: string): 'md' | 'json' | 'text' {
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.md')) return 'md';
  return 'text';
}

/**
 * @purpose Map an InstanceState to a board lane.
 * @param state RoleInstance state.
 * @returns Lane name: inbox, inProgress, awaitingMe, or done.
 */
function stateToLane(state: string): 'inbox' | 'inProgress' | 'awaitingMe' | 'done' {
  switch (state) {
    case 'idle':
      return 'inbox';
    case 'running':
      return 'inProgress';
    case 'awaiting_operator':
    case 'escalated':
      return 'awaitingMe';
    case 'done':
      return 'done';
    default:
      return 'inbox';
  }
}

/**
 * @purpose Real board provider — wraps RoleScheduler to implement BoardProviderPort.
 * getBoard() builds BoardData from RoleInstance states.
 * assignMr / executeAction delegate to the scheduler.
 * @invariant All data comes from the live scheduler — no mock seeding.
 * @consumer DI container (bootstrap.ts) for mocks=false
 */
export class BoardProviderReal extends BoardProviderPort {
  /** @purpose Role scheduler providing live instance data. */
  protected _scheduler: RoleScheduler;
  /** @purpose Role engine providing role definitions and activation state. */
  protected _engine: RoleEngine;
  /** @purpose Gennady state root — reports/<mr>/ artifacts live under `<stateDir>/agent-inbox/reports/` (TSK-122 gap-3). */
  protected _stateDir: string;
  /** @purpose Audit log backing `recordFixTaskCopy` — same `<stateDir>/agent-inbox/audit.jsonl` StateStore#appendAudit/queryAudit write to elsewhere (TSK-145). */
  protected _auditLog: AuditLog;

  /**
   * @purpose Create a BoardProviderReal backed by the given scheduler, engine, and state directory.
   * @param scheduler The live RoleScheduler.
   * @param engine The RoleEngine for role metadata.
   * @param stateDir Gennady state root — backs `listArtifacts`/`readArtifact` against `reports/<mr>/` on disk.
   */
  constructor(scheduler: RoleScheduler, engine: RoleEngine, stateDir: string) {
    super();
    this._scheduler = scheduler;
    this._engine = engine;
    this._stateDir = stateDir;
    this._auditLog = new AuditLog(stateDir);
  }

  /**
   * @purpose Resolve a live instance by mrId — accepts either the instance's own webUrl or the
   *   dashboard's `project!iid` composite key (route param, per `MrCard#mrKey`).
   * @invariant Mirrors `BoardProviderMock#_findMr`'s dual-key lookup; without it, `getReport` never
   *   matches a live instance and `#/mr/<real>` never renders.
   * @param mrId MR identifier — webUrl or `project!iid`.
   * @returns Matching snapshot, or undefined.
   */
  protected _resolveInstance(mrId: string): RoleInstanceSnapshot | undefined {
    const instances = this._scheduler.listInstances();
    const direct = instances.find((i) => i.mr === mrId);
    if (direct) return direct;

    const byPoll = instances.find((i) => {
      const polled = this._scheduler.getPolledMr(i.mr);
      return polled ? `${polled.project}!${polled.iid}` === mrId : false;
    });
    if (byPoll) return byPoll;

    // Derive `project!iid` straight from the instance's webUrl key — a manually-assigned instance has
    // no poll data, so without this executeAction 404s while genuinely at awaiting_operator.
    return instances.find((i) => {
      const parsed = parseVcsUrl(i.mr);
      return parsed ? `${parsed.repository}!${parsed.iid}` === mrId : false;
    });
  }

  /**
   * @returns Board data built from live RoleScheduler instance states.
   * @see {BoardProviderPort#getBoard}
   */
  getBoard(): BoardData {
    const instances = this._scheduler.listInstances();
    const allRoles = this._engine.list();

    // Build empty lanes for all registered roles
    const lanesByRole: Map<
      string,
      { inbox: MrCard[]; inProgress: MrCard[]; awaitingMe: MrCard[]; done: MrCard[] }
    > = new Map();
    for (const role of allRoles) {
      lanesByRole.set(role.name, { inbox: [], inProgress: [], awaitingMe: [], done: [] });
    }

    const assignedMrs = new Set<string>();

    // Place each instance into its role's lane based on state.
    // Card metadata comes from the last poll when available (F7).
    for (const snap of instances) {
      const roleLanes = lanesByRole.get(snap.role);
      if (!roleLanes) continue;

      const polled = this._scheduler.getPolledMr(snap.mr);
      const card = polled ? actionableToMrCard(polled, snap.role) : snapshotToMrCard(snap);
      const lane = stateToLane(snap.state);
      roleLanes[lane].push(card);
      assignedMrs.add(snap.mr);
    }

    // Build RoleView array
    const roles: RoleView[] = allRoles.map((r: RegisteredRole) => ({
      name: r.name,
      active: r.active,
      lanes: lanesByRole.get(r.name) ?? { inbox: [], inProgress: [], awaitingMe: [], done: [] },
    }));

    // F7: MRs from the last poll without a RoleInstance — the «БЕЗ РОЛИ» set (SV-06).
    const unassigned: MrCard[] = this._scheduler
      .listUnassigned()
      .map((mr) => actionableToMrCard(mr));

    return { roles, unassigned };
  }

  /**
   * @param mrId MR identifier (webUrl).
   * @param role Target role name.
   * @param [rights] Optional access rights map.
   * @returns Operation result — delegates to scheduler.assignManual.
   * @see {BoardProviderPort#assignMr}
   */
  assignMr(mrId: string, role: string, rights?: Record<string, unknown>): { ok: boolean } {
    // #region START_VALIDATE_MR_URL — prevent SSRF: only allow URLs matching our VCS host
    const vcsHost = this._scheduler.getVcsHost();
    if (!isValidMrUrl(mrId, vcsHost)) {
      return { ok: false };
    }
    // #endregion END_VALIDATE_MR_URL

    // Fire-and-forget: assignManual is async but we don't await here
    // because the port is synchronous. The scheduler handles it eventually.
    void this._scheduler.assignManual(mrId, role, rights);
    return { ok: true };
  }

  /**
   * @param mrId MR identifier (webUrl).
   * @param _action Action payload with questionId, choice, and optional payload.
   * @returns Operation result — finds instance and advances it past ask node.
   * @see {BoardProviderPort#executeAction}
   */
  executeAction(
    mrId: string,
    _action: { questionId: string; choice: string; payload?: unknown }
  ): { ok: boolean } {
    // The dashboard routes on `#/mr/<project>!<iid>` and passes that short composite key here, but
    // scheduler instances are keyed by full MR webUrl (assignManual/tick both key on webUrl). Resolve
    // dual-key the same way getReport does — via _resolveInstance's snapshot — then fetch the real
    // RoleInstance by its own webUrl. A raw findInstance(mrId) would never match "project!iid" and
    // every Approve/Post/Skip/Дослать would 404 even while the instance is genuinely awaiting_operator.
    const snap = this._resolveInstance(mrId);
    const instance = snap ? this._scheduler.findInstance(snap.mr) : null;
    // role-instance.ts's error-recovery ladders (_executeParallel's fan-out escalation,
    // _applyRecovery's exhausted continue/restart branches) also set state='awaiting_operator'
    // when a session breaks beyond recovery, WITHOUT advancing currentNode to 'node_ask' — that's
    // a genuine "pipeline stuck, needs investigation" signal, not "review ready for an approve/post
    // decision". Only currentNode === 'node_ask' means setAnswer()+step() have anywhere to go; on
    // an error-escalated instance step() would try to resume the broken node with no valid answer.
    if (
      !instance ||
      instance.state !== 'awaiting_operator' ||
      instance.currentNode !== 'node_ask'
    ) {
      return { ok: false };
    }

    // D3: Store the operator's answer so the ask node can use it, then advance
    instance.setAnswer(_action.choice);
    void instance.step();
    return { ok: true };
  }

  /**
   * @param mrId MR identifier (webUrl).
   * @returns MR detail with findings and verdict, or null if instance not found.
   * @see {BoardProviderPort#getReport}
   */
  getReport(mrId: string): MrDetail | null {
    const snap = this._resolveInstance(mrId);
    if (!snap) {
      // No live/registered scheduler instance — the review was materialized by an earlier run or a
      // different process. The dashboard's job is to DISPLAY an already-persisted report, so read it
      // straight from disk instead of 404-ing (a reviewed MR must be openable after a restart).
      const disk = this._readDiskReview(mrId);
      if (!disk) return null;
      const bang = mrId.lastIndexOf('!');
      const card = {
        project: bang > 0 ? mrId.slice(0, bang) : '',
        iid: bang > 0 ? Number(mrId.slice(bang + 1)) || 0 : 0,
        webUrl: mrId,
        title: mrId,
        description: '',
        author: '',
        reviewers: [],
        approvedBy: [],
        updatedAt: '',
        draft: false,
        state: 'opened',
        role: disk.role,
        events: [],
        directlyAddressed: false,
        todoIds: [],
        stage: 'review_needed',
        sourceBranch: '',
        targetBranch: '',
      } as MrCard;
      logger.info('[BoardProviderReal#getReport] [no-instance → disk]', {
        mrId,
        findings: disk.findings.length,
        revision: disk.revision,
      });
      return {
        mr: card,
        findings: disk.findings,
        verdict: disk.verdict,
        audit: [],
        revision: disk.revision,
      };
    }

    const polled = this._scheduler.getPolledMr(snap.mr);
    // review.json is the authoritative, post-synthesis reconciled result (deduped across lenses)
    // once it exists on disk. snap.findings (RoleInstance#_extractFindings) reads whichever node
    // artifact iterates first, including raw pre-synthesis lens results — it can disagree with the
    // reconciled disk version once synthesis has run (a real bug this comment used to mask: it only
    // consulted disk when snap.findings was EMPTY, so a stale/raw non-empty in-memory value always
    // won even after synthesis wrote a corrected review.json). Disk wins whenever it exists; in-memory
    // is only the fallback for an in-flight review that hasn't reached synthesis yet.
    const ref = polled ? `${polled.project}!${polled.iid}` : mrId;
    const disk = this._readDiskReview(ref);

    return {
      mr: polled ? actionableToMrCard(polled, snap.role) : snapshotToMrCard(snap),
      findings: disk?.findings ?? snap.findings,
      verdict: disk?.verdict || snap.verdict || '',
      audit: [],
      revision: disk?.revision ?? 0,
    };
  }

  /**
   * @param mrId MR identifier (webUrl or `project!iid`).
   * @returns FixTaskCopyResult on success, null if `getReport(mrId)` finds no report for this MR.
   * @see {BoardProviderPort#recordFixTaskCopy}
   */
  async recordFixTaskCopy(mrId: string): Promise<FixTaskCopyResult | null> {
    const report = this.getReport(mrId);
    if (!report) return null;

    const signatures = computeFindingSignatures(report.findings);

    // #region START_READ_PRIOR_COPIES — invariant: query happens BEFORE this call's own append, so priorCopyCount/delta never counts the event this call is about to write
    let priorEvents: AuditEntry[];
    try {
      priorEvents = (await this._auditLog.query(mrId)).filter(
        (entry) => entry.event === COPIED_FIX_TASK_EVENT
      );
    } catch (cause) {
      const error = new Error('[BoardProviderReal#recordFixTaskCopy] Audit query failed', {
        cause,
      });
      logger.error('[BoardProviderReal#recordFixTaskCopy] [querying → failed]', { mrId, error });
      throw error;
    }
    // #endregion END_READ_PRIOR_COPIES

    const lastEvent = priorEvents.at(-1);
    const isFirst = !lastEvent;
    const delta = lastEvent
      ? diffFindingSignatures(this._parseFixTaskCopySnapshot(lastEvent).signatures, signatures)
      : null;

    try {
      await this._auditLog.append({
        ts: new Date().toISOString(),
        mr: mrId,
        role: report.mr.role ?? 'operator',
        event: COPIED_FIX_TASK_EVENT,
        detail: JSON.stringify({ signatures } satisfies FixTaskCopySnapshot),
      });
    } catch (cause) {
      const error = new Error('[BoardProviderReal#recordFixTaskCopy] Audit append failed', {
        cause,
      });
      logger.error('[BoardProviderReal#recordFixTaskCopy] [appending → failed]', { mrId, error });
      throw error;
    }

    return {
      isFirst,
      priorCopyCount: priorEvents.length,
      lastCopiedAt: lastEvent?.ts ?? null,
      delta,
    };
  }

  /**
   * @purpose Parse a `copied_fix_task` audit event's `detail` JSON back into its signature snapshot.
   * @invariant A malformed/missing detail degrades to an empty snapshot rather than throwing — a
   *   corrupted historical entry must not block recording a NEW copy.
   * @param entry Audit entry with `event === 'copied_fix_task'`.
   * @returns The snapshot recorded at that click, or `{ signatures: [] }` on parse failure.
   */
  protected _parseFixTaskCopySnapshot(entry: AuditEntry): FixTaskCopySnapshot {
    try {
      const parsed = JSON.parse(entry.detail ?? '{}') as Partial<FixTaskCopySnapshot>;
      return { signatures: Array.isArray(parsed.signatures) ? parsed.signatures : [] };
    } catch (cause) {
      logger.warn('[BoardProviderReal#_parseFixTaskCopySnapshot] [parsing → degraded]', {
        mr: entry.mr,
        error: String(cause),
      });
      return { signatures: [] };
    }
  }

  /**
   * @purpose Read the structured review (`review.json`) the reviewer pipeline persisted under
   *   `reports/<mr>/` — findings the candidates panel renders with no live instance.
   * @invariant `revision` defaults to `0` when `review.json` lacks the field — matches
   *   `ContextAssembler#_readReviewRevision`'s default so client and `GET report` agree on CAS baseline (D-99).
   * @param ref MR `project!iid` composite key (the `mrReportsDir` encoding input).
   * @returns `{ findings, verdict, revision }` or null when absent/unreadable.
   */
  protected _readDiskReview(ref: string): {
    findings: MrDetail['findings'];
    verdict: string;
    revision: number;
    role: MrCard['role'];
  } | null {
    try {
      const file = join(mrReportsDir(this._stateDir, ref), 'review.json');
      if (!existsSync(file)) return null;
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as {
        verdict?: unknown;
        findings?: unknown;
        revision?: unknown;
        role?: unknown;
      };
      const findings = Array.isArray(parsed.findings)
        ? (parsed.findings as MrDetail['findings'])
        : [];
      const verdict = typeof parsed.verdict === 'string' ? parsed.verdict : '';
      const revision = typeof parsed.revision === 'number' ? parsed.revision : 0;
      const role = (
        parsed.role === 'author' || parsed.role === 'reviewer' || parsed.role === 'mentioned'
          ? parsed.role
          : null
      ) as MrCard['role'];
      return { findings, verdict, revision, role };
    } catch (cause) {
      logger.warn('[BoardProviderReal#_readDiskReview] [reading → degraded]', {
        ref,
        error: cause,
      });
      return null;
    }
  }

  /**
   * @purpose Override the base no-op: list the real review-document files materialized on disk
   *   under `reports/<mr>/` (TSK-122 gap-3).
   * @param mrId MR identifier — `project!iid`, matching `mrReportsDir`'s `ref` param and the
   *   dashboard's route key (`MrCard#mrKey`).
   * @returns ArtifactRef[] for every known top-level report file plus `tasks/*.task.md` that exist
   *   on disk; empty array when the MR has no materialized reports dir yet.
   */
  listArtifacts(mrId: string): ArtifactRef[] {
    const dir = mrReportsDir(this._stateDir, mrId);
    if (!existsSync(dir)) return [];

    const refs: ArtifactRef[] = [];
    for (const name of KNOWN_REPORT_FILES) {
      if (existsSync(join(dir, name)))
        refs.push({ name, path: name, kind: deriveArtifactKind(name) });
    }

    const tasksDir = join(dir, 'tasks');
    if (existsSync(tasksDir)) {
      try {
        for (const name of readdirSync(tasksDir)
          .filter((f) => f.endsWith('.task.md'))
          .sort()) {
          refs.push({ name, path: join('tasks', name), kind: deriveArtifactKind(name) });
        }
      } catch (cause) {
        logger.warn('[BoardProviderReal#listArtifacts] [reading-tasks-dir → degraded]', {
          mrId,
          error: String(cause),
        });
      }
    }

    return refs;
  }

  /**
   * @purpose Override the base no-op: read one real review-document file's content from disk
   *   under `reports/<mr>/` (TSK-122 gap-3).
   * @invariant Applies the identical traversal guard the ArtifactRouter uses ({@link isSafeArtifactPath})
   *   before touching the filesystem — `path` must stay a relative descendant of `reports/<mr>/`.
   * @param mrId MR identifier — `project!iid`.
   * @param path Artifact path relative to `reports/<mr>/`.
   * @returns ArtifactContent read from disk, or null if unsafe, missing, or unreadable.
   */
  readArtifact(mrId: string, path: string): ArtifactContent | null {
    // Same guard as ArtifactRouter (NFC-05): path must stay a relative descendant of reports/<mr>/.
    if (!isSafeArtifactPath(path)) return null;

    const filePath = join(mrReportsDir(this._stateDir, mrId), path);
    if (!existsSync(filePath)) return null;

    try {
      const content = readFileSync(filePath, 'utf-8');
      return { content, kind: deriveArtifactKind(path) };
    } catch (cause) {
      logger.error('[BoardProviderReal#readArtifact] [reading → failed]', {
        mrId,
        path,
        error: String(cause),
      });
      return null;
    }
  }
}
