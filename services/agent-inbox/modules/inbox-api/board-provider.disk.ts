// @file: BoardProviderDisk — READ-ONLY BoardProviderPort impl backed purely by the on-disk
//   `mrs/<key>/report/` review artifacts. No RoleScheduler/RoleEngine, no live GitLab dependency —
//   this is the minimal viewer path so a reviewed MR stays openable after a restart with no sync.
// @consumers: bootstrap.ts (real-mode wiring), inbox-api routers, projections/board-projection.ts (disk-scan seed)
// @tasks: TSK-190

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
} from './types.ts';
import { isSafeArtifactPath } from './routers/artifact.router.ts';
import {
  canonicalMrRef,
  mrsRoot,
  mrReportsDir,
} from '../../../../cli/cmd/inbox/_core/logic/state-paths.logic.ts';

/** @purpose Fields read from `report/context.json` — real shape observed on disk (ref/title/webUrl/author/reviewers/description/branches/updatedAt); every field is optional because older reports may lack it. */
type DiskContext = {
  /** @purpose MR title. */
  title?: string;
  /** @purpose Canonical VCS web URL. */
  webUrl?: string;
  /** @purpose MR author login. */
  author?: string;
  /** @purpose MR description body. */
  description?: string;
  /** @purpose Reviewer usernames. */
  reviewers?: string[];
  /** @purpose ISO update timestamp. */
  updatedAt?: string;
  /** @purpose Source branch name. */
  sourceBranch?: string;
  /** @purpose Target branch name. */
  targetBranch?: string;
};

/** @purpose Minimal disk-sourced MR facts a board projection can merge in without touching attention/counters/work — see `scanDiskCardSeeds`. */
export type DiskCardSeed = {
  /** @purpose Composite MR reference (`project!iid`), same key space as live sync-derived cards. */
  ref: string;
  /** @purpose MR title, from disk context when available, else the ref. */
  title: string;
  /** @purpose MR description, from disk context when available, else empty. */
  description: string;
  /** @purpose Canonical VCS web URL, from disk context when available, else empty. */
  webUrl: string;
  /** @purpose VCS author login, from disk context when available, else empty. */
  author: string;
  /** @purpose Materialization time of the canonical completed review. */
  reviewedAt: string;
  /** @purpose Findings stored in the canonical completed review. */
  findings: number;
};

/**
 * @purpose Count findings in one canonical review without making board projection depend on report DTOs.
 * @param reviewFile Absolute path to `review.json`.
 * @returns Findings count, degrading to zero for unreadable or malformed content.
 */
function readDiskFindingCount(reviewFile: string): number {
  try {
    const parsed = JSON.parse(readFileSync(reviewFile, 'utf-8')) as { findings?: unknown };
    return Array.isArray(parsed.findings) ? parsed.findings.length : 0;
  } catch {
    return 0;
  }
}

/**
 * @purpose Render-hint from a report file's extension (mirrors BoardProviderReal#deriveArtifactKind).
 * @param name Artifact file name or path.
 * @returns ArtifactKind driving the dashboard's viewer choice.
 */
function deriveArtifactKind(name: string): 'md' | 'json' | 'text' {
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.md')) return 'md';
  return 'text';
}

/**
 * @purpose Reverse `mrKey`'s flat directory-name encoding back into `project!iid`.
 * @invariant iid is always numeric, so the LAST `-` in the key is the project/iid separator, even
 *   with dashes in the project name (e.g. `ansible-devint`).
 * @invariant Raw-webUrl-derived duplicate keys (bare trailing `-`, no numeric iid) decode to null;
 *   harmless since those dirs never carry a `report/` anyway.
 * @param key Directory name under `mrsRoot` (`mrKey` output).
 * @returns `project!iid`, or null when the key has no numeric iid suffix.
 */
