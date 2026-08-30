// @file: Deterministic publication-set derivation for one bounded SDD review bundle.
// @consumers: SddCheckCommand
// @tasks: N/A

import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  getChangedFiles,
  readHeadContent,
  type GitCommandError,
} from '../../../shared/common/changed-files.ts';
import {
  checkPortal,
  checkResearchLifecycle,
  findRegisteredResearchLinks,
} from '../../../shared/sdd/check.ts';
import { extractSection } from '../../../shared/sdd/section.ts';
import { parseGraphEdges, parseScopes } from '../../../shared/sdd/portal.ts';
import { parseTrackerRows } from '../../../shared/sdd/tracker.ts';

/** @purpose A path role in the exact VCS publication set; critic membership remains separate. */
export type ReviewPublicationRole =
  | 'spec'
  | 'research'
  | 'portal'
  | 'project-index'
  | 'scope-index'
  | 'module-index'
  | 'session-ignore';

type ReviewPublicationAuxiliaryRole = Exclude<ReviewPublicationRole, 'spec' | 'research'>;

/** @purpose One repository-relative publication path with its mechanically proven role. */
export type ReviewPublicationEntry = {
  /** @purpose Why this changed path belongs to the bounded design change. */
  role: ReviewPublicationRole;
  /** @purpose Canonical repository-relative regular-file path. */
  path: string;
};

/** @purpose One spec member already resolved by the review-state command. */
export type ReviewPublicationMember = {
  /** @purpose Canonical repository-relative spec path. */
  path: string;
  /** @purpose Current review-state bytes. */
  content: string;
};

/** @purpose Typed result: exact set, actionable evidence failure, or preserved git failure. */
type ReviewPublicationResult =
  | {
      ok: true;
      entries: ReviewPublicationEntry[];
      fingerprint: string;
    }
  | { ok: false; reason: string }
  | { ok: false; git: GitCommandError };

type ReadRepoFile = { ok: true; content: string } | { ok: false; reason: string };
type HeadContent =
  | { ok: true; status: 'ok' | 'missing' | 'no-head'; content: string }
  | { ok: false; git: GitCommandError };

const RESEARCH_SECTIONS = [
  'STATUS',
  'PROBLEM',
  'CRITERIA',
  'OPTIONS',
  'DECISION',
  'FINAL_DISPOSITION',
  'CONSEQUENCES',
  'EVIDENCE',
  'RELATED',
] as const;

const INDEX_HEADINGS: Record<'project-index' | 'scope-index' | 'module-index', string[]> = {
  'project-index': [
    'Entry Points',
    'Project-Wide Conventions (declared once, inherited)',
    'Cross-Scope DAG',
    'Scope Tracker',
  ],
  'scope-index': ['Scope Spec', 'Cascade Table', 'Inter-Module DAG', 'Tracker'],
  'module-index': ['Tracker Index', 'Slug Registry', 'Intra-Module DAG', 'Conventions'],
};

const RESEARCH_FILE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.research\.md$/;
const INDEX_PLACEHOLDER = /<(?:scope|module|ACR(?:ONYM)?|slug|title|deps|date|N)(?:[ >-])/i;

/** @purpose Normalize Node path separators for stable CLI output and comparisons. */
function slash(path: string): string {
  return path.split(sep).join('/');
}

/** @purpose Locale-independent byte ordering for reproducible manifests on every operator host. */
function comparePath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** @purpose Reject a path that cannot be a canonical repository-relative publication member. */
function invalidRepoPath(path: string): string | null {
  if (!path || isAbsolute(path) || path.includes('\\') || path.includes('\0')) {
    return 'must be a non-empty repository-relative path using `/` separators';
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return 'must not contain empty, `.` or `..` segments';
  }
  return null;
}

