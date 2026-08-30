// @file: Resolve a ticket's audit group — every ticket owned by one exact spec — and bound its git changes for `sdd-task --audit-group` / `--group-scope`.
// @consumers: sdd-task.cmd
// @tasks: N/A

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { inspectRepoPath } from '../common/repo-path.ts';
import { extractSection } from './section.ts';
import { parsePhasesOverview, parsePhaseDetail } from './ticket.ts';
import {
  isTicket,
  parsePhaseHandoffs,
  parseHandoffArtifacts,
  ticketRef,
  type TicketRef,
} from './check.ts';
import { readHeadContent } from '../common/changed-files.ts';
import { looksLikeTaskId } from './task-id.ts';

// A v2 ticket filename: `<name>.task.<ID>.md` — `<name>` is the scope or module name that also
// names the owning spec file (`<name>.spec.md`), same directory (AX_TASK_RESOLUTION's own convention).
const V2_TASK_TICKET_NAME = /^(.+)\.task\.[^/\\]+\.md$/;
const AUDIT_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '__tests__',
]);

/**
 * @purpose Outcome of resolving a ticket's owning spec from its filename convention.
 * @invariant `spec-missing` still carries `specPath` — the path the caller should have created.
 */
export type SpecResolution =
  | { ok: true; specPath: string }
  | { ok: false; reason: 'not-v2-ticket-name' }
  | { ok: false; reason: 'spec-missing'; specPath: string };

/**
 * @purpose Derive a ticket's owning spec path from its filename (`<name>.task.<ID>.md` → `<name>.spec.md`, same dir).
 * @param ticketPath Absolute or relative ticket file path.
 * @returns The resolved spec path, or why it could not be resolved.
 */
export function resolveOwningSpec(ticketPath: string): SpecResolution {
  const m = V2_TASK_TICKET_NAME.exec(basename(ticketPath));
  if (!m?.[1]) return { ok: false, reason: 'not-v2-ticket-name' };
  const specPath = join(dirname(ticketPath), `${m[1]}.spec.md`);
  if (!existsSync(specPath)) return { ok: false, reason: 'spec-missing', specPath };
  return { ok: true, specPath };
}

/**
 * @purpose Select every ticket owned by one exact spec — the audit-group boundary.
 * @invariant Group = tickets whose `<name>.task.*.md` filename resolves to this exact
 *   `<name>.spec.md`; co-located tickets for another spec are never siblings.
 * @param specPath The owning spec's path.
 * @param refs Every ticket ref in the project (e.g. from `collectTicketRefs`).
 * @returns The group's tickets, sorted by file path for a stable, deterministic listing.
 */
export function collectGroupRefs(specPath: string, refs: TicketRef[]): TicketRef[] {
  const canonicalSpec = canonicalPath(specPath);
  return refs
    .filter((r) => {
      const owner = resolveOwningSpec(r.file);
      return owner.ok && canonicalPath(owner.specPath) === canonicalSpec;
    })
    .sort((a, b) => resolve(a.file).localeCompare(resolve(b.file)));
}

/** @purpose Canonical identity of a file, including a stable fallback for a deleted/missing path. */
function canonicalPath(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync(abs);
  } catch {
    return abs;
  }
}

/** @purpose Normalize an absolute or repo-relative path into a slash-separated repo path. */
function repoPath(root: string, p: string): string | null {
  const rel = relative(resolve(root), resolve(root, p));
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) return null;
  return rel.split(sep).join('/');
}

/** @purpose A fail-closed snapshot of every v2-named ticket needed for group isolation. */
type TicketCorpusResult =
  | { ok: true; refs: TicketRef[]; contents: ReadonlyMap<string, string> }
  | { ok: false; file: string; detail: string };