export function decodeMrKey(key: string): string | null {
  const dash = key.lastIndexOf('-');
  if (dash <= 0) return null;
  const iidPart = key.slice(dash + 1);
  if (!/^\d+$/.test(iidPart)) return null;
  const project = key.slice(0, dash).replace(/__/g, '/');
  return `${project}!${iidPart}`;
}

/**
 * @purpose Read `report/context.json` for one MR — best-effort, degrades to `null` on any failure.
 * @param stateDir Gennady state root.
 * @param ref MR `project!iid` composite key.
 * @returns Parsed known fields, or null when absent/unreadable.
 */
function readDiskContext(stateDir: string, ref: string): DiskContext | null {
  try {
    const file = join(mrReportsDir(stateDir, ref), 'context.json');
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      webUrl: typeof parsed.webUrl === 'string' ? parsed.webUrl : undefined,
      author: typeof parsed.author === 'string' ? parsed.author : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      reviewers: Array.isArray(parsed.reviewers)
        ? parsed.reviewers.filter((r): r is string => typeof r === 'string')
        : undefined,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
      sourceBranch: typeof parsed.sourceBranch === 'string' ? parsed.sourceBranch : undefined,
      targetBranch: typeof parsed.targetBranch === 'string' ? parsed.targetBranch : undefined,
    };
  } catch (cause) {
    logger.warn('[board-provider.disk#readDiskContext] [reading → degraded]', {
      ref,
      error: String(cause),
    });
    return null;
  }
}

/** @purpose Convert legacy host-prefixed refs to the same `project!iid` identity as live sync. */
function canonicalDiskRef(ref: string, context: DiskContext | null): string {
  void context;
  return canonicalMrRef(ref);
}

/**
 * @purpose List every `project!iid` ref under `mrsRoot` with a materialized `report/review.json` —
 *   the closed-world set of already-reviewed MRs the viewer may show.
 * @param stateDir Gennady state root.
 * @returns Decoded refs, one per reviewed MR directory.
 */
function listReviewedRefs(stateDir: string): string[] {
  const root = mrsRoot(stateDir);
  if (!existsSync(root)) return [];
  const refs: string[] = [];
  for (const name of readdirSync(root)) {
    const ref = decodeMrKey(name);
    if (!ref) continue;
    if (!existsSync(join(mrReportsDir(stateDir, ref), 'review.json'))) continue;
    refs.push(ref);
  }
  return refs;
}

/**
 * @purpose Build disk-sourced seeds a `BoardProjection` merges in for MRs the live VCS sync hasn't
 *   (yet) reported — the disk viewer's board-visibility half.
 * @invariant Pure read, no mutation — safe on every `project()` call (one `readdir` plus one
 *   `context.json` read per reviewed MR).
 * @param stateDir Gennady state root.
 * @returns One seed per reviewed MR on disk.
 */
export function scanDiskCardSeeds(stateDir: string): DiskCardSeed[] {
  return listReviewedRefs(stateDir).map((ref) => {
    const context = readDiskContext(stateDir, ref);
    const reviewFile = join(mrReportsDir(stateDir, ref), 'review.json');
    return {
      ref: canonicalDiskRef(ref, context),
      title: context?.title ?? ref,
      description: context?.description ?? '',
      webUrl: context?.webUrl ?? '',
      author: context?.author ?? '',
      reviewedAt: statSync(reviewFile).mtime.toISOString(),
      findings: readDiskFindingCount(reviewFile),
    };
  });
}

/**
 * @purpose Disk-backed board provider — no scheduler, no VCS: `getBoard`/`getReport`/artifacts read
 *   straight from `<stateDir>/agent-inbox/mrs/<key>/report/`. View-only: every mutating method is a no-op.
 * @invariant Never performs a network call or a write — this is the read-only viewer path (TSK-190).
 * @consumer bootstrap.ts real-mode wiring
 */
export class BoardProviderDisk extends BoardProviderPort {
  /** @purpose Gennady state root — reports live under `<stateDir>/agent-inbox/mrs/<key>/report/`. */
  protected _stateDir: string;