/** @purpose Prove every path component is non-symlink and the leaf is a readable regular file. */
function readRepoFile(repoRoot: string, relPath: string): ReadRepoFile {
  const invalid = invalidRepoPath(relPath);
  if (invalid) return { ok: false, reason: `path \`${relPath}\` ${invalid}.` };

  const root = resolve(repoRoot);
  const absolute = resolve(root, relPath);
  const escaped = relative(root, absolute);
  if (escaped.startsWith('..') || isAbsolute(escaped)) {
    return { ok: false, reason: `path \`${relPath}\` resolves outside the repository.` };
  }

  let cursor = root;
  try {
    for (const segment of relPath.split('/')) {
      cursor = join(cursor, segment);
      if (lstatSync(cursor).isSymbolicLink()) {
        return {
          ok: false,
          reason: `path \`${relPath}\` traverses a symlink at \`${slash(relative(root, cursor))}\`.`,
        };
      }
    }
    if (!lstatSync(absolute).isFile()) {
      return { ok: false, reason: `path \`${relPath}\` is not a regular file.` };
    }
    const realRoot = realpathSync(root);
    const realFile = realpathSync(absolute);
    const realRel = relative(realRoot, realFile);
    if (realRel.startsWith('..') || isAbsolute(realRel)) {
      return { ok: false, reason: `path \`${relPath}\` resolves outside the repository.` };
    }
    return { ok: true, content: readFileSync(absolute, 'utf-8') };
  } catch (cause) {
    return {
      ok: false,
      reason: `path \`${relPath}\` is missing or unreadable: ${cause instanceof Error ? cause.message : String(cause)}.`,
    };
  }
}

/** @purpose Read HEAD bytes without losing the changed-files helper's typed git failure. */
function headContent(repoRoot: string, relPath: string): HeadContent {
  const head = readHeadContent(repoRoot, relPath);
  if (head.status === 'error') return { ok: false, git: head };
  return {
    ok: true,
    status: head.status,
    content: head.status === 'ok' ? head.content : '',
  };
}

/** @purpose Scope id mechanically owned by a canonical spec path beneath `specs/<scope>/`. */
function scopeOfSpec(path: string): string | null {
  const match = /^specs\/([^/]+)\/(.+)\.spec\.md$/.exec(path);
  return match?.[1] ?? null;
}

/** @purpose Resolve a registered research link while rejecting absolute/traversal/non-canonical paths. */
function resolveResearchLink(
  repoRoot: string,
  member: ReviewPublicationMember,
  rawTarget: string
): { ok: true; path: string; content: string } | { ok: false; reason: string } {
  if (
    !rawTarget ||
    isAbsolute(rawTarget) ||
    rawTarget.includes('\\') ||
    rawTarget.includes('\0') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(rawTarget) ||
    rawTarget.split('/').includes('..')
  ) {
    return {
      ok: false,
      reason: `research link \`${rawTarget}\` in \`${member.path}\` must be relative and contain no absolute/URL/\`..\` path.`,
    };
  }

  const absolute = resolve(repoRoot, dirname(member.path), rawTarget);
  const relPath = slash(relative(repoRoot, absolute));
  const scope = scopeOfSpec(member.path);
  if (!scope || !relPath.startsWith(`specs/${scope}/research/`)) {
    return {
      ok: false,
      reason: `research link \`${rawTarget}\` in \`${member.path}\` is outside its canonical \`specs/${scope ?? '<scope>'}/research/\` directory.`,
    };
  }
  if (!RESEARCH_FILE.test(basename(relPath))) {
    return {
      ok: false,
      reason: `research path \`${relPath}\` is not canonical \`YYYY-MM-DD-<slug>.research.md\`.`,
    };
  }

  const file = readRepoFile(repoRoot, relPath);
  if (!file.ok) return file;
  const missing = RESEARCH_SECTIONS.filter(
    (section) => extractSection(file.content, section).status !== 'ok'
  );
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `research path \`${relPath}\` is missing canonical section(s): ${missing.join(', ')}.`,
    };
  }
  const lifecycle = checkResearchLifecycle(relPath, file.content).filter(
    (finding) => finding.severity === 'error'
  );
  if (lifecycle.length > 0) {
    return {
      ok: false,
      reason: `research path \`${relPath}\` has invalid lifecycle content: ${lifecycle.map((finding) => finding.code).join(', ')}.`,
    };
  }
  return { ok: true, path: relPath, content: file.content };
}

