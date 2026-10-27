// @file: Invocation-local filesystem adapter for declaration-driven SDD coverage projections.
// @spec: SHARED
// @consumers: orient coverage, sdd-check coverage, future SDD lifecycle

import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { posix, resolve } from 'node:path';
import { inspectRepoPath } from '../common/repo-path.ts';
import { proveRepoFile, readProvenRepoFile } from '../common/repo-file-identity.ts';
import { resolveSddCoverage } from './coverage.ts';
import type {
  CoverageFinding,
  CoverageObservation,
  CoverageResult,
  CoverageSelection,
  CoverageSpec,
  CoverageStage,
  CoverageTarget,
} from './coverage.types.ts';
import { collectHeadings, extractSection } from './section.ts';
import { nextMarkdownFence, type MarkdownFence } from './markdown-fence.ts';
import { parseSpecId } from './spec-id.ts';
import { parseMetaInfo, parsePhasesOverview } from './ticket.ts';
import { ticketOwningSpecPath } from './audit-group.ts';
import { isSddSourceFile } from './source-extensions.ts';
import { parseSourceOwnershipHeader } from './source-ownership-header.ts';

/** @purpose Observable explicit adapter reads, not syscall accounting inside the host or Git. */
export type CoverageReadStats = {
  /** @purpose Successfully consumed SDD metadata files, at most once per invocation. */
  metadataReads: number;
  /** @purpose UTF-8 bytes consumed from SDD metadata. */
  metadataBytes: number;
  /** @purpose Successfully consumed selected implementation files only. */
  sourceReads: number;
  /** @purpose UTF-8 bytes consumed from implementation files. */
  sourceBytes: number;
  /** @purpose Bytes returned by one selected-path Git batch, separate from worktree source reads. */
  priorBytes: number;
};

/** @purpose Versioned read-only map; ownership consistency is never Verify execution evidence. */
export type CoverageDocument = {
  /** @purpose Stable document schema identity. */
  schema: 'sdd-coverage/1';
  /** @purpose Exact requested query, with spec paths resolved to canonical identities. */
  selection: CoverageSelection;
  /** @purpose Diagnosis of declared coverage, not a census of unclaimed repository code. */
  coverage: CoverageResult;
  /** @purpose Explicit successful adapter reads used to produce this projection. */
  reads: CoverageReadStats;
};

type Metadata = { path: string; content: string };
type ParsedTask = {
  path: string;
  task: string;
  done: boolean;
  owner: string;
  phases: { id: string; deps: string[]; writes: string[]; deletes: string[] }[];
};
const PORTAL_ID = 'PROJECT-PORTAL';
const skipped = new Set(['node_modules', '.git', 'dist', 'coverage', 'build', 'out']);
const noWriteLabels = new Set(['none', '—', '(нет — проверочная фаза)']);

function body(content: string, section: string, heading: string): string | null {
  const anchored = extractSection(content, section);
  if (anchored.status === 'ok') return anchored.content;
  if (anchored.status !== 'not_found' && anchored.status !== 'empty') return null;
  const headings = collectHeadings(content);
  const start = headings.findIndex(
    (item) => item.text.replace(/^\d+(?:\.\d+)*\.?\s+/, '').toLowerCase() === heading
  );
  if (start < 0) return '';
  const first = headings[start]!;
  const end = headings.slice(start + 1).find((item) => item.level <= first.level)?.start;
  return content.slice(first.lineEnd, end);
}

function headerIds(content: string): string[] {
  return parseSourceOwnershipHeader(content)
    .blocks.filter((block) => block.tag === 'spec')
    .map((block) => block.value.trim());
}

function visibleMarkdown(content: string): string {
  let fence: MarkdownFence | null = null;
  let comment = false;
  return content
    .split('\n')
    .map((line) => {
      if (fence !== null) {
        fence = nextMarkdownFence(line, fence);
        return '';
      }
      let visible = '';
      let offset = 0;
      while (offset < line.length) {
        if (comment) {
          const end = line.indexOf('-->', offset);
          if (end < 0) break;
          comment = false;
          offset = end + 3;
        } else {
          const start = line.indexOf('<!--', offset);
          if (start < 0) {
            visible += line.slice(offset);
            break;
          }
          visible += line.slice(offset, start);
          comment = true;
          offset = start + 4;
        }
      }
      fence = nextMarkdownFence(visible, null);
      return fence === null ? visible : '';
    })
    .join('\n');
}

