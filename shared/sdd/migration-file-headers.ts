// @file: FO-6 preflight for migrating V1 source ownership headers and materializing stable V2 Spec IDs.
// @spec: SHARED
// @consumers: migration-move

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { inspectRepoPath } from '../common/repo-path.ts';
import { fileRelationTicketFromContent, resolveFileRelations } from './file-relations.ts';
import { detectScopeFlowVersion, ticketFlowVersion } from './flow.ts';
import { isSddSourceFile } from './source-extensions.ts';
import { extractSection } from './section.ts';
import { collectSpecIdEntries, deriveInitialSpecId, parseSpecId } from './spec-id.ts';
import { parseMetaInfo, parsePhaseDetail, parsePhasesOverview } from './ticket.ts';
import { parseTasksHeader } from './tasks-append-only.ts';
import { scanMigrationUnits, type SpecUnit } from './migration-plan.ts';
import { collectTicketCorpus } from './ticket-resolve.ts';
import {
  parseSourceOwnershipHeader,
  type ParsedSourceOwnershipHeader,
} from './source-ownership-header.ts';
import { injectAnchors } from './anchor-inject.ts';

/** @purpose One byte-exact file rewrite approved by the whole-scope FO-6 preflight. */
type MigrationFileRewrite = {
  /** @purpose Repository-relative file path. */
  file: string;
  /** @purpose Original bytes used to reject stale application. */
  before: string;
  /** @purpose Fully rendered replacement bytes. */
  after: string;
  /** @purpose Human-readable dry-run action. */
  report: string;
};

/** @purpose Complete all-or-nothing FO-6 header plan for one scope move. */
type MigrationFileHeaderPlan =
  | { ok: true; specRewrites: MigrationFileRewrite[]; sourceRewrites: MigrationFileRewrite[] }
  | { ok: false; errors: string[] };

type OwnedTicket = {
  taskId: string;
  ticketFile: string;
  specFile: string;
  status: 'todo' | 'in-progress' | 'blocked' | 'done' | 'unknown';
  targets: string[];
  targetError: string | null;
};

type HistoricalTicket = {
  taskId: string;
  ticketFile: string;
  deletionCommit: string;
  targets: string[];
  targetError: string | null;
  successorTaskId: string | null;
};

type HistoricalTicketCorpus =
  | { ok: true; ticketsById: Map<string, HistoricalTicket[]> }
  | { ok: false; error: string };

type MigrationFileOwner = {
  file: string;
  specId: string;
  evidence: string;
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage']);
const FILE_OWNER_MAP = 'migration/FILE-SPEC-MAP.tsv';

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function collectFiles(root: string, predicate: (path: string) => boolean): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name) || entry.isSymbolicLink())
        continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && predicate(full)) files.push(full);
    }
  };
  walk(root);
  return files.sort(compareText);
}

/**
 * @purpose Read the operator-approved, one-shot FO-6 source-owner decisions.
 * @invariant The map is migration input only: exact file, canonical Spec ID and non-empty evidence;
 *   it is never consulted by orient/check/runtime ownership resolution.
 */
function migrationFileOwners(repoRoot: string, errors: string[]): Map<string, MigrationFileOwner> {
  const absolute = join(repoRoot, FILE_OWNER_MAP);
  if (!existsSync(absolute)) return new Map();
  const owners = new Map<string, MigrationFileOwner>();
  const content = readFileSync(absolute, 'utf8');
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    if (raw.trim() === '' || raw.startsWith('#')) continue;
    const cells = raw.split('\t');
    if (cells.length !== 3) {
      errors.push(`${FILE_OWNER_MAP}:${index + 1}: ожидаются file, Spec ID и evidence`);
      continue;
    }
    const [rawFile = '', specId = '', evidence = ''] = cells;
    const inspected = inspectRepoPath(repoRoot, rawFile, 'file');
    if (!inspected.ok || !isSddSourceFile(rawFile)) {
      errors.push(
        `${FILE_OWNER_MAP}:${index + 1}: source path ${rawFile || '(empty)'} rejected (${inspected.ok ? 'unsupported source extension' : inspected.detail})`
      );
      continue;
    }
    if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/.test(specId)) {
      errors.push(`${FILE_OWNER_MAP}:${index + 1}: Spec ID ${specId || '(empty)'} malformed`);
      continue;
    }
    if (evidence.trim() === '') {
      errors.push(`${FILE_OWNER_MAP}:${index + 1}: evidence пуст`);
      continue;
    }
    const file = inspected.relative;
    if (owners.has(file)) {
      errors.push(`${FILE_OWNER_MAP}:${index + 1}: source ${file} дублирован`);
      continue;
    }
    owners.set(file, { file, specId, evidence });
  }
  return owners;
}