function collectTicketCorpus(root: string): TicketCorpusResult {
  const refs: TicketRef[] = [];
  const contents = new Map<string, string>();
  let failure: Extract<TicketCorpusResult, { ok: false }> | null = null;

  function walk(dir: string): void {
    if (failure) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (cause) {
      failure = {
        ok: false,
        file: dir,
        detail: `ticket corpus directory is unreadable: ${cause instanceof Error ? cause.message : String(cause)}`,
      };
      return;
    }
    for (const entry of entries) {
      if (failure || entry.name.startsWith('.') || AUDIT_SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        if (V2_TASK_TICKET_NAME.test(entry.name)) {
          failure = { ok: false, file: full, detail: 'v2 ticket corpus contains a symlink' };
        }
        continue;
      }
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !V2_TASK_TICKET_NAME.test(entry.name)) continue;
      let content: string;
      try {
        content = readFileSync(full, 'utf-8');
      } catch (cause) {
        failure = {
          ok: false,
          file: full,
          detail: `v2 ticket is unreadable: ${cause instanceof Error ? cause.message : String(cause)}`,
        };
        continue;
      }
      if (!isTicket(content)) {
        failure = {
          ok: false,
          file: full,
          detail: 'v2-named ticket has no readable ticket structure',
        };
        continue;
      }
      const absolute = resolve(full);
      contents.set(absolute, content);
      refs.push(ticketRef(absolute, content));
    }
  }

  walk(resolve(root));
  return failure ?? { ok: true, refs, contents };
}

function existingReviewPath(
  root: string,
  raw: string,
  required: boolean
): { ok: true; relative: string } | { ok: false; detail: string } {
  const inspected = inspectRepoPath(root, raw, required ? 'file' : 'potential');
  if (!inspected.ok) return inspected;
  if (required) {
    try {
      readFileSync(inspected.absolute);
    } catch {
      return { ok: false, detail: 'path is unreadable' };
    }
  }
  return { ok: true, relative: inspected.relative };
}

/** @purpose Optional phase slice for reusing review-path validation at pre-dispatch time. */
type TicketReviewPathSelection = {
  /** @purpose Current phase sections whose Target paths must be proven. */
  phaseIds: readonly string[];
  /** @purpose Phase sections whose tombstones may explain absent prior Handoff artifacts. */
  deletedPhaseIds?: readonly string[];
  /** @purpose Completed prior phases whose structured Handoff artifacts must be proven. */
  handoffPhaseIds: readonly string[];
};

/**
 * @purpose Validate one selected ticket's Target/Deleted/Handoff review evidence.
 * @invariant Exact paths only; lexical and canonical containment agree; missing paths require a
 *   Deleted Files declaration plus a readable HEAD baseline.
 * @param root Absolute repository root.
 * @param content Selected ticket markdown from the corpus snapshot.
 * @param [selection] Exact current/prior phase slice; omitted means the whole ticket for group review.
 * @returns Normalized paths or the first teaching failure.
 */