function mappingLines(content: string): string[] {
  let mapping = false;
  const lines: string[] = [];
  const visible = visibleMarkdown(
    content.replace(/^[ \t]*<!--\/SECTION:FILE_STRUCTURE-->[ \t]*$/gm, '## End File Mapping')
  );
  for (const line of visible.split('\n')) {
    if (/^\s*(?:\*\*)?File Mapping:?\s*(?:\*\*)?:?\s*$/i.test(line)) {
      mapping = true;
      continue;
    }
    if (/^\s*(?:#{1,6}\s|<\/?(?:details|summary)\b)/.test(line)) mapping = false;
    if (mapping && line.trim()) lines.push(line);
  }
  return lines;
}

type CoverageIssue = (code: string, path: string, detail: string) => void;
type CoverageReader = (path: string, metadata: boolean) => string | null;

/** @purpose Decode exact inline or nested path declarations, rejecting prose instead of proving empty output. */
function phasePaths(
  content: string,
  label: 'Target Files' | 'Deleted Files',
  fail: (detail: string) => void
): string[] {
  const lines = content.split('\n');
  const field = new RegExp(`^\\s*-\\s+\\*\\*${label}:\\*\\*[ \\t]*(.*)$`);
  const indexes = lines.flatMap((line, index) => (field.test(line) ? [index] : []));
  if (indexes.length === 0) {
    if (label === 'Target Files') fail('Missing canonical Target Files field');
    return [];
  }
  if (indexes.length !== 1) {
    fail(`Duplicate ${label} fields`);
    return [];
  }
  const start = indexes[0]!;
  const inline = field.exec(lines[start]!)![1]!.trim();
  const nested: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    if (/^\s*(?:-\s+)?\*\*[^*]+\*\*|^\s*#{1,6}\s/.test(line)) break;
    const bullet = /^\s+-\s+(.+)$/.exec(line);
    if (!bullet) {
      fail(`${label} needs exact inline paths or nested path bullets`);
      return [];
    }
    nested.push(bullet[1]!.trim());
  }
  if (inline && nested.length) {
    fail(`${label} mixes inline and nested declarations`);
    return [];
  }
  const entries = inline ? [inline] : nested;
  if (entries.length === 1 && noWriteLabels.has(entries[0]!.toLowerCase())) return [];
  const paths: string[] = [];
  for (const entry of entries) {
    let remaining = entry;
    if (noWriteLabels.has(entry.toLowerCase()) || /[,;]\s*$/.test(entry)) {
      fail(`${label} mixes a no-write label or empty entry with paths`);
      return [];
    }
    while (remaining) {
      const match =
        /^(?:`([^`\r\n]+)`|([^\s`,;()]+))(?:[ \t]+\([^()\r\n]*\))?[ \t]*(?:[,;][ \t]*|$)/.exec(
          remaining
        );
      const path = match?.[1] ?? match?.[2];
      if (!match || !path || path.endsWith('/') || noWriteLabels.has(path.toLowerCase())) {
        fail(
          `${label} must list exact files; put unconditional removals in Deleted Files, not prose or directories`
        );
        return [];
      }
      paths.push(path);
      remaining = remaining.slice(match[0].length);
    }
  }
  return paths;
}

