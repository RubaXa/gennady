// @file: BoardProviderMock — in-memory mock implementation of BoardProviderPort for dev/e2e.
// @consumers: inbox-api (DI), inbox-dashboard (dev), e2e tests
// @tasks: TSK-106, TSK-145

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
import type { AuditEntry } from '../inbox-core/audit-log.ts';
import {
  computeFindingSignatures,
  diffFindingSignatures,
} from '../inbox-core/finding-signature.ts';

/** @purpose Audit event name recorded on each "Copy fix task" click (SV-10, TSK-145). */
const COPIED_FIX_TASK_EVENT = 'copied_fix_task';

/** @purpose One seeded artifact entry — ArtifactRef metadata plus its raw content. */
type MockArtifact = ArtifactRef & { content: string };

/** @purpose Internal stored state for a single MR in the mock provider. */
type MockMrState = {
  /** @purpose The MR card data */
  card: MrCard;
  /** @purpose Which role this MR is assigned to (null = unassigned) */
  assignedRole: string | null;
  /** @purpose Which lane the MR sits in (inbox, inProgress, awaitingMe, done) */
  lane: 'inbox' | 'inProgress' | 'awaitingMe' | 'done';
  /** @purpose Seeded report findings */
  findings: Array<{ severity: string; file: string; line: number; message: string }>;
  /** @purpose Seeded verdict */
  verdict: string;
  /** @purpose Audit events for this MR */
  audit: AuditEntry[];
  /** @purpose Seeded artifacts, keyed by their path relative to `reports/<mr>/` */
  artifacts: Map<string, MockArtifact>;
};

/**
 * @purpose In-memory board provider for development and testing.
 * @implements {BoardProviderPort} in ./board-provider.port.ts
 * @invariant Pure data store: no network, no filesystem, no side effects.
 * @invariant MRs are indexed by webUrl.
 * @consumer DI container (replaces BoardProviderReal in dev/e2e)
 */
export class BoardProviderMock extends BoardProviderPort {
  /** @purpose All MRs indexed by webUrl. */
  protected _mrs: Map<string, MockMrState> = new Map();
  /** @purpose Role definitions with their active status. */
  protected _roles: Array<{ name: string; active: boolean }> = [];

  /**
   * @purpose Create an empty mock — call seed() to populate before use.
   */
  constructor() {
    super();
  }

  /**
   * @purpose Pre-load mock data: board state with roles and MRs.
   * @param data Board-like data: roles (with config) and unassigned MRs.
   * @param [reports] Optional map of webUrl → findings + verdict for getReport().
   * @param [artifacts] Optional map of webUrl → seeded artifact entries for listArtifacts/readArtifact().
   * @sideEffect Replaces all previously seeded data.
   */
  seed(
    data: {
      roles: Array<{ name: string; active: boolean }>;
      unassigned: MrCard[];
    },
    reports?: Record<string, { findings: MrDetail['findings']; verdict: string }>,
    artifacts?: Record<string, MockArtifact[]>
  ): void {
    this._mrs.clear();
    this._roles = data.roles.map((r) => ({ name: r.name, active: r.active }));

    const now = new Date().toISOString();

    for (const card of data.unassigned) {
      const report = reports?.[card.webUrl];
      const seededArtifacts = artifacts?.[card.webUrl] ?? [];
      this._mrs.set(card.webUrl, {
        card,
        assignedRole: null,
        lane: 'inbox',
        findings: report?.findings ?? [],
        verdict: report?.verdict ?? 'pending',
        audit: [
          {
            ts: now,
            mr: card.webUrl,
            role: 'system',
            event: 'seeded',
            detail: 'MR seeded into mock board',
          },
        ],
        artifacts: new Map(seededArtifacts.map((artifact) => [artifact.path, artifact])),
      });
    }
  }

  /**
   * @purpose Look up MR state by either webUrl or composite key "project!iid".
   * @param mrId MR identifier (webUrl or project!iid).
   * @returns MockMrState or undefined.
   */
  protected _findMr(mrId: string): MockMrState | undefined {
    // Direct lookup by webUrl
    const direct = this._mrs.get(mrId);
    if (direct) return direct;

    // Lookup by project!iid composite key
    for (const [, state] of this._mrs) {
      const key = `${state.card.project}!${state.card.iid}`;
      if (key === mrId) return state;
    }

    return undefined;
  }

  /**
   * @returns Board data with role lanes and unassigned cards.
   * @see {BoardProviderPort#getBoard}
   */
  getBoard(): BoardData {
    const lanes: Record<
      string,
      { inbox: MrCard[]; inProgress: MrCard[]; awaitingMe: MrCard[]; done: MrCard[] }
    > = {};

    for (const role of this._roles) {
      lanes[role.name] = { inbox: [], inProgress: [], awaitingMe: [], done: [] };
    }

    const unassigned: MrCard[] = [];

    for (const [, state] of this._mrs) {
      if (state.assignedRole && lanes[state.assignedRole]) {
        lanes[state.assignedRole][state.lane].push(state.card);
      } else {
        unassigned.push(state.card);
      }
    }

    const roles: RoleView[] = this._roles.map((r) => ({
      name: r.name,
      active: r.active,
      lanes: lanes[r.name] ?? { inbox: [], inProgress: [], awaitingMe: [], done: [] },
    }));

    return { roles, unassigned };
  }

