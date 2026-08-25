// @file: BoardProviderReal — real-mode BoardProviderPort impl backed by RoleScheduler instance states.
// @consumers: inbox-api routers, inbox-dashboard, DI container
// @tasks: TSK-117, TSK-122, TSK-131, TSK-145, TSK-155

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
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
import {
  mrsRoot,
  mrReportsDir,
  canonicalMrRef,
} from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';
import { decodeMrKey } from './board-provider.disk.ts';
import { AuditLog, type AuditEntry } from '../inbox-core/audit-log.ts';
import {
  computeFindingSignatures,
  diffFindingSignatures,
} from '../inbox-core/finding-signature.ts';
import { deriveReviewProgress } from '../inbox-roles/review-progress.ts';
import { phaseTimingsPath, type PhaseTimingEntry } from '../inbox-roles/phase-telemetry.ts';

/** @purpose Audit event name recorded on each "Copy fix task" click (SV-10, TSK-145). */
const COPIED_FIX_TASK_EVENT = 'copied_fix_task';

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
   * @purpose Resolve a canonical ref to the report directory that actually carries the review.
   * @invariant Prefers canonical `review.json`, falling back to a legacy host-prefixed review directory.
   * @param mrId Canonical MR id (`group/project!iid` or URL) to resolve.
   * @returns Stored ref — the canonical ref or a legacy host-prefixed directory name.
   */
  protected _artifactStoredRef(mrId: string): string {
    const canonical = canonicalMrRef(mrId);
    if (existsSync(join(mrReportsDir(this._stateDir, canonical), 'review.json'))) return canonical;

    const root = mrsRoot(this._stateDir);
    if (existsSync(root)) {
      for (const key of readdirSync(root)) {
        const candidate = decodeMrKey(key);
        if (candidate && canonicalMrRef(candidate) === canonical) {
          if (existsSync(join(root, key, 'report', 'review.json'))) return candidate;
        }
      }
    }
    return canonical;
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
   * @purpose Read the phase-timings JSONL log and filter entries belonging to one MR — the raw
   *   input `deriveReviewProgress` needs to compute `elapsedMs`/`startedAt` (TSK-155).
   * @invariant Best-effort: missing/unreadable log or malformed lines degrade to `[]`, mirroring
   *   `phase-telemetry.ts`'s own read helpers — telemetry is diagnostic-only and must never break
   *   board rendering.
   * @param mr MR web URL, matching `PhaseTimingEntry.mr` (the same key `RoleInstance` records under).
   * @returns Matching entries, unsorted.
   */
  protected _readPhaseEntriesForMr(mr: string): PhaseTimingEntry[] {
    const filePath = phaseTimingsPath(this._stateDir);
    if (!existsSync(filePath)) return [];
    try {
      const content = readFileSync(filePath, 'utf-8');
      const entries: PhaseTimingEntry[] = [];
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as PhaseTimingEntry;
          if (entry.mr === mr) entries.push(entry);
        } catch {
          // skip malformed line — one bad line never blocks the rest
        }
      }
      return entries;
    } catch (cause) {
      logger.warn('[BoardProviderReal#_readPhaseEntriesForMr] [reading → degraded]', {
        mr,
        error: String(cause),
      });
      return [];
    }
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

      // TSK-155: live progress informer — only for MRs with a resolvable RoleInstance (has
      // currentNode/checkpoint artifacts to derive from); a snapshot alone is not enough
      // (RoleInstanceSnapshot carries no `artifacts`, see `RoleInstance#getCheckpoint`).
      const instance = this._scheduler.findInstance(snap.mr);
      if (instance) {
        card.progress = deriveReviewProgress({
          currentNode: instance.currentNode,
          artifacts: instance.getCheckpoint().artifacts,
          phaseEntries: this._readPhaseEntriesForMr(snap.mr),
          role: snap.role,
          instanceCreatedAt: instance.createdAt,
        });
      }

      let lane: 'inbox' | 'inProgress' | 'awaitingMe' | 'done' = stateToLane(snap.state);
      // After the first node, 'idle' means "waiting for next tick", not "not started" —
      // show it in InProgress so the operator sees forward motion.
      if (lane === 'inbox' && instance && instance.currentNode !== 'node_prepare') {
        lane = 'inProgress';
      }
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

    // Fire-and-forget assignManual, then kick an immediate tick so the newly-assigned
    // instance advances past 'idle' → 'inProgress' without waiting for the poll (up to 300s).
    void this._scheduler.assignManual(mrId, role, rights).then(() => {
      void this._scheduler.tick();
    });
    return { ok: true };
  }

  /**
   * @param role Role name.
   * @param active Desired activation state.
   * @returns Operation result — delegates to RoleEngine.activate/deactivate.
   * @see {BoardProviderPort#setRoleActive}
   */
  setRoleActive(role: string, active: boolean): { ok: boolean } {
    if (!this._engine.retrieve(role)) return { ok: false };
    if (active) {
      this._engine.activate(role);
      // Activation must take effect NOW, not on the next poll (up to 300s away): kick an immediate
      // tick so a newly-active role picks up and (re)assigns its actionable MRs — including restoring
      // MRs already under review — instead of the operator staring at an empty board until the timer.
      // Fire-and-forget: the HTTP response returns at once; tick() self-guards re-entrancy.
      void this._scheduler.tick();
    } else {
      this._engine.deactivate(role);
    }
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
      // Normalize to `project!iid` first: `_readDiskReview`/`mrReportsDir` key on that form, but
      // callers (and this method while an instance is live) also pass a full webUrl — without this
      // the same webUrl that resolved fine mid-review silently 404s once the instance is cleaned up
      // (live-found 2026-07-23: getReport(webUrl) 200 during review, 404 after done).
      const parsed = parseVcsUrl(mrId);
      const ref = parsed ? `${parsed.repository}!${parsed.iid}` : mrId;
      const disk = this._readDiskReview(ref);
      if (!disk) return null;
      const bang = ref.lastIndexOf('!');
      const card = {
        project: bang > 0 ? ref.slice(0, bang) : '',
        iid: bang > 0 ? Number(ref.slice(bang + 1)) || 0 : 0,
        webUrl: mrId,
        title: ref,
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
        ref,
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
    const dir = mrReportsDir(this._stateDir, this._artifactStoredRef(mrId));
    if (!existsSync(dir)) return [];

    const refs: ArtifactRef[] = [];
    const walk = (current: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const absolute = join(current, entry.name);
        if (entry.isDirectory()) {
          walk(absolute);
          continue;
        }
        const path = relative(dir, absolute);
        if (!isSafeArtifactPath(path)) continue;
        if (path.startsWith('control-plane/sources/')) continue;
        if (path.includes('.opencode-') || path === 'tool-trace.json') continue;
        refs.push({ name: path, path, kind: deriveArtifactKind(path) });
      }
    };
    try {
      walk(dir);
    } catch (cause) {
      logger.warn('[BoardProviderReal#listArtifacts] [reading-report-tree → degraded]', {
        mrId,
        error: String(cause),
      });
    }
    return refs.sort((left, right) => left.path.localeCompare(right.path));
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

    const filePath = join(mrReportsDir(this._stateDir, this._artifactStoredRef(mrId)), path);
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