/** @purpose Enumerate only SDD metadata, preserving unsafe and failed observations. */
function readMetadata(root: string, read: CoverageReader, issue: CoverageIssue): Metadata[] {
  const metadata: Metadata[] = [];
  const directories = ['specs'];
  while (directories.length > 0) {
    const directory = directories.pop()!;
    const proof = inspectRepoPath(root, directory, 'potential', 'literal-brackets');
    if (!proof.ok) {
      issue('UNSAFE_METADATA', directory, proof.detail);
      continue;
    }
    let entries;
    try {
      entries = readdirSync(proof.absolute, { withFileTypes: true });
    } catch (cause) {
      if (directory === 'specs' && (cause as NodeJS.ErrnoException).code === 'ENOENT') continue;
      issue('READ_FAILED', directory, 'Cannot enumerate selected SDD metadata');
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || skipped.has(entry.name)) continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        issue('UNSAFE_METADATA', path, 'Symlinked SDD evidence cannot be omitted or followed');
      } else if (entry.isDirectory()) directories.push(path);
      else if (
        entry.name.endsWith('.spec.md') ||
        /\.task\.[^/]+\.md$/.test(entry.name) ||
        path === 'specs/README.md'
      ) {
        const content = read(path, true);
        if (content !== null) metadata.push({ path, content });
      }
    }
  }
  metadata.sort((a, b) => a.path.localeCompare(b.path));
  return metadata;
}