export function validateTicketReviewPaths(
  root: string,
  content: string,
  selection?: TicketReviewPathSelection
):
  | { ok: true; paths: { targets: string[]; deleted: string[]; handoffs: string[] } }
  | { ok: false; path: string; detail: string } {
  const overview = extractSection(content, 'PHASES_OVERVIEW');
  const phases = overview.status === 'ok' ? parsePhasesOverview(overview.content) : [];
  const selectedPhaseIds = new Set(selection?.phaseIds ?? phases.map((phase) => phase.id));
  if (selection) {
    const missing = selection.phaseIds.find(
      (phaseId) => extractSection(content, `PHASE_${phaseId}`).status !== 'ok'
    );
    if (missing) {
      return {
        ok: false,
        path: `PHASE_${missing}`,
        detail: 'current phase section is missing or unreadable',
      };
    }
  }
  const phaseDetails = phases
    .filter((phase) => selectedPhaseIds.has(phase.id))
    .flatMap((phase) => {
      const section = extractSection(content, `PHASE_${phase.id}`);
      return section.status === 'ok' ? [parsePhaseDetail(section.content)] : [];
    });
  const deletedPhaseIds = new Set(selection?.deletedPhaseIds ?? selectedPhaseIds);
  const deletedPhaseDetails = phases
    .filter((phase) => deletedPhaseIds.has(phase.id))
    .flatMap((phase) => {
      const section = extractSection(content, `PHASE_${phase.id}`);
      return section.status === 'ok' ? [parsePhaseDetail(section.content)] : [];
    });
  const targets: string[] = [];
  for (const detail of phaseDetails) {
    for (const raw of detail.targetFiles) {
      const validated = existingReviewPath(root, raw, true);
      if (!validated.ok) return { ok: false, path: raw, detail: `Target File ${validated.detail}` };
      if (!targets.includes(validated.relative)) targets.push(validated.relative);
    }
  }

  const deleted: string[] = [];
  const deletedClaims: string[] = [];
  for (const detail of deletedPhaseDetails) {
    for (const file of detail.deletedFiles) {
      if (!deletedClaims.includes(file)) deletedClaims.push(file);
    }
  }
  for (const raw of deletedClaims) {
    const inspected = inspectRepoPath(root, raw, 'missing');
    if (!inspected.ok) return { ok: false, path: raw, detail: `Deleted File ${inspected.detail}` };
    const baseline = readHeadContent(root, inspected.relative);
    if (baseline.status !== 'ok') {
      const detail =
        baseline.status === 'error'
          ? `Deleted File VCS baseline failed (${baseline.operation}, exit ${baseline.exitCode ?? 'spawn'}): ${baseline.stderr || 'no stderr'}`
          : 'Deleted File has no tracked HEAD baseline';
      return { ok: false, path: raw, detail };
    }
    if (!deleted.includes(inspected.relative)) deleted.push(inspected.relative);
  }

  const handoffs: string[] = [];
  const handoffArtifacts = selection
    ? (() => {
        const log = extractSection(content, 'EXECUTION_LOG');
        if (log.status !== 'ok') return [];
        const lines = parsePhaseHandoffs(log.content);
        return selection.handoffPhaseIds.flatMap((phase) =>
          lines[phase] ? parseHandoffArtifacts(lines[phase]) : []
        );
      })()
    : ticketHandoffArtifacts(content);
  for (const raw of handoffArtifacts) {
    const lexical = inspectRepoPath(root, raw, 'potential');
    if (!lexical.ok) return { ok: false, path: raw, detail: `Handoff artifact ${lexical.detail}` };
    const inspected = inspectRepoPath(
      root,
      raw,
      deleted.includes(lexical.relative) ? 'missing' : 'file'
    );
    if (!inspected.ok)
      return { ok: false, path: raw, detail: `Handoff artifact ${inspected.detail}` };
    if (!deleted.includes(inspected.relative)) {
      try {
        readFileSync(inspected.absolute);
      } catch {
        return { ok: false, path: raw, detail: 'Handoff artifact path is unreadable' };
      }
    }
    if (!handoffs.includes(inspected.relative)) handoffs.push(inspected.relative);
  }
  return { ok: true, paths: { targets, deleted, handoffs } };
}

/**
 * @purpose Validate a foreign ticket target claim for isolation without requiring future files to exist yet.
 * @param root Absolute repository root.
 * @param content Foreign ticket markdown from the corpus snapshot.
 * @returns Normalized target claims or the first containment failure.
 */
export function validateTicketTargetClaims(
  root: string,
  content: string
): { ok: true; targets: string[] } | { ok: false; path: string; detail: string } {
  const targets: string[] = [];
  for (const raw of ticketTargetFiles(content)) {
    const validated = existingReviewPath(root, raw, false);
    if (!validated.ok) return { ok: false, path: raw, detail: `Target File ${validated.detail}` };
    if (!targets.includes(validated.relative)) targets.push(validated.relative);
  }
  return { ok: true, targets };
}