/** @purpose Recognize one data row of the portal Scopes table. */
function portalRowScope(line: string): string | null {
  if (!line.trim().startsWith('|')) return null;
  return /\[`([^`]+)`\]\([^)]+\)/.exec(line)?.[1] ?? null;
}

/** @purpose True when a Mermaid node/edge line mentions one attributable scope as an exact id. */
function graphLineAttributed(line: string, scopes: Set<string>): boolean {
  if (
    !line.includes('-->') &&
    !line.includes('.->') &&
    !/^\s*[A-Za-z0-9_-]+(?:\[|\s*$)/.test(line)
  ) {
    return false;
  }
  return [...scopes].some((scope) =>
    new RegExp(
      `(^|[^A-Za-z0-9_-])${scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_-]|$)`
    ).test(line)
  );
}

/** @purpose Remove only portal rows/graph lines owned by the reviewed scopes for exact remainder comparison. */
function stripPortalAttributable(content: string, scopes: Set<string>): string {
  let section = '';
  let inMermaid = false;
  const kept: string[] = [];
  for (const line of content.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line.trim());
    if (heading) {
      section = heading[1] ?? '';
      inMermaid = false;
    }
    if (section === 'Scopes') {
      const scope = portalRowScope(line);
      if (scope && scopes.has(scope)) continue;
    }
    if (section === 'Scope Graph') {
      if (line.trim().startsWith('```')) {
        inMermaid = !inMermaid;
      } else if (inMermaid && graphLineAttributed(line, scopes)) {
        continue;
      }
    }
    kept.push(line);
  }
  return kept.join('\n');
}