/** @purpose Adapt explicit in-memory declarations without filesystem reads or inferred ownership. */
function parseMetadata(
  metadata: readonly Metadata[],
  issue: CoverageIssue,
  selection: CoverageSelection
) {
  const specs: CoverageSpec[] = [];
  const byPath = new Map<string, string>();
  const contents = new Map<string, string>();
  for (const entry of metadata) {
    if (entry.path.endsWith('.spec.md')) {
      const parsed = parseSpecId(entry.content);
      if (parsed.status === 'absent') continue; // Read-only migration inputs are not new declarations.
      if (parsed.status !== 'valid') {
        issue('INVALID_SPEC', entry.path, 'Expected exactly one canonical SPEC_ID');
        continue;
      }
      byPath.set(entry.path, parsed.id);
      contents.set(entry.path, entry.content);
    } else if (entry.path === 'specs/README.md') {
      byPath.set(entry.path, PORTAL_ID);
      contents.set(entry.path, entry.content);
    }
  }
  const referencePath = (from: string, raw: string): string | null => {
    const pathPart = raw.replace(/^<|>$/g, '').split('#')[0] ?? '';
    if (!pathPart || /^(?:[a-z]+:|\/|[A-Za-z]:)/i.test(pathPart) || pathPart.includes('\\'))
      return null;
    const path = posix.normalize(posix.join(posix.dirname(from), pathPart));
    return byPath.has(path) ? path : null;
  };
  const reference = (from: string, raw: string): string | null => {
    const path = referencePath(from, raw);
    return path === null ? null : byPath.get(path)!;
  };
  for (const [path, content] of contents) {
    const id = byPath.get(path)!;
    const children: string[] = [];
    const structure = body(
      content,
      path === 'specs/README.md' ? 'SCOPES' : 'MODULE_MAP',
      path === 'specs/README.md' ? 'scopes' : 'module map'
    );
    if (selection.kind !== 'phase' && structure === null)
      issue('INVALID_STRUCTURE', path, 'Malformed structural section');
    else if (selection.kind !== 'phase') {
      // Dependency prose/diagrams and arbitrary links outside membership rows are not child edges.
      const membership = visibleMarkdown(structure ?? '').split(
        /^###\s+.*(?:Dependencies|Dependency|Handoff)/im
      )[0]!;
      for (const line of membership.split('\n')) {
        if (!/^\s*(?:[-*]\s+|\|)/.test(line)) continue;
        const link = /\[[^\]]+\]\((<?[^)]+\.spec\.md(?:#[^)>]*)?>?)\)/.exec(line);
        if (!link) continue;
        const child = reference(path, link[1]!);
        const childPath = posix.normalize(
          posix.join(posix.dirname(path), link[1]!.split('#')[0]!.replace(/^<|>$/g, ''))
        );
        if (!child || !childPath.startsWith(`${posix.dirname(path)}/`))
          issue(
            'UNRESOLVED_CHILD',
            path,
            `Structural member is not an exact descendant spec: ${link[1]}`
          );
        else children.push(child);
      }
    }
    const files: string[] = [];
    const fileSection = body(content, 'FILE_STRUCTURE', 'file structure');
    if (fileSection === null) issue('INVALID_MAPPING', path, 'Malformed FILE_STRUCTURE');
    else {
      for (const line of mappingLines(content)) {
        const match = /^\s*[-*]\s+`([^`]+)`\s*:\s*\S/.exec(line);
        if (!match)
          issue('INVALID_MAPPING', path, 'File Mapping entries must be - `repo/path`: purpose');
        else files.push(match[1]!);
      }
    }
    specs.push({ id, path, children: [...new Set(children)], files });
  }
  const tasks: ParsedTask[] = [];
  for (const entry of metadata.filter((item) => /\.task\.[^/]+\.md$/.test(item.path))) {
    const meta = extractSection(entry.content, 'META');
    if (meta.status === 'not_found') continue; // Existing migration reader remains separate.
    const overview = extractSection(entry.content, 'PHASES_OVERVIEW');
    if (meta.status !== 'ok' || overview.status !== 'ok') {
      issue('INVALID_TASK', entry.path, 'Expected META and PHASES_OVERVIEW');
      continue;
    }
    const parsed = parseMetaInfo(meta.content);
    const structuralOwner = ticketOwningSpecPath(entry.path);
    const owner = structuralOwner ? byPath.get(structuralOwner) : null;
    const owningFields = [
      ...visibleMarkdown(meta.content).matchAll(/^\s*(?:-\s*)?\*\*Owning Spec:\*\*[ \t]*(.*)$/gm),
    ];
    const explicitOwner = owningFields[0]
      ? /^\[[^\]]+\]\(([^)]+)\)$/.exec(owningFields[0][1]!.trim())
      : null;
    const ownerConflict =
      owningFields.length > 1 ||
      (owningFields.length === 1 &&
        (explicitOwner === null ||
          referencePath(entry.path, explicitOwner[1]!) !== structuralOwner));
    if (!parsed.taskId || !parsed.status || !owner || ownerConflict) {
      issue(
        'INVALID_TASK',
        entry.path,
        'Task identity/status or filename-derived owner is unresolved; an explicit Owning Spec must agree with that exact spec path'
      );
      continue;
    }
    const phases: ParsedTask['phases'] = [];
    for (const phase of parsePhasesOverview(overview.content)) {
      const section = extractSection(entry.content, `PHASE_${phase.id}`);
      if (section.status !== 'ok') {
        issue('INVALID_PHASE', entry.path, `Missing exact phase ${phase.id}`);
        continue;
      }
      const phaseBody = visibleMarkdown(section.content);
      const fail = (detail: string) =>
        issue('INVALID_PHASE', entry.path, `Phase ${phase.id}: ${detail}`);
      phases.push({
        id: phase.id,
        deps: phase.deps,
        writes: phasePaths(phaseBody, 'Target Files', fail),
        deletes: phasePaths(phaseBody, 'Deleted Files', fail),
      });
    }
    if (!phases.length) issue('INVALID_TASK', entry.path, 'No parseable phases in PHASES_OVERVIEW');
    const phaseIds = new Set(phases.map((phase) => phase.id));
    if (phaseIds.size !== phases.length)
      issue('INVALID_TASK', entry.path, 'Duplicate phase identities');
    for (const phase of phases) {
      const pending = [...phase.deps];
      const seen = new Set<string>();
      while (pending.length) {
        const dependency = pending.pop()!;
        if (dependency === phase.id || !phaseIds.has(dependency)) {
          issue('INVALID_TASK', entry.path, 'Phase dependencies contain a cycle or missing phase');
          break;
        }
        if (seen.has(dependency)) continue;
        seen.add(dependency);
        pending.push(...(phases.find((item) => item.id === dependency)?.deps ?? []));
      }
    }
    tasks.push({
      path: entry.path,
      task: parsed.taskId,
      done: parsed.status.endsWith('DONE'),
      owner,
      phases,
    });
  }
  return { specs, tasks, byPath };
}

/** @purpose Select current task obligations using proved phase dependency order, not ticket history union. */
function projectTargets(
  tasks: readonly ParsedTask[],
  selection: CoverageSelection,
  byPath: ReadonlyMap<string, string>,
  issue: CoverageIssue
) {
  let selected = selection;
  if (selection.kind === 'spec')
    selected = { kind: 'spec', id: byPath.get(selection.id) ?? selection.id };
  const targets: CoverageTarget[] = [];
  const phaseContexts: { task: string; phase: string }[] = [];
  const taskIds = new Set<string>();
  for (const task of tasks) {
    if (taskIds.has(task.task))
      issue('DUPLICATE_TASK_ID', task.path, `Duplicate task ${task.task}`);
    taskIds.add(task.task);
    if (selected.kind === 'phase' && selected.task !== task.task && selected.task !== task.path)
      continue;
    if (selected.kind === 'phase') selected = { ...selected, task: task.task };
    const claims = new Map<string, CoverageTarget[]>();
    for (const phase of task.phases) {
      phaseContexts.push({ task: task.task, phase: phase.id });
      if (selected.kind === 'phase' && selected.phase !== phase.id) continue;
      if (selected.kind !== 'phase' && task.done) continue;
      for (const [operation, paths] of [
        ['write', phase.writes],
        ['delete', phase.deletes],
      ] as const) {
        for (const path of paths) {
          const list = claims.get(path) ?? [];
          list.push({ task: task.task, phase: phase.id, specId: task.owner, path, operation });
          claims.set(path, list);
        }
      }
    }
    const dependsOn = (phase: string, dependency: string): boolean => {
      const pending = [phase];
      const seen = new Set<string>();
      while (pending.length) {
        const id = pending.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const dep of task.phases.find((item) => item.id === id)?.deps ?? []) {
          if (dep === dependency) return true;
          pending.push(dep);
        }
      }
      return false;
    };
    for (const [path, list] of claims) {
      const current = list.filter(
        (claim) =>
          !list.some((next) => next.phase !== claim.phase && dependsOn(next.phase, claim.phase))
      );
      if (new Set(current.map((claim) => claim.phase)).size > 1)
        issue(
          'UNORDERED_TARGET_CLAIMS',
          path,
          'Multiple phase obligations have no proved dependency order'
        );
      targets.push(...current);
    }
  }
  return { selected, targets, phaseContexts };
}

/** @purpose Observe selected regular files and one bounded batch of prior Git headers. */
function observePaths(
  root: string,
  paths: readonly string[],
  read: CoverageReader,
  reads: CoverageReadStats,
  issue: CoverageIssue
): CoverageObservation[] {
  const observations: CoverageObservation[] = [];
  const priorIndexes: number[] = [];
  for (const path of paths) {
    if (path.split('/').some((part) => skipped.has(part.toLowerCase()))) {
      issue(
        'EXCLUDED_SOURCE_PATH',
        path,
        'Dependency, VCS and generated-output territory is outside coverage source reads'
      );
      observations.push({ path, state: 'unsafe', specIds: [] });
      continue;
    }
    if (!isSddSourceFile(path) && !path.endsWith('.json')) {
      issue(
        'UNSUPPORTED_HEADER_FORMAT',
        path,
        'Declared artifact has no supported ownership representation; never insert invalid comments'
      );
      observations.push({ path, state: 'unsafe', specIds: [] });
      continue;
    }
    const safe = inspectRepoPath(root, path, 'potential', 'literal-brackets');
    let observation: CoverageObservation = { path, state: 'unsafe', specIds: [] };
    if (!safe.ok) issue('UNSAFE_PATH', path, safe.detail);
    else {
      try {
        const stat = lstatSync(safe.absolute);
        if (!stat.isFile()) issue('UNSAFE_PATH', path, 'Expected a regular implementation file');
        else {
          const content = read(path, false);
          if (content !== null) {
            if (path.endsWith('.json')) {
              try {
                JSON.parse(content);
                observation = { path, state: 'file', specIds: [], ownershipFormat: 'declaration' };
              } catch {
                issue(
                  'INVALID_JSON_ARTIFACT',
                  path,
                  'Expected valid JSON; do not add ownership comments'
                );
              }
            } else observation = { path, state: 'file', specIds: headerIds(content) };
          }
        }
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
          observation = { path, state: 'missing', specIds: [] };
        else issue('READ_FAILED', path, 'Cannot inspect declared implementation');
      }
    }
    if (observation.state !== 'unsafe') priorIndexes.push(observations.length);
    observations.push(observation);
  }
  if (priorIndexes.length && existsSync(resolve(root, '.git'))) {
    try {
      const prior = execFileSync(
        'git',
        ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'cat-file', '--batch'],
        {
          cwd: root,
          input: priorIndexes.map((index) => `HEAD:${observations[index]!.path}\n`).join(''),
          maxBuffer: 64 * 1024 * 1024,
        }
      );
      reads.priorBytes = prior.byteLength;
      let offset = 0;
      for (const index of priorIndexes) {
        const observation = observations[index]!;
        const end = prior.indexOf(10, offset);
        if (end < 0) {
          issue('GIT_READ_FAILED', observation.path, 'Incomplete Git batch');
          break;
        }
        const header = prior.subarray(offset, end).toString('utf8');
        offset = end + 1;
        if (header.endsWith(' missing')) continue;
        const match = /^[a-f0-9]+ blob (\d+)$/.exec(header);
        if (!match) {
          issue('GIT_READ_FAILED', observation.path, 'Unexpected Git object response');
          break;
        }
        const size = Number(match[1]);
        if (offset + size >= prior.length || prior[offset + size] !== 10) {
          issue('GIT_READ_FAILED', observation.path, 'Truncated Git object');
          break;
        }
        const previousSpecIds = headerIds(prior.subarray(offset, offset + size).toString('utf8'));
        observations[index] = { ...observation, previousSpecIds };
        offset += size + 1;
      }
    } catch {
      issue('GIT_READ_FAILED', '', 'Cannot observe selected prior headers from Git');
    }
  }
  return observations;
}

/**
 * @purpose Read declared SDD metadata once and observe only paths selected by the shared pure resolver.
 * @invariant No mutations, source-tree walk, persisted inventory, inferred directory owner or Verify PASS.
 * @param root Project checkout root; the original checkout is never changed.
 * @param selection Project, exact spec ID/path (portal path allowed), or exact task/phase.
 * @param stage Ownership boundary, independent of test/Verify execution.
 * @returns Versioned diagnosis with deterministic findings and explicit reader counters.
 */
export function readSddCoverage(
  root: string,
  selection: CoverageSelection,
  stage: CoverageStage
): CoverageDocument {
  const reads: CoverageReadStats = {
    metadataReads: 0,
    metadataBytes: 0,
    sourceReads: 0,
    sourceBytes: 0,
    priorBytes: 0,
  };
  const issues: CoverageFinding[] = [];
  const issue = (code: string, path: string, detail: string) =>
    issues.push({ code, path, detail, severity: 'error' });
  const read = (path: string, metadata: boolean): string | null => {
    const proof = proveRepoFile(root, path, 'literal-brackets');
    const result = proof.ok ? readProvenRepoFile(proof.identity) : proof;
    if (!result.ok) {
      issue('READ_FAILED', path, result.detail);
      return null;
    }
    reads[metadata ? 'metadataReads' : 'sourceReads']++;
    reads[metadata ? 'metadataBytes' : 'sourceBytes'] += Buffer.byteLength(result.content);
    return result.content;
  };
  const metadata = readMetadata(root, read, issue);
  const { specs, tasks, byPath } = parseMetadata(metadata, issue, selection);
  const { selected, targets, phaseContexts } = projectTargets(tasks, selection, byPath, issue);
  const input = {
    stage,
    selection: selected,
    specs,
    targets,
    observations: [] as CoverageObservation[],
    phaseContexts,
  };
  // The pure core owns projection selection; the first pass requests paths, not successful evidence.
  const paths = resolveSddCoverage(input).rows.map((row) => row.path);
  input.observations.push(...observePaths(root, paths, read, reads, issue));
  const result = resolveSddCoverage(input);
  const coverage: CoverageResult = issues.length
    ? {
        ...result,
        findings: [...result.findings, ...issues].sort(
          (a, b) =>
            a.path.localeCompare(b.path) ||
            a.code.localeCompare(b.code) ||
            a.detail.localeCompare(b.detail)
        ),
        complete: false,
        canProceed: false,
      }
    : result;
  return { schema: 'sdd-coverage/1', selection: selected, coverage, reads };
}