function specIdSection(id: string, newline: string): string {
  return `<!--SECTION:SPEC_ID-->${newline}${id}${newline}<!--/SECTION:SPEC_ID-->`;
}

function insertSpecId(content: string, id: string): string | null {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const firstBreak = content.indexOf(newline);
  if (firstBreak < 0 || !/^#\s+\S/.test(content.slice(0, firstBreak))) return null;
  return `${content.slice(0, firstBreak + newline.length)}${specIdSection(id, newline)}${newline}${content.slice(firstBreak + newline.length)}`;
}

function explicitSpecPlans(
  repoRoot: string,
  scopeUnits: readonly SpecUnit[],
  errors: string[]
): { idBySpec: Map<string, string>; rewrites: MigrationFileRewrite[] } {
  const specsRoot = join(repoRoot, 'specs');
  const allSpecFiles = collectFiles(specsRoot, (file) => file.endsWith('.spec.md'));
  const migratingSpecs = new Set(scopeUnits.map((unit) => unit.specFile.split(sep).join('/')));
  const explicitById = new Map<string, string[]>();
  const parsedByFile = new Map<string, ReturnType<typeof parseSpecId>>();

  for (const absolute of allSpecFiles) {
    const file = relative(repoRoot, absolute).split(sep).join('/');
    const parsed = parseSpecId(readFileSync(absolute, 'utf8'));
    parsedByFile.set(file, parsed);
    const scope = file.split('/')[1] ?? '';
    if (
      parsed.status === 'malformed' &&
      (migratingSpecs.has(file) || detectScopeFlowVersion(repoRoot, scope) === 'v2')
    ) {
      errors.push(`спека ${file}: секция SPEC_ID malformed — миграция scope остановлена`);
    } else if (parsed.status === 'valid') {
      const paths = explicitById.get(parsed.id) ?? [];
      paths.push(file);
      explicitById.set(parsed.id, paths);
    }
  }
  for (const [id, paths] of explicitById) {
    if (paths.length > 1) {
      errors.push(`Spec ID ${id} неоднозначен: ${paths.sort(compareText).join(', ')}`);
    }
  }

  const idBySpec = new Map<string, string>();
  const proposedById = new Map<string, string[]>();
  const rewrites: MigrationFileRewrite[] = [];
  for (const unit of [...scopeUnits].sort((a, b) => compareText(a.specFile, b.specFile))) {
    const file = unit.specFile.split(sep).join('/');
    const absolute = join(repoRoot, file);
    const before = readFileSync(absolute, 'utf8');
    const parsed = parsedByFile.get(file) ?? parseSpecId(before);
    if (parsed.status === 'valid') {
      idBySpec.set(file, parsed.id);
      continue;
    }
    if (parsed.status === 'malformed') continue;
    const proposed = deriveInitialSpecId(specsRoot, absolute);
    if (!proposed) {
      errors.push(`спека ${file}: canonical Spec ID нельзя вывести из пути`);
      continue;
    }
    const paths = proposedById.get(proposed) ?? [];
    paths.push(file);
    proposedById.set(proposed, paths);
    idBySpec.set(file, proposed);
    const after = insertSpecId(before, proposed);
    if (after === null) {
      errors.push(`спека ${file}: SPEC_ID нельзя вставить после canonical H1`);
      continue;
    }
    rewrites.push({
      file,
      before,
      after,
      report: `spec-id ${file} — ${proposed}`,
    });
  }

  for (const [id, paths] of proposedById) {
    const existing = explicitById.get(id) ?? [];
    const all = [...existing, ...paths].sort(compareText);
    if (all.length > 1) errors.push(`proposal Spec ID ${id} сталкивается: ${all.join(', ')}`);
  }
  return { idBySpec, rewrites };
}

function ticketTargetsFromContent(
  repoRoot: string,
  content: string
): { targets: string[]; error: string | null } {
  const overview = extractSection(content, 'PHASES_OVERVIEW');
  if (overview.status === 'not_found') return { targets: [], error: null };
  if (overview.status !== 'ok') return { targets: [], error: 'PHASES_OVERVIEW malformed' };
  const targets: string[] = [];
  for (const phase of parsePhasesOverview(overview.content)) {
    const section = extractSection(content, `PHASE_${phase.id}`);
    if (section.status !== 'ok')
      return { targets: [], error: `PHASE_${phase.id} отсутствует/malformed` };
    const detail = parsePhaseDetail(section.content);
    for (const raw of [...detail.targetFiles, ...detail.deletedFiles]) {
      const inspected = inspectRepoPath(repoRoot, raw, 'potential');
      if (!inspected.ok)
        return { targets: [], error: `target «${raw}» rejected: ${inspected.detail}` };
      targets.push(inspected.relative.split(sep).join('/'));
    }
  }
  return { targets: [...new Set(targets)].sort(compareText), error: null };
}

function ticketTargets(
  repoRoot: string,
  ticketFile: string
): { targets: string[]; error: string | null } {
  return ticketTargetsFromContent(repoRoot, readFileSync(join(repoRoot, ticketFile), 'utf8'));
}

function gitText(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function historicalTicketCorpus(repoRoot: string, historyRef: string): HistoricalTicketCorpus {
  try {
    gitText(repoRoot, ['cat-file', '-e', `${historyRef}^{commit}`]);
    if (gitText(repoRoot, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
      return {
        ok: false,
        error: `Git history для ${historyRef} shallow — удалённые ticket objects недоказуемы`,
      };
    }
    const deleted = gitText(repoRoot, [
      'log',
      '--format=commit:%H',
      '--diff-filter=D',
      '--name-only',
      '--no-renames',
      historyRef,
      '--',
      'tasks',
      'specs',
    ]);
    const candidates: Array<{ commit: string; path: string }> = [];
    let commit = '';
    for (const raw of deleted.split(/\r?\n/)) {
      const line = raw.trim();
      const marker = /^commit:([0-9a-f]{40})$/.exec(line);
      if (marker?.[1]) {
        commit = marker[1];
        continue;
      }
      if (
        commit &&
        line !== '' &&
        (/(?:^|\/)tasks\/.*\.task-[^/]+\.md$/.test(line) ||
          /(?:^|\/)specs\/.*\.task\.[^/]+\.md$/.test(line))
      ) {
        candidates.push({ commit, path: line });
      }
    }

    const ticketsById = new Map<string, HistoricalTicket[]>();
    const seen = new Set<string>();
    const renameMaps = new Map<string, Map<string, string>>();
    for (const candidate of candidates) {
      let content: string;
      try {
        content = gitText(repoRoot, ['show', `${candidate.commit}^:${candidate.path}`]);
      } catch (error) {
        return {
          ok: false,
          error: `Git object ${candidate.commit}^:${candidate.path} недоступен: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      const anchored = injectAnchors(content).text;
      const metaSection = extractSection(anchored, 'META');
      if (metaSection.status !== 'ok') continue;
      const meta = parseMetaInfo(metaSection.content);
      if (!meta.taskId) continue;
      let successorTaskId: string | null = null;
      if (!/\bDONE\b/.test(meta.status ?? '')) {
        let renames = renameMaps.get(candidate.commit);
        if (!renames) {
          renames = new Map<string, string>();
          const diff = gitText(repoRoot, [
            'diff-tree',
            '--no-commit-id',
            '--name-status',
            '-r',
            '-M',
            `${candidate.commit}^`,
            candidate.commit,
          ]);
          for (const line of diff.split(/\r?\n/)) {
            const [status, from, to] = line.split('\t');
            if (status?.startsWith('R') && from && to) renames.set(from, to);
          }
          renameMaps.set(candidate.commit, renames);
        }
        const renamedTo = renames.get(candidate.path);
        if (!renamedTo) continue;
        const successor = injectAnchors(
          gitText(repoRoot, ['show', `${candidate.commit}:${renamedTo}`])
        ).text;
        const successorMeta = extractSection(successor, 'META');
        if (successorMeta.status !== 'ok') continue;
        successorTaskId = parseMetaInfo(successorMeta.content).taskId;
        if (!successorTaskId || successorTaskId === meta.taskId) continue;
      }
      const parsedTargets = ticketTargetsFromContent(repoRoot, anchored);
      const key = `${meta.taskId}\0${candidate.path}\0${successorTaskId ?? ''}\0${parsedTargets.targets.join('\0')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const record: HistoricalTicket = {
        taskId: meta.taskId,
        ticketFile: candidate.path,
        deletionCommit: candidate.commit,
        targets: parsedTargets.targets,
        targetError: parsedTargets.error,
        successorTaskId,
      };
      const records = ticketsById.get(meta.taskId) ?? [];
      records.push(record);
      records.sort((left, right) =>
        compareText(
          `${left.ticketFile}\0${left.deletionCommit}`,
          `${right.ticketFile}\0${right.deletionCommit}`
        )
      );
      ticketsById.set(meta.taskId, records);
    }
    return { ok: true, ticketsById };
  } catch (error) {
    return {
      ok: false,
      error: `Git history для ${historyRef} недоступна: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function ownedTickets(repoRoot: string, units: readonly SpecUnit[]): OwnedTicket[] {
  const tickets: OwnedTicket[] = [];
  for (const unit of units) {
    for (const ticket of unit.tickets) {
      if (!ticket.taskId) continue;
      const content = readFileSync(join(repoRoot, ticket.file), 'utf8');
      const anchored = injectAnchors(content).text;
      const meta = extractSection(anchored, 'META');
      const status =
        meta.status === 'ok'
          ? normalizeTicketStatus(parseMetaInfo(meta.content).status)
          : 'unknown';
      const parsed = ticketTargets(repoRoot, ticket.file);
      tickets.push({
        taskId: ticket.taskId,
        ticketFile: ticket.file,
        specFile: unit.specFile.split(sep).join('/'),
        status,
        targets: parsed.targets,
        targetError: parsed.error,
      });
    }
  }
  return tickets.sort((a, b) => compareText(a.taskId, b.taskId));
}

function normalizeTicketStatus(status: string | null): OwnedTicket['status'] {
  if (!status) return 'unknown';
  if (/\bDONE\b/.test(status)) return 'done';
  if (/\bIN_PROGRESS\b/.test(status)) return 'in-progress';
  if (/\bBLOCKED\b/.test(status)) return 'blocked';
  if (/\bTODO\b/.test(status)) return 'todo';
  return 'unknown';
}

function v2OwnedTickets(repoRoot: string, errors: string[]): OwnedTicket[] {
  const corpus = collectTicketCorpus(repoRoot);
  if (!corpus.ok) {
    errors.push(`полный ticket corpus недоступен: ${corpus.detail}`);
    return [];
  }
  const specEntries = collectSpecIdEntries(join(repoRoot, 'specs'));
  const idByPath = new Map(specEntries.map((entry) => [entry.path, entry.id]));
  const pathById = new Map<string, string[]>();
  for (const entry of specEntries) {
    const paths = pathById.get(entry.id) ?? [];
    paths.push(entry.path);
    pathById.set(entry.id, paths);
  }
  const tickets: OwnedTicket[] = [];
  const canonicalRoot = realpathSync(repoRoot);
  const corpusFiles = new Set(
    corpus.refs.map((ref) => relative(canonicalRoot, ref.file).split(sep).join('/'))
  );
  const namedV2Tickets = collectFiles(join(repoRoot, 'specs'), (file) =>
    /\.task\.[^/\\]+\.md$/.test(file)
  )
    .filter((file) => ticketFlowVersion(file, repoRoot) === 'v2')
    .map((file) => relative(repoRoot, file).split(sep).join('/'));
  for (const ticketFile of namedV2Tickets) {
    if (!corpusFiles.has(ticketFile)) {
      errors.push(
        `${ticketFile}: co-located V2 ticket не распознан полным corpus (META/EXECUTION_LOG missing или malformed)`
      );
    }
  }
  for (const ref of corpus.refs) {
    const ticketFile = relative(canonicalRoot, ref.file).split(sep).join('/');
    if (
      !ticketFile.startsWith('specs/') ||
      !/\.task\.[^/]+\.md$/.test(ticketFile) ||
      ticketFlowVersion(ref.file, repoRoot) !== 'v2'
    )
      continue;
    const unresolvedSpecReferences = new Set<string>();
    const parsed = fileRelationTicketFromContent({
      file: ticketFile,
      flow: 'v2',
      content: ref.content,
      resolveSpecReference: (reference) => {
        const pathPart = reference.split('#', 1)[0] ?? '';
        if (!pathPart.endsWith('.spec.md')) {
          unresolvedSpecReferences.add(reference);
          return null;
        }
        const target = relative(canonicalRoot, resolve(dirname(ref.file), pathPart))
          .split(sep)
          .join('/');
        const id = idByPath.get(target) ?? null;
        if (id === null) unresolvedSpecReferences.add(reference);
        return id;
      },
    });
    if (!parsed.ok) {
      errors.push(
        `${ticketFile}: co-located V2 ticket не разбирается (${parsed.reason}${parsed.phaseId ? `:${parsed.phaseId}` : ''})`
      );
      continue;
    }
    for (const phase of parsed.ticket.phases) {
      const rawTargets = [...phase.targetFiles, ...phase.deletedFiles];
      const targets: string[] = [];
      let targetError: string | null =
        unresolvedSpecReferences.size > 0
          ? `Spec References не разрешаются: ${[...unresolvedSpecReferences].sort(compareText).join(', ')}`
          : null;
      for (const raw of rawTargets) {
        const inspected = inspectRepoPath(repoRoot, raw, 'potential');
        if (!inspected.ok) {
          targetError = `target «${raw}» rejected: ${inspected.detail}`;
          continue;
        }
        targets.push(inspected.relative.split(sep).join('/'));
      }
      const ownerPaths = phase.specIds.flatMap((id) => pathById.get(id) ?? []);
      if (ownerPaths.length === 0) ownerPaths.push('');
      for (const specFile of [...new Set(ownerPaths)].sort(compareText)) {
        tickets.push({
          taskId: parsed.ticket.taskId,
          ticketFile,
          specFile,
          status: parsed.ticket.status,
          targets: [...new Set(targets)].sort(compareText),
          targetError,
        });
      }
    }
  }
  return tickets;
}

function resolverClaimsFile(repoRoot: string, file: string, ticket: OwnedTicket): boolean {
  const result = resolveFileRelations({
    repoRoot,
    file,
    flow: 'v1',
    spec: { status: 'resolved', id: 'MIGRATION-PREFLIGHT', path: ticket.specFile },
    hasLegacyTasks: false,
    tickets: [
      {
        file: ticket.ticketFile,
        taskId: ticket.taskId,
        dependencies: [],
        flow: 'v1',
        status: 'todo',
        blockerActive: false,
        phases: [
          {
            id: 'MIGRATION',
            state: 'todo',
            targetFiles: ticket.targets,
            deletedFiles: [],
            specIds: ['MIGRATION-PREFLIGHT'],
          },
        ],
      },
    ],
  });
  return result.planned.some(
    (relation) => relation.ticketFile === ticket.ticketFile && relation.target === file
  );
}

function renderSourceHeader(
  content: string,
  header: ParsedSourceOwnershipHeader,
  specId: string,
  file: string,
  synthesizeMissing: boolean
): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content === '' ? [] : content.split(/\r?\n/);
  let insertAt = Math.min(...header.blocks.map((block) => block.start));
  if (!Number.isFinite(insertAt)) {
    insertAt = 0;
    if ((lines[0] ?? '').trim().startsWith('#!')) insertAt = 1;
    while (insertAt < lines.length) {
      const line = lines[insertAt] ?? '';
      if (line.trim() === '' || line.trim().startsWith('//') || /^#(?:\s|$)/.test(line.trim())) {
        insertAt += 1;
        continue;
      }
      if (line.trim().startsWith('/*') && !line.trim().startsWith('/**')) {
        do {
          insertAt += 1;
        } while (insertAt < lines.length && !(lines[insertAt - 1] ?? '').includes('*/'));
        continue;
      }
      break;
    }
  }
  const removed = new Set(
    header.blocks.flatMap((block) =>
      Array.from({ length: block.end - block.start }, (_, offset) => block.start + offset)
    )
  );
  const hashComment = /\.(?:py|rb)$/.test(file);
  const prefix = header.blocks[0]?.prefix ?? (hashComment ? '#' : '//');
  const fileBlock = header.blocks.find((block) => block.tag === 'file');
  const consumerBlock = header.blocks.find((block) => block.tag === 'consumers');
  const fileLines = fileBlock?.lines ?? (synthesizeMissing ? [`${prefix} @file: ${file}`] : []);
  const consumerLines =
    consumerBlock?.lines ?? (synthesizeMissing ? [`${prefix} @consumers: N/A`] : []);
  const canonical = [...fileLines, `${prefix} @spec: ${specId}`, ...consumerLines];
  const out: string[] = [];
  lines.forEach((line, index) => {
    if (index === insertAt) out.push(...canonical);
    if (!removed.has(index)) out.push(line);
  });
  if (insertAt === lines.length) out.push(...canonical);
  const rendered = out.join(newline);
  return rendered.replaceAll('\r\n', '\n') === content.replaceAll('\r\n', '\n')
    ? content
    : rendered;
}

/**
 * @purpose Preflight all Spec-ID and source-header writes coupled to one actual scope move.
 * @invariant Returns no rewrites when any mapping is missing, ambiguous, malformed or would drop
 *   an unrecoverable legacy relation; the caller must not perform any other move writes on failure.
 * @param repoRoot Absolute repository root.
 * @param scopeUnits Migration units belonging to the scope being moved.
 * @param [historyRef] Frozen Git commit bounding deleted-ticket evidence; defaults to current HEAD.
 * @returns Whole-scope rewrites or every deterministic blocker.
 */
export function planMigrationFileHeaders(
  repoRoot: string,
  scopeUnits: readonly SpecUnit[],
  historyRef = 'HEAD'
): MigrationFileHeaderPlan {
  const errors: string[] = [];
  const specPlan = explicitSpecPlans(repoRoot, scopeUnits, errors);
  const currentSpecFiles = new Set(scopeUnits.map((unit) => unit.specFile.split(sep).join('/')));
  const currentSpecById = new Map<string, string>();
  for (const [specFile, specId] of specPlan.idBySpec) {
    const previous = currentSpecById.get(specId);
    if (previous && previous !== specFile) {
      errors.push(`Spec ID ${specId} неоднозначен в migrating scope: ${previous}, ${specFile}`);
    } else {
      currentSpecById.set(specId, specFile);
    }
  }
  const approvedOwners = migrationFileOwners(repoRoot, errors);
  const specsRoot = join(repoRoot, 'specs');
  const knownSpecPathsById = new Map<string, Set<string>>();
  for (const entry of collectSpecIdEntries(specsRoot)) {
    const paths = knownSpecPathsById.get(entry.id) ?? new Set<string>();
    paths.add(entry.path);
    knownSpecPathsById.set(entry.id, paths);
  }
  for (const absolute of collectFiles(specsRoot, (file) => file.endsWith('.spec.md'))) {
    const file = relative(repoRoot, absolute).split(sep).join('/');
    const parsed = parseSpecId(readFileSync(absolute, 'utf8'));
    if (parsed.status !== 'absent') continue;
    const proposed = deriveInitialSpecId(specsRoot, absolute);
    if (!proposed) continue;
    const paths = knownSpecPathsById.get(proposed) ?? new Set<string>();
    paths.add(file);
    knownSpecPathsById.set(proposed, paths);
  }
  for (const [specFile, specId] of specPlan.idBySpec) {
    const paths = knownSpecPathsById.get(specId) ?? new Set<string>();
    paths.add(specFile);
    knownSpecPathsById.set(specId, paths);
  }
  for (const owner of approvedOwners.values()) {
    const paths = [...(knownSpecPathsById.get(owner.specId) ?? [])].sort(compareText);
    if (paths.length !== 1) {
      errors.push(
        `${FILE_OWNER_MAP}: ${owner.file} ссылается на ${owner.specId}, resolved specs=${paths.length === 0 ? '0' : paths.join(', ')}`
      );
    }
  }
  const currentApprovedOwners = new Map<string, { owner: MigrationFileOwner; specFile: string }>();
  for (const owner of approvedOwners.values()) {
    const specFile = currentSpecById.get(owner.specId);
    if (specFile) currentApprovedOwners.set(owner.file, { owner, specFile });
  }
  const allTickets = [
    ...ownedTickets(repoRoot, scanMigrationUnits(repoRoot).units),
    ...v2OwnedTickets(repoRoot, errors),
  ];
  const currentTicketFiles = new Set(
    scopeUnits.flatMap((unit) => unit.tickets.map((ticket) => ticket.file))
  );
  const isCurrentTicket = (ticket: OwnedTicket): boolean =>
    currentTicketFiles.has(ticket.ticketFile) || currentSpecFiles.has(ticket.specFile);
  for (const ticket of allTickets) {
    if (isCurrentTicket(ticket) && ticket.targetError !== null) {
      errors.push(
        `${ticket.ticketFile}: ownership evidence не разбирается (${ticket.targetError})`
      );
    }
  }
  const ticketsById = new Map<string, OwnedTicket[]>();
  for (const ticket of allTickets) {
    const matches = ticketsById.get(ticket.taskId) ?? [];
    matches.push(ticket);
    ticketsById.set(ticket.taskId, matches);
  }
  const ticketsByTarget = new Map<string, OwnedTicket[]>();
  for (const ticket of allTickets) {
    for (const target of ticket.targets) {
      const list = ticketsByTarget.get(target) ?? [];
      list.push(ticket);
      ticketsByTarget.set(target, list);
    }
  }

  const sourceRewrites: MigrationFileRewrite[] = [];
  let historical: HistoricalTicketCorpus | null = null;
  const history = (): HistoricalTicketCorpus => {
    historical ??= historicalTicketCorpus(repoRoot, historyRef);
    return historical;
  };
  const sources = collectFiles(repoRoot, (file) => isSddSourceFile(file));
  for (const absolute of sources) {
    const file = relative(repoRoot, absolute).split(sep).join('/');
    const before = readFileSync(absolute, 'utf8');
    const parsedHeader = parseSourceOwnershipHeader(before);
    const declaredSpecIds = parsedHeader.blocks
      .filter((block) => block.tag === 'spec')
      .map((block) => block.value.trim())
      .filter(Boolean);
    const mappedOwner = approvedOwners.get(file);
    // A source is rewritten exactly once, by its approved/declared semantic-owner scope. Ticket
    // relations from another scope stay relations; they cannot make that scope rewrite the owner.
    if (mappedOwner && !currentSpecById.has(mappedOwner.specId)) continue;
    if (
      !mappedOwner &&
      declaredSpecIds.length === 1 &&
      !currentSpecById.has(declaredSpecIds[0] as string)
    )
      continue;
    const legacyIds = parseTasksHeader(before);
    const allDirectTickets = (ticketsByTarget.get(file) ?? []).filter((ticket) =>
      resolverClaimsFile(repoRoot, file, ticket)
    );
    const directTickets = allDirectTickets.filter(isCurrentTicket);
    const referencedCurrentTickets = legacyIds
      .flatMap((id) => ticketsById.get(id) ?? [])
      .filter(isCurrentTicket);
    const referencedScopeTickets = legacyIds
      .flatMap((id) => ticketsById.get(id) ?? [])
      .filter((ticket) => isCurrentTicket(ticket) && resolverClaimsFile(repoRoot, file, ticket));
    const approved = currentApprovedOwners.get(file);
    if (approved) {
      const alreadyCanonical =
        legacyIds.length === 0 &&
        declaredSpecIds.length === 1 &&
        declaredSpecIds[0] === approved.owner.specId;
      const expectedEvidence = legacyIds.length
        ? `legacy @tasks ${legacyIds.join(', ')}`
        : 'headerless inventory row';
      if (!alreadyCanonical && !approved.owner.evidence.includes(expectedEvidence)) {
        errors.push(
          `${FILE_OWNER_MAP}: ${file} evidence не фиксирует exact source relation «${expectedEvidence}»`
        );
        continue;
      }
    }
    if (
      directTickets.length === 0 &&
      referencedCurrentTickets.length === 0 &&
      approved === undefined
    )
      continue;

    const evidence = new Map<string, OwnedTicket>();
    const addEvidence = (ticket: OwnedTicket): void => {
      evidence.set(`${ticket.ticketFile}\0${ticket.specFile}`, ticket);
    };
    for (const ticket of [...allDirectTickets, ...referencedScopeTickets]) addEvidence(ticket);
    for (const legacyId of legacyIds) {
      if (approved !== undefined) {
        // Explicit operator ACK: this exact legacy ID is archived with its per-row evidence in the
        // versioned one-shot map before live @tasks is removed. Runtime consumers never load it.
        continue;
      }
      const matches = ticketsById.get(legacyId) ?? [];
      const claiming = matches.filter((ticket) => resolverClaimsFile(repoRoot, file, ticket));
      const claimingFiles = [...new Set(claiming.map((ticket) => ticket.ticketFile))];
      if (claimingFiles.length > 1) {
        errors.push(
          `${file}: legacy @tasks relation ${legacyId} неоднозначен (${claimingFiles.join(', ')})`
        );
        continue;
      }
      if (claimingFiles.length === 1) {
        for (const ticket of claiming) addEvidence(ticket);
        continue;
      }
      const currentMatches = matches.filter(isCurrentTicket);
      if (currentMatches.length > 0) {
        errors.push(
          `${file}: legacy @tasks relation ${legacyId} не имеет exact target; нужен ${FILE_OWNER_MAP}`
        );
        continue;
      }
      if (matches.length > 0 && matches.every((ticket) => ticket.status === 'done')) {
        // A current DONE ticket plus the versioned legacy header is recoverable declared history.
        // It must not enter owner evidence; an exact target from another ticket selects the owner.
        continue;
      }

      const historicalCorpus = history();
      if (!historicalCorpus.ok) {
        errors.push(
          matches.length > 0
            ? `${file}: legacy @tasks relation ${legacyId} не разрешается exact current target`
            : `${file}: legacy @tasks relation ${legacyId}: ${historicalCorpus.error}`
        );
        continue;
      }
      const historicalMatches = historicalCorpus.ticketsById.get(legacyId) ?? [];
      const historicalClaiming = historicalMatches.filter((ticket) =>
        ticket.targets.includes(file)
      );
      const historicalFiles = [...new Set(historicalClaiming.map((ticket) => ticket.ticketFile))];
      if (historicalFiles.length === 0) {
        const uniqueHistoricalFiles = [
          ...new Set(historicalMatches.map((ticket) => ticket.ticketFile)),
        ];
        if (
          uniqueHistoricalFiles.length === 1 &&
          historicalMatches.every((ticket) => ticket.successorTaskId === null)
        ) {
          // The versioned header and one uniquely resolved deleted DONE ticket prove history even
          // when the old prose target list predates the exact-path contract. History stays
          // non-authoritative and can never select the semantic owner.
          continue;
        }
        if (historicalMatches.length === 0 && matches.length > 0) {
          errors.push(
            `${file}: legacy @tasks relation ${legacyId} не разрешается exact current target`
          );
          continue;
        }
        errors.push(
          `${file}: legacy @tasks relation ${legacyId} не разрешается exact current/historical target`
        );
        continue;
      }
      if (historicalFiles.length > 1) {
        errors.push(
          `${file}: historical @tasks relation ${legacyId} неоднозначен (${historicalFiles.join(', ')})`
        );
        continue;
      }
      const aliases = historicalClaiming.filter((ticket) => ticket.successorTaskId !== null);
      for (const alias of aliases) {
        const successorMatches = (ticketsById.get(alias.successorTaskId as string) ?? []).filter(
          (ticket) => resolverClaimsFile(repoRoot, file, ticket)
        );
        const successorFiles = [...new Set(successorMatches.map((ticket) => ticket.ticketFile))];
        if (successorFiles.length !== 1) {
          errors.push(
            `${file}: historical alias ${legacyId} → ${alias.successorTaskId} не разрешается в один exact current ticket`
          );
          continue;
        }
        for (const ticket of successorMatches) addEvidence(ticket);
      }
      // A deleted DONE ticket proves history only. It deliberately does not enter `evidence`, so
      // it can preserve provenance but can never select or replace the semantic owner. A proven
      // rename alias can point at an exact current successor, but only that successor is evidence.
    }
    for (const ticket of evidence.values()) {
      if (ticket.targetError) {
        errors.push(
          `${file}: ticket ${ticket.taskId} не даёт проверяемый target (${ticket.targetError})`
        );
      }
    }

    const declaredOwnerSpec =
      declaredSpecIds.length === 1 ? currentSpecById.get(declaredSpecIds[0] as string) : undefined;
    const ownerSpecs = approved
      ? [approved.specFile]
      : declaredOwnerSpec
        ? [declaredOwnerSpec]
        : [...new Set([...evidence.values()].map((ticket) => ticket.specFile))].sort(compareText);
    if (ownerSpecs.length !== 1) {
      errors.push(
        `${file}: semantic owner неоднозначен (${ownerSpecs.length === 0 ? 'нет доказуемой спеки' : ownerSpecs.join(', ')})`
      );
      continue;
    }
    const ownerSpec = ownerSpecs[0] as string;
    const specId = specPlan.idBySpec.get(ownerSpec);
    if (!specId) {
      errors.push(`${file}: owning spec ${ownerSpec} не имеет валидного/proposed Spec ID`);
      continue;
    }
    const header = parsedHeader;
    const fileBlocks = header.blocks.filter((block) => block.tag === 'file');
    const specBlocks = header.blocks.filter((block) => block.tag === 'spec');
    const taskBlocks = header.blocks.filter((block) => block.tag === 'tasks');
    const consumerBlocks = header.blocks.filter((block) => block.tag === 'consumers');
    if (header.ambiguousHeaderIndexes.length > 0) {
      errors.push(
        `${file}: ownership header содержит неоднозначные comment lines (строки ${header.ambiguousHeaderIndexes.map((index) => index + 1).join(', ')})`
      );
      continue;
    }
    if (
      fileBlocks.length > 1 ||
      consumerBlocks.length > 1 ||
      fileBlocks[0]?.value.trim() === '' ||
      consumerBlocks[0]?.value.trim() === '' ||
      (approved === undefined && (fileBlocks.length !== 1 || consumerBlocks.length !== 1))
    ) {
      errors.push(
        `${file}: canonical header требует ровно один непустой @file и один непустой @consumers`
      );
      continue;
    }
    if (new Set(header.blocks.map((block) => block.prefix)).size > 1) {
      errors.push(`${file}: canonical header смешивает comment prefixes // и #`);
      continue;
    }
    if (taskBlocks.length > 1 || specBlocks.length > 1) {
      errors.push(`${file}: дублированный @tasks/@spec header неоднозначен`);
      continue;
    }
    const tasksBlock = taskBlocks[0];
    const specBlock = specBlocks[0];
    if ((tasksBlock?.lines.length ?? 1) > 1 || (specBlock?.lines.length ?? 1) > 1) {
      errors.push(`${file}: @tasks/@spec continuation нельзя безопасно перенести`);
      continue;
    }
    if (specBlocks.length === 1 && specBlocks[0]?.value !== specId) {
      errors.push(
        `${file}: существующий @spec ${specBlocks[0]?.value || '(empty)'} конфликтует с ${specId}`
      );
      continue;
    }
    const after = renderSourceHeader(before, header, specId, file, approved !== undefined);
    if (after !== before) {
      sourceRewrites.push({
        file,
        before,
        after,
        report: `header  ${file} — @spec ${specId}; legacy @tasks удалён`,
      });
    }
  }

  for (const file of currentApprovedOwners.keys()) {
    if (!sources.some((absolute) => relative(repoRoot, absolute).split(sep).join('/') === file)) {
      errors.push(`${FILE_OWNER_MAP}: source ${file} отсутствует в canonical source corpus`);
    }
  }

  return errors.length > 0
    ? { ok: false, errors: [...new Set(errors)].sort(compareText) }
    : { ok: true, specRewrites: specPlan.rewrites, sourceRewrites };
}

/**
 * @purpose Apply one preflighted rewrite only if its source bytes are still identical.
 * @param repoRoot Absolute repository root.
 * @param rewrite Approved rewrite.
 * @returns Null on success, or a stale-plan diagnostic without writing.
 */
export function validateMigrationRewrite(
  repoRoot: string,
  rewrite: MigrationFileRewrite
): string | null {
  const absolute = resolve(repoRoot, rewrite.file);
  if (!existsSync(absolute)) return `${rewrite.file}: файл исчез после preflight`;
  return readFileSync(absolute, 'utf8') === rewrite.before
    ? null
    : `${rewrite.file}: файл изменился после preflight`;
}