  /**
   * @purpose Create a BoardProviderDisk backed by just a state directory.
   * @param config State-root binding.
   */
  constructor(config: { stateDir: string }) {
    super();
    this._stateDir = config.stateDir;
  }

  /**
   * @purpose Normalize an incoming MR identifier to the `project!iid` form the disk layout keys on.
   * @param mrId MR identifier — webUrl or `project!iid`.
   * @returns `project!iid`, falling back to `mrId` unchanged when it isn't a recognizable VCS URL.
   */
  protected _normalizeRef(mrId: string): string {
    return canonicalMrRef(mrId);
  }

  /**
   * @purpose Resolve canonical refs to the report directory that actually carries the review.
   * @invariant Prefers the canonical directory when it holds `review.json`; otherwise falls back to
   *   a legacy host-prefixed directory that holds `review.json`.
   * @param ref Canonical MR ref to resolve against disk layout.
   * @returns Stored ref matching `ref` — `ref` itself or a legacy host-prefixed directory name.
   */
  protected _storedRef(ref: string): string {
    if (existsSync(join(mrReportsDir(this._stateDir, ref), 'review.json'))) return ref;
    for (const storedRef of listReviewedRefs(this._stateDir)) {
      if (canonicalMrRef(storedRef) === canonicalMrRef(ref)) return storedRef;
    }
    return ref;
  }

  /**
   * @purpose Read the structured review (`review.json`) materialized under `report/`.
   * @invariant `revision` defaults to `0` when absent — matches BoardProviderReal's disk read (D-99).
   * @param ref MR `project!iid` composite key.
   * @returns Findings/verdict/revision/role, or null when absent/unreadable.
   */
  protected _readDiskReview(ref: string): {
    findings: MrDetail['findings'];
    verdict: string;
    revision: number;
    role: MrCard['role'];
  } | null {
    try {
      const file = join(mrReportsDir(this._stateDir, this._storedRef(ref)), 'review.json');
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
      logger.warn('[BoardProviderDisk#_readDiskReview] [reading → degraded]', {
        ref,
        error: String(cause),
      });
      return null;
    }
  }

  /**
   * @purpose Build a minimal legacy MrCard for one reviewed MR from `review.json` + `context.json`.
   * @param ref MR `project!iid` composite key.
   * @param fallbackWebUrl webUrl to use when `context.json` is absent or lacks one.
   * @returns MrCard populated from whatever disk fields exist, safe fallbacks otherwise.
   */
  protected _buildCard(ref: string, fallbackWebUrl: string): MrCard {
    const disk = this._readDiskReview(ref);
    const context = readDiskContext(this._stateDir, ref);
    const bang = ref.lastIndexOf('!');
    return {
      project: bang > 0 ? ref.slice(0, bang) : '',
      iid: bang > 0 ? Number(ref.slice(bang + 1)) || 0 : 0,
      webUrl: context?.webUrl ?? fallbackWebUrl,
      title: context?.title ?? ref,
      description: context?.description ?? '',
      author: context?.author ?? '',
      reviewers: context?.reviewers ?? [],
      approvedBy: [],
      updatedAt: context?.updatedAt ?? '',
      draft: false,
      state: 'opened',
      role: disk?.role ?? null,
      events: [],
      directlyAddressed: false,
      todoIds: [],
      stage: 'review_needed',
      sourceBranch: context?.sourceBranch ?? '',
      targetBranch: context?.targetBranch ?? '',
    } as MrCard;
  }

  /**
   * @returns Board data scanned from every reviewed MR on disk — one `reviewer` lane, `done` only.
   * @see {BoardProviderPort#getBoard}
   */
  getBoard(): BoardData {
    const cards = listReviewedRefs(this._stateDir).map((ref) => this._buildCard(ref, ''));
    const roles: RoleView[] = [
      {
        name: 'reviewer',
        active: true,
        lanes: { inbox: [], inProgress: [], awaitingMe: [], done: cards },
      },
    ];
    return { roles, unassigned: [] };
  }