/** @purpose Names of real top-level scope specs, for the existing portal integrity core. */
function scopeSpecDirs(specsRoot: string): string[] {
  try {
    return readdirSync(specsRoot, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.')
      )
      .filter((entry) => {
        const candidate = join(specsRoot, entry.name, `${entry.name}.spec.md`);
        try {
          return lstatSync(candidate).isFile() && !lstatSync(candidate).isSymbolicLink();
        } catch {
          return false;
        }
      })
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** @purpose Validate portal structure and prove its diff is attributable only to reviewed scopes. */
function validatePortal(
  repoRoot: string,
  content: string,
  head: HeadContent,
  scopes: Set<string>,
  targetPaths: Set<string>
): string | null {
  if (!head.ok) return 'unreachable git error';
  if (!/^## Scope Graph\s*$/m.test(content) || !/^## Scopes\s*$/m.test(content)) {
    return 'portal lacks the canonical `## Scope Graph` or `## Scopes` section';
  }
  const parsed = parseScopes(content);
  if (parsed.length === 0) return 'portal Scopes table has no parseable rows';
  const portalFindings = checkPortal({
    scopes: parsed,
    edges: parseGraphEdges(content),
    specDirs: scopeSpecDirs(join(repoRoot, 'specs')),
  }).filter((finding) => finding.severity === 'error');
  if (portalFindings.length > 0) {
    return `portal integrity is red: ${portalFindings.map((finding) => finding.code).join(', ')}`;
  }

  for (const row of parsed.filter((candidate) => scopes.has(candidate.name))) {
    if (
      !row.specPath ||
      isAbsolute(row.specPath) ||
      row.specPath.includes('\\') ||
      row.specPath.split('/').includes('..')
    ) {
      return `portal row \`${row.name}\` has an unsafe or missing spec link`;
    }
    const resolved = slash(relative(repoRoot, resolve(repoRoot, 'specs', row.specPath)));
    if (!targetPaths.has(resolved)) {
      return `portal row \`${row.name}\` points outside the bounded review target-set: \`${resolved}\``;
    }
  }

  if (head.status === 'missing' || head.status === 'no-head') {
    const foreignRows = parsed.filter((row) => !scopes.has(row.name));
    if (foreignRows.length > 0) {
      return `new portal contains scope row(s) not attributable to this review: ${foreignRows.map((row) => row.name).join(', ')}`;
    }
    const foreignGraph = parseGraphEdges(content).filter(
      (edge) => !scopes.has(edge.from) || !scopes.has(edge.to)
    );
    if (foreignGraph.length > 0) return 'new portal graph contains a scope outside this review';
    return null;
  }

  if (stripPortalAttributable(content, scopes) !== stripPortalAttributable(head.content, scopes)) {
    return 'portal diff changes bytes outside attributable scope rows/graph lines';
  }
  return null;
}

/** @purpose Data rows from one named Markdown table section, first cell only. */
function tableFirstCells(content: string, heading: string): string[] {
  let active = false;
  const cells: string[] = [];
  for (const line of content.split('\n')) {
    const found = /^##\s+(.+?)\s*$/.exec(line.trim());
    if (found) {
      active = found[1] === heading;
      continue;
    }
    if (!active || !line.trim().startsWith('|')) continue;
    const first = line.trim().replace(/^\|/, '').split('|')[0]?.trim() ?? '';
    if (!first || /^[-: ]+$/.test(first) || /^(Scope|Task-ID)$/i.test(first)) continue;
    cells.push(first.replaceAll('`', ''));
  }
  return cells;
}

/** @purpose Validate a newly-created canonical task index without accepting ambiguous edits to an old one. */
function validateNewIndex(
  role: 'project-index' | 'scope-index' | 'module-index',
  path: string,
  content: string,
  scopes: Set<string>
): string | null {
  const missing = INDEX_HEADINGS[role].filter(
    (heading) =>
      !new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(content)
  );
  if (missing.length > 0) return `${role} lacks canonical heading(s): ${missing.join(', ')}`;
  if (INDEX_PLACEHOLDER.test(content)) return `${role} still contains a scaffold placeholder`;

  if (role === 'scope-index') {
    const scope = path.split('/')[1] as string;
    if (!content.includes(`](./${scope}.spec.md)`)) {
      return `scope-index does not link its exact co-located \`${scope}.spec.md\``;
    }
    if (parseTrackerRows(content).length === 0)
      return 'scope-index Tracker has no parseable task row';
  }
  if (role === 'module-index' && parseTrackerRows(content).length === 0) {
    return 'module-index Tracker Index has no parseable task row';
  }
  if (role === 'project-index') {
    const rows = tableFirstCells(content, 'Scope Tracker');
    if (rows.length === 0) return 'project-index Scope Tracker has no parseable scope row';
    const foreign = rows.filter((scope) => !scopes.has(scope));
    if (foreign.length > 0) {
      return `project-index names scope(s) outside this review: ${foreign.join(', ')}`;
    }
  }
  return null;
}

/** @purpose Prove `.gitignore` changed by exactly one new `.sdd-session.md` line and nothing else. */
function validateSessionIgnore(content: string, head: HeadContent): string | null {
  if (!head.ok) return 'unreachable git error';
  const marker = '.sdd-session.md';
  const currentLines = content.split('\n');
  const markerIndexes = currentLines
    .map((line, index) => (line === marker ? index : -1))
    .filter((index) => index >= 0);
  if (markerIndexes.length !== 1)
    return '`.gitignore` must contain exactly one `.sdd-session.md` line';
  if (head.content.split('\n').some((line) => line === marker)) {
    return '`.sdd-session.md` was already present in HEAD; another `.gitignore` change is not attributable';
  }
  currentLines.splice(markerIndexes[0] as number, 1);
  if (currentLines.join('\n') !== head.content) {
    return '`.gitignore` diff contains bytes beyond the exact `.sdd-session.md` addition';
  }
  return null;
}

/**
 * @purpose Derive the exact VCS publication set from spec manifests plus bounded, role-validated git evidence.
 * @invariant Critic target/write sets are inputs only; this function never promotes an auxiliary file into critic scope.
 * @param repoRoot Repository root anchoring git and every output path.
 * @param members Complete bounded critic target-set.
 * @param writeSetPaths Manifest-derived spec write-set.
 * @returns Stable role/path entries and their SHA-256 identity, or one fail-closed reason.
 */
export function deriveReviewPublicationSet(
  repoRoot: string,
  members: ReviewPublicationMember[],
  writeSetPaths: string[]
): ReviewPublicationResult {
  const changed = getChangedFiles(repoRoot);
  if (changed.status === 'error') return { ok: false, git: changed };
  const dirty = new Set(changed.files.map(slash));
  const writePaths = new Set(writeSetPaths);
  const targetPaths = new Set(members.map((member) => member.path));
  const writeMembers = members.filter((member) => writePaths.has(member.path));
  const scopes = new Set<string>();

  for (const member of writeMembers) {
    const scope = scopeOfSpec(member.path);
    if (!scope) {
      return {
        ok: false,
        reason: `spec write-set path \`${member.path}\` is not canonical under \`specs/<scope>/\`.`,
      };
    }
    scopes.add(scope);
    if (!dirty.has(member.path)) {
      return {
        ok: false,
        reason: `spec write-set path \`${member.path}\` is not changed from HEAD.`,
      };
    }
    const readable = readRepoFile(repoRoot, member.path);
    if (!readable.ok) return { ok: false, reason: readable.reason };
  }

  const researchPaths = new Map<string, string>();
  for (const member of writeMembers) {
    const scope = scopeOfSpec(member.path) as string;
    for (const rawTarget of findRegisteredResearchLinks(member.content)) {
      const resolved = resolveResearchLink(repoRoot, member, rawTarget);
      if (!resolved.ok) return { ok: false, reason: resolved.reason };
      const previous = researchPaths.get(resolved.path);
      if (previous && previous !== scope) {
        return {
          ok: false,
          reason: `research path \`${resolved.path}\` is ambiguously attributed to scopes \`${previous}\` and \`${scope}\`.`,
        };
      }
      researchPaths.set(resolved.path, scope);
    }
  }

  const roleCandidates = new Map<string, ReviewPublicationAuxiliaryRole>();
  const registerRole = (path: string, role: ReviewPublicationAuxiliaryRole): string | null => {
    const previous = roleCandidates.get(path);
    if (previous && previous !== role)
      return `path \`${path}\` has ambiguous roles \`${previous}\` and \`${role}\``;
    roleCandidates.set(path, role);
    return null;
  };
  registerRole('specs/README.md', 'portal');
  registerRole('specs/3-tasks.md', 'project-index');
  registerRole('.gitignore', 'session-ignore');
  for (const scope of scopes) registerRole(`specs/${scope}/${scope}.3-tasks.md`, 'scope-index');
  for (const member of writeMembers) {
    const scope = scopeOfSpec(member.path) as string;
    if (member.path === `specs/${scope}/${scope}.spec.md`) continue;
    const conflict = registerRole(
      member.path.replace(/\.spec\.md$/, '.3-tasks.md'),
      'module-index'
    );
    if (conflict) return { ok: false, reason: conflict };
  }

  const entries: ReviewPublicationEntry[] = writeSetPaths.map((path) => ({ role: 'spec', path }));
  for (const path of [...researchPaths.keys()].sort(comparePath)) {
    if (dirty.has(path)) entries.push({ role: 'research', path });
  }

  for (const [path, role] of [...roleCandidates.entries()].sort(([a], [b]) => comparePath(a, b))) {
    if (!dirty.has(path)) continue;
    const current = readRepoFile(repoRoot, path);
    if (!current.ok) return { ok: false, reason: current.reason };
    const head = headContent(repoRoot, path);
    if (!head.ok) return { ok: false, git: head.git };

    let invalid: string | null = null;
    if (role === 'portal') {
      invalid = validatePortal(repoRoot, current.content, head, scopes, targetPaths);
    } else if (role === 'session-ignore') {
      invalid = validateSessionIgnore(current.content, head);
    } else {
      if (head.status === 'ok') {
        invalid = `${role} \`${path}\` already exists in HEAD; its mixed-content edit is ambiguously attributable`;
      } else {
        invalid = validateNewIndex(role, path, current.content, scopes);
      }
    }
    if (invalid) return { ok: false, reason: `${invalid}.` };
    entries.push({ role, path });
  }

  const allowed = new Set(entries.map((entry) => entry.path));
  const unrelated = [...dirty].filter((path) => !allowed.has(path)).sort(comparePath);
  if (unrelated.length > 0) {
    for (const path of unrelated) {
      const readable = readRepoFile(repoRoot, path);
      if (!readable.ok) return { ok: false, reason: readable.reason };
    }
    return {
      ok: false,
      reason: `dirty path(s) are not attributable to the bounded review publication: ${unrelated.join(', ')}.`,
    };
  }

  entries.sort((a, b) => comparePath(a.path, b.path) || comparePath(a.role, b.role));
  const serialized = JSON.stringify(entries);
  return {
    ok: true,
    entries,
    fingerprint: `sha256:${createHash('sha256').update(serialized).digest('hex')}`,
  };
}