  /**
   * @param mrId MR identifier (webUrl or project!iid).
   * @param role Target role name.
   * @param [_rights] Optional access rights map.
   * @returns Operation result — ok: true on success, ok: false if MR not found.
   * @see {BoardProviderPort#assignMr}
   */
  assignMr(mrId: string, role: string, _rights?: Record<string, unknown>): { ok: boolean } {
    const state = this._findMr(mrId);
    if (!state) return { ok: false };

    state.assignedRole = role;
    state.lane = 'inbox';

    this._pushAudit(mrId, role, 'assigned', `Assigned to role ${role}`);
    return { ok: true };
  }

  /**
   * /**
   * @param mrId MR identifier (webUrl or project!iid).
   * @param action Action payload with questionId, choice, and optional payload.
   * @returns Operation result — ok: true on success, ok: false if MR not found.
   * @see {BoardProviderPort#executeAction}
   */
  executeAction(
    mrId: string,
    action: { questionId: string; choice: string; payload?: unknown }
  ): { ok: boolean } {
    const state = this._findMr(mrId);
    if (!state) return { ok: false };

    state.lane = 'done';
    this._pushAudit(
      mrId,
      state.assignedRole ?? 'unassigned',
      'action_executed',
      `Question ${action.questionId} answered with choice ${action.choice}`
    );
    return { ok: true };
  }

  /**
   * @param mrId MR identifier (webUrl or project!iid).
   * @returns MR detail with findings and verdict, or null if MR not found.
   * @see {BoardProviderPort#getReport}
   */
  getReport(mrId: string): MrDetail | null {
    const state = this._findMr(mrId);
    if (!state) return null;

    return {
      mr: state.card,
      findings: state.findings,
      verdict: state.verdict,
      audit: state.audit,
      // Mock mode never persists review.json — no CAS revision to surface, same 0 default as a
      // fresh MR with no disk review yet (D-99, mirrors BoardProviderReal's absent-file default).
      revision: 0,
    };
  }

  /**
   * @param mrId MR identifier (webUrl or project!iid).
   * @returns FixTaskCopyResult on success, null if MR not found.
   * @see {BoardProviderPort#recordFixTaskCopy}
   */
  async recordFixTaskCopy(mrId: string): Promise<FixTaskCopyResult | null> {
    const state = this._findMr(mrId);
    if (!state) return null;

    const signatures = computeFindingSignatures(state.findings);
    const priorEvents = state.audit.filter((entry) => entry.event === COPIED_FIX_TASK_EVENT);
    const lastEvent = priorEvents.at(-1);
    const isFirst = !lastEvent;
    const delta = lastEvent
      ? diffFindingSignatures(this._parseFixTaskCopySnapshot(lastEvent).signatures, signatures)
      : null;

    state.audit.push({
      ts: new Date().toISOString(),
      mr: mrId,
      role: state.assignedRole ?? 'operator',
      event: COPIED_FIX_TASK_EVENT,
      detail: JSON.stringify({ signatures } satisfies FixTaskCopySnapshot),
    });

    return {
      isFirst,
      priorCopyCount: priorEvents.length,
      lastCopiedAt: lastEvent?.ts ?? null,
      delta,
    };
  }

  /**
   * @purpose Parse a `copied_fix_task` audit event's `detail` JSON back into its signature snapshot.
   * @invariant A malformed/missing detail degrades to an empty snapshot rather than throwing.
   * @param entry Audit entry with `event === 'copied_fix_task'`.
   * @returns The snapshot recorded at that click, or `{ signatures: [] }` on parse failure.
   */
  protected _parseFixTaskCopySnapshot(entry: AuditEntry): FixTaskCopySnapshot {
    try {
      const parsed = JSON.parse(entry.detail ?? '{}') as Partial<FixTaskCopySnapshot>;
      return { signatures: Array.isArray(parsed.signatures) ? parsed.signatures : [] };
    } catch {
      return { signatures: [] };
    }
  }

  /**
   * @purpose Override the base no-op: return seeded artifacts instead of an empty list.
   * @param mrId MR identifier (webUrl or project!iid).
   * @returns ArtifactRef[] built from seeded artifacts; empty array if MR not found.
   */
  listArtifacts(mrId: string): ArtifactRef[] {
    const state = this._findMr(mrId);
    if (!state) return [];

    return [...state.artifacts.values()].map(({ name, path, kind }) => ({ name, path, kind }));
  }

  /**
   * @purpose Override the base no-op: return seeded artifact content instead of null.
   * @param mrId MR identifier (webUrl or project!iid).
   * @param path Artifact path relative to `reports/<mr>/`.
   * @returns ArtifactContent for the seeded artifact, or null if MR or path not found.
   */
  readArtifact(mrId: string, path: string): ArtifactContent | null {
    const artifact = this._findMr(mrId)?.artifacts.get(path);
    return artifact ? { content: artifact.content, kind: artifact.kind } : null;
  }

  /**
   * @purpose Retrieve audit events for a specific MR.
   * @param mrId MR identifier (webUrl).
   * @returns Array of audit entries, empty if MR not found.
   */
  getAudit(mrId: string): AuditEntry[] {
    const state = this._findMr(mrId);
    return state ? [...state.audit] : [];
  }

  /**
   * @purpose Append an audit entry to an MR's audit trail.
   * @param mrId MR identifier (webUrl).
   * @param role Role active at time of event.
   * @param event Event name.
   * @param detail Free-form detail.
   */
  protected _pushAudit(mrId: string, role: string, event: string, detail: string): void {
    const state = this._mrs.get(mrId);
    if (!state) return;

    state.audit.push({
      ts: new Date().toISOString(),
      mr: mrId,
      role,
      event,
      detail,
    });
  }
}