  /**
   * @param mrId Role name — unused, view-only provider never assigns.
   * @param _role Target role name.
   * @param [_rights] Optional access rights (unused).
   * @returns Always `{ ok: false }` — this provider is read-only.
   * @see {BoardProviderPort#assignMr}
   */
  assignMr(mrId: string, _role: string, _rights?: Record<string, unknown>): { ok: boolean } {
    void mrId;
    void _role;
    void _rights;
    return { ok: false };
  }

  /**
   * @param role Role name (unused).
   * @param active Desired activation state (unused).
   * @returns Always `{ ok: false }` — this provider is read-only.
   * @see {BoardProviderPort#setRoleActive}
   */
  setRoleActive(role: string, active: boolean): { ok: boolean } {
    void role;
    void active;
    return { ok: false };
  }

  /**
   * @param mrId MR identifier (unused).
   * @param action Action payload (unused).
   * @returns Always `{ ok: false }` — this provider is read-only.
   * @see {BoardProviderPort#executeAction}
   */
  executeAction(
    mrId: string,
    action: { questionId: string; choice: string; payload?: unknown }
  ): { ok: boolean } {
    void mrId;
    void action;
    return { ok: false };
  }

  /**
   * @param mrId MR identifier (webUrl or `project!iid`).
   * @returns MrDetail read from disk, or null when no `report/review.json` exists for this MR.
   * @see {BoardProviderPort#getReport}
   */
  getReport(mrId: string): MrDetail | null {
    const ref = this._normalizeRef(mrId);
    const disk = this._readDiskReview(ref);
    if (!disk) return null;
    logger.info('[BoardProviderDisk#getReport] [disk → served]', {
      mrId,
      ref,
      findings: disk.findings.length,
      revision: disk.revision,
    });
    return {
      mr: this._buildCard(ref, mrId),
      findings: disk.findings,
      verdict: disk.verdict,
      audit: [],
      revision: disk.revision,
    };
  }

  /**
   * @param mrId MR identifier (unused) — no audit log to append to in the view-only path.
   * @returns Always null — this provider is read-only and records nothing.
   * @see {BoardProviderPort#recordFixTaskCopy}
   */
  async recordFixTaskCopy(mrId: string): Promise<FixTaskCopyResult | null> {
    void mrId;
    return null;
  }

  /**
   * @param mrId MR identifier — `project!iid`.
   * @returns ArtifactRef[] for every known top-level report file plus `tasks/*.task.md` that exist
   *   on disk; empty array when the MR has no materialized report dir yet.
   * @see {BoardProviderPort#listArtifacts}
   */
  listArtifacts(mrId: string): ArtifactRef[] {
    const ref = this._normalizeRef(mrId);
    const dir = mrReportsDir(this._stateDir, this._storedRef(ref));
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
      return refs.sort((left, right) => left.path.localeCompare(right.path));
    } catch (cause) {
      logger.warn('[BoardProviderDisk#listArtifacts] [reading-report-tree → degraded]', {
        mrId,
        error: String(cause),
      });
      return refs;
    }
  }

  /**
   * @param mrId MR identifier — `project!iid`.
   * @param path Artifact path relative to `report/`.
   * @returns ArtifactContent read from disk, or null if unsafe, missing, or unreadable.
   * @see {BoardProviderPort#readArtifact}
   */
  readArtifact(mrId: string, path: string): ArtifactContent | null {
    if (!isSafeArtifactPath(path)) return null;

    const ref = this._normalizeRef(mrId);
    const filePath = join(mrReportsDir(this._stateDir, this._storedRef(ref)), path);
    if (!existsSync(filePath)) return null;

    try {
      const content = readFileSync(filePath, 'utf-8');
      return { content, kind: deriveArtifactKind(path) };
    } catch (cause) {
      logger.error('[BoardProviderDisk#readArtifact] [reading → failed]', {
        mrId,
        path,
        error: String(cause),
      });
      return null;
    }
  }
}