/** @purpose Whether two repo directories overlap by ancestry (including equality). */
function rootsOverlap(left: string, right: string): boolean {
  if (left === '.' || right === '.') return true;
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

/**
 * @purpose Bound a repository-wide dirty-file list to one audit group without losing its newly
 *   created, not-yet-declared helpers in a group-private target directory.
 * @invariant Exact selected targets and the selected spec/tickets are always included; undeclared
 *   neighbours are included only below a target directory that no other ticket claims or overlaps.
 * @param root Absolute repository root.
 * @param changedFiles Repo-relative changed/deleted/untracked paths from git.
 * @param specPath Exact owning spec of the selected group.
 * @param group Selected sibling ticket refs.
 * @param targetFiles Union of the selected tickets' declared Target Files.
 * @param allTicketTargets Target claims for every readable ticket in the repository.
 * @returns Changed paths attributable to this group, preserving git order.
 */
export function boundGroupChangedFiles(
  root: string,
  changedFiles: string[],
  specPath: string,
  group: TicketRef[],
  targetFiles: string[],
  allTicketTargets: ReadonlyMap<string, readonly string[]>
): string[] {
  const selectedTicketPaths = new Set(group.map((ref) => canonicalPath(ref.file)));
  const exact = new Set<string>();
  const normalizedSpec = repoPath(root, specPath);
  if (normalizedSpec) exact.add(normalizedSpec);
  for (const ticket of group) {
    const normalized = repoPath(root, ticket.file);
    if (normalized) exact.add(normalized);
  }

  const selectedTargets = targetFiles
    .map((file) => repoPath(root, file))
    .filter((file): file is string => file !== null);
  for (const file of selectedTargets) exact.add(file);

  // A root-level target (e.g. package.json) never grants the whole repository as an implicit
  // neighbour surface. Root siblings must be declared exactly.
  const selectedRoots = [
    ...new Set(selectedTargets.map((file) => dirname(file)).filter((dir) => dir !== '.')),
  ];
  const foreignRoots = new Set<string>();
  for (const [ticketPath, files] of allTicketTargets) {
    if (selectedTicketPaths.has(canonicalPath(ticketPath))) continue;
    for (const file of files) {
      const normalized = repoPath(root, file);
      if (normalized) foreignRoots.add(dirname(normalized));
    }
  }
  const privateRoots = selectedRoots.filter(
    (selected) => ![...foreignRoots].some((foreign) => rootsOverlap(selected, foreign))
  );

  return changedFiles.filter((file) => {
    const normalized = repoPath(root, file);
    if (!normalized) return false;
    if (exact.has(normalized)) return true;
    return privateRoots.some((dir) => normalized.startsWith(`${dir}/`));
  });
}

/**
 * @purpose Full resolution of a CLI ticket argument to its audit group (AX_TASK_RESOLUTION + exact owning-spec boundary).
 * @invariant `allRefs` is the one project-wide scan reused for both grouping and any dependent pickable-check — never re-scanned.
 */
export type AuditGroupResolution =
  | {
      ok: true;
      ticketPath: string;
      specPath: string;
      group: TicketRef[];
      allRefs: TicketRef[];
      ticketContents: ReadonlyMap<string, string>;
    }
  | { ok: false; reason: 'unreadable' }
  | { ok: false; reason: 'unknown-id'; id: string; refs: TicketRef[] }
  | { ok: false; reason: 'ambiguous-id'; id: string; matches: TicketRef[] }
  | { ok: false; reason: 'not-v2-ticket-name'; ticketPath: string }
  | { ok: false; reason: 'spec-missing'; ticketPath: string; specPath: string }
  | { ok: false; reason: 'ticket-corpus-unreadable'; file: string; detail: string }
  | { ok: false; reason: 'path-invalid'; file: string; detail: string };

/**
 * @purpose Resolve a CLI ticket argument (path or Task-ID) to its full audit group.
 * @param ticketArg Raw CLI argument — a ticket path or a bare Task-ID.
 * @param root Absolute project root (scanned once for both Task-ID resolution and grouping).
 * @returns The group + the spec it belongs to, or a typed failure reason.
 */
export function resolveAuditGroup(ticketArg: string, root: string): AuditGroupResolution {
  const projectRoot = canonicalPath(root);
  const corpus = collectTicketCorpus(projectRoot);
  if (!corpus.ok)
    return {
      ok: false,
      reason: 'ticket-corpus-unreadable',
      file: corpus.file,
      detail: corpus.detail,
    };

  const directPath = canonicalPath(resolve(ticketArg));
  let ticketPath: string;
  if (corpus.contents.has(directPath)) {
    ticketPath = directPath;
  } else if (looksLikeTaskId(ticketArg)) {
    const matches = corpus.refs.filter((ref) => ref.taskId === ticketArg);
    if (matches.length === 0)
      return { ok: false, reason: 'unknown-id', id: ticketArg, refs: corpus.refs };
    if (matches.length > 1) return { ok: false, reason: 'ambiguous-id', id: ticketArg, matches };
    ticketPath = canonicalPath((matches[0] as TicketRef).file);
  } else {
    try {
      readFileSync(directPath, 'utf-8');
      ticketPath = directPath;
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
  }

  const ticketRel = relative(projectRoot, ticketPath);
  if (
    !ticketRel ||
    ticketRel === '..' ||
    ticketRel.startsWith(`..${sep}`) ||
    isAbsolute(ticketRel)
  ) {
    return {
      ok: false,
      reason: 'path-invalid',
      file: ticketPath,
      detail: 'selected ticket is outside the repository',
    };
  }

  const specRes = resolveOwningSpec(ticketPath);
  if (!specRes.ok) {
    return specRes.reason === 'not-v2-ticket-name'
      ? { ok: false, reason: 'not-v2-ticket-name', ticketPath }
      : {
          ok: false,
          reason: 'spec-missing',
          ticketPath,
          specPath: specRes.specPath,
        };
  }

  const specClaim = existingReviewPath(projectRoot, relative(projectRoot, specRes.specPath), true);
  if (!specClaim.ok) {
    return {
      ok: false,
      reason: 'path-invalid',
      file: specRes.specPath,
      detail: `owning spec ${specClaim.detail}`,
    };
  }
  const selectedContent = corpus.contents.get(ticketPath);
  if (selectedContent === undefined) {
    return {
      ok: false,
      reason: 'ticket-corpus-unreadable',
      file: ticketPath,
      detail: 'selected ticket disappeared or changed type while the group snapshot was built',
    };
  }
  return {
    ok: true,
    ticketPath,
    specPath: specRes.specPath,
    group: collectGroupRefs(specRes.specPath, corpus.refs),
    allRefs: corpus.refs,
    ticketContents: corpus.contents,
  };
}

/**
 * @purpose Union every phase's `Target Files` across a ticket's whole Phases Overview — the ticket's own review-scope contribution.
 * @param content Full ticket markdown.
 * @returns Target file paths, first-seen order, deduplicated.
 */
export function ticketTargetFiles(content: string): string[] {
  const ovSec = extractSection(content, 'PHASES_OVERVIEW');
  const phases = ovSec.status === 'ok' ? parsePhasesOverview(ovSec.content) : [];
  const seen = new Set<string>();
  const files: string[] = [];
  for (const p of phases) {
    const sec = extractSection(content, `PHASE_${p.id}`);
    if (sec.status !== 'ok') continue;
    for (const f of parsePhaseDetail(sec.content).targetFiles) {
      if (seen.has(f)) continue;
      seen.add(f);
      files.push(f);
    }
  }
  return files;
}

// STRUCTURAL ownership only — an explicit `Entities:`/`Provides:`/`Implements:`/`Entity:` field
// declares the entity (the primary, filename-independent source, since `FooService` may live in
// `foo-service.ts`), OR a parsed Target File path names it. NOT a prose scan: "do not implement Foo"
// never owns.
/**
 * @purpose Whether a ticket STRUCTURALLY owns an entity (see the note above for the exact rule).
 * @param content Full ticket markdown.
 * @param entityName The declared entity the deferral marker cites.
 * @returns True when the ticket's structure claims the entity.
 */
export function ticketOwnsEntity(content: string, entityName: string): boolean {
  const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const word = new RegExp(`\\b${escaped}\\b`);
  // (1) explicit declaration field — the canonical, filename-independent source.
  const fieldRe =
    /^[\s>*-]*(?:\*\*)?(?:Entities|Provides|Implements|Entity)(?:\*\*)?\s*:\s*(.+)$/gim;
  for (const m of content.matchAll(fieldRe)) {
    if (m[1] && word.test(m[1])) return true;
  }
  // (2) a parsed Target File path that names the entity (a convenience when file == entity name).
  return ticketTargetFiles(content).some((f) => word.test(f));
}

/**
 * @purpose Union every phase's Handoff `artifacts:` list from a ticket's Execution Log.
 * @param content Full ticket markdown.
 * @returns Artifact paths, first-seen order, deduplicated.
 */
export function ticketHandoffArtifacts(content: string): string[] {
  const logSec = extractSection(content, 'EXECUTION_LOG');
  if (logSec.status !== 'ok') return [];
  const seen = new Set<string>();
  const files: string[] = [];
  for (const line of Object.values(parsePhaseHandoffs(logSec.content))) {
    for (const a of parseHandoffArtifacts(line)) {
      if (seen.has(a)) continue;
      seen.add(a);
      files.push(a);
    }
  }
  return files;
}
