// @file: FO-6 preflight for migrating V1 source ownership headers and materializing stable V2 Spec IDs.
// @consumers: migration-move
// @tasks: N/A

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { inspectRepoPath } from '../common/repo-path.ts';
import { fileRelationTicketFromContent, resolveFileRelations } from './file-relations.ts';
import { detectScopeFlowVersion, ticketFlowVersion } from './flow.ts';
import { isSddSourceFile } from './source-extensions.ts';
import { extractSection } from './section.ts';
import { collectSpecIdEntries, deriveInitialSpecId, parseSpecId } from './spec-id.ts';
import { parsePhaseDetail, parsePhasesOverview } from './ticket.ts';
import { parseTasksHeader } from './tasks-append-only.ts';
import { scanMigrationUnits, type SpecUnit } from './migration-plan.ts';
import { collectTicketCorpus } from './ticket-resolve.ts';

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
  targets: string[];
  targetError: string | null;
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage']);

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

function ticketTargets(
  repoRoot: string,
  ticketFile: string
): { targets: string[]; error: string | null } {
  const content = readFileSync(join(repoRoot, ticketFile), 'utf8');
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

function ownedTickets(repoRoot: string, units: readonly SpecUnit[]): OwnedTicket[] {
  const tickets: OwnedTicket[] = [];
  for (const unit of units) {
    for (const ticket of unit.tickets) {
      if (!ticket.taskId) continue;
      const parsed = ticketTargets(repoRoot, ticket.file);
      tickets.push({
        taskId: ticket.taskId,
        ticketFile: ticket.file,
        specFile: unit.specFile.split(sep).join('/'),
        targets: parsed.targets,
        targetError: parsed.error,
      });
    }
  }
  return tickets.sort((a, b) => compareText(a.taskId, b.taskId));
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

type ParsedSourceHeader = {
  fileIndexes: number[];
  specIndexes: number[];
  taskIndexes: number[];
  consumerIndexes: number[];
  fileValue: string;
  specValue: string;
  consumerValue: string;
  bodyTagIndexes: number[];
  prefixes: string[];
  blocks: Array<{
    tag: 'file' | 'spec' | 'tasks' | 'consumers';
    prefix: string;
    start: number;
    end: number;
    lines: string[];
  }>;
  ambiguousHeaderIndexes: number[];
};

function parseSourceHeader(content: string): ParsedSourceHeader {
  const lines = content.split(/\r?\n/);
  let headerEnd = 0;
  let blockComment = false;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? '').trim();
    if (index === 0 && trimmed.startsWith('#!')) {
      headerEnd = index + 1;
      continue;
    }
    if (blockComment) {
      headerEnd = index + 1;
      if (trimmed.includes('*/')) blockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      headerEnd = index + 1;
      blockComment = !trimmed.includes('*/');
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('//') || /^#(?:\s|@|$)/.test(trimmed)) {
      headerEnd = index + 1;
      continue;
    }
    break;
  }
  const result: ParsedSourceHeader = {
    fileIndexes: [],
    specIndexes: [],
    taskIndexes: [],
    consumerIndexes: [],
    fileValue: '',
    specValue: '',
    consumerValue: '',
    bodyTagIndexes: [],
    prefixes: [],
    blocks: [],
    ambiguousHeaderIndexes: [],
  };
  const records: Array<{
    tag: 'file' | 'spec' | 'tasks' | 'consumers';
    prefix: string;
    index: number;
  }> = [];
  lines.forEach((line, index) => {
    const match = /^\s*(\/\/|#)\s*@(file|spec|tasks|consumers):\s*(.*)$/.exec(line);
    if (!match) return;
    if (index >= headerEnd) {
      result.bodyTagIndexes.push(index);
      return;
    }
    const prefix = match[1] as string;
    const tag = match[2] as 'file' | 'spec' | 'tasks' | 'consumers';
    const value = match[3] ?? '';
    result.prefixes.push(prefix);
    records.push({ tag, prefix, index });
    if (tag === 'file') {
      result.fileIndexes.push(index);
      result.fileValue = value;
    } else if (tag === 'spec') {
      result.specIndexes.push(index);
      result.specValue = value;
    } else if (tag === 'tasks') result.taskIndexes.push(index);
    else {
      result.consumerIndexes.push(index);
      result.consumerValue = value;
    }
  });
  const claimed = new Set<number>();
  for (const record of records) {
    let end = record.index + 1;
    const escapedPrefix = record.prefix === '//' ? '\\/\\/' : '#';
    const continuation = new RegExp(`^\\s*${escapedPrefix}[ \\t]{2,}.*$`);
    while (end < headerEnd && continuation.test(lines[end] ?? '')) end += 1;
    for (let index = record.index; index < end; index += 1) claimed.add(index);
    result.blocks.push({
      tag: record.tag,
      prefix: record.prefix,
      start: record.index,
      end,
      lines: lines.slice(record.index, end),
    });
  }
  if (records.length > 0) {
    const first = records[0]?.index ?? 0;
    for (let index = first; index < headerEnd; index += 1) {
      if (!claimed.has(index) && (lines[index] ?? '').trim() !== '') {
        result.ambiguousHeaderIndexes.push(index);
      }
    }
  }
  return result;
}

function renderSourceHeader(content: string, header: ParsedSourceHeader, specId: string): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const insertAt = Math.min(...header.blocks.map((block) => block.start));
  const removed = new Set(
    header.blocks.flatMap((block) =>
      Array.from({ length: block.end - block.start }, (_, offset) => block.start + offset)
    )
  );
  const prefix = header.prefixes[0] as string;
  const fileBlock = header.blocks.find((block) => block.tag === 'file') as {
    lines: string[];
  };
  const consumerBlock = header.blocks.find((block) => block.tag === 'consumers') as {
    lines: string[];
  };
  const canonical = [...fileBlock.lines, `${prefix} @spec: ${specId}`, ...consumerBlock.lines];
  const out: string[] = [];
  lines.forEach((line, index) => {
    if (index === insertAt) out.push(...canonical);
    if (!removed.has(index)) out.push(line);
  });
  return out.join(newline);
}

/**
 * @purpose Preflight all Spec-ID and source-header writes coupled to one actual scope move.
 * @invariant Returns no rewrites when any mapping is missing, ambiguous, malformed or would drop
 *   an unrecoverable legacy relation; the caller must not perform any other move writes on failure.
 * @param repoRoot Absolute repository root.
 * @param scopeUnits Migration units belonging to the scope being moved.
 * @returns Whole-scope rewrites or every deterministic blocker.
 */
export function planMigrationFileHeaders(
  repoRoot: string,
  scopeUnits: readonly SpecUnit[]
): MigrationFileHeaderPlan {
  const errors: string[] = [];
  const specPlan = explicitSpecPlans(repoRoot, scopeUnits, errors);
  const allTickets = [
    ...ownedTickets(repoRoot, scanMigrationUnits(repoRoot).units),
    ...v2OwnedTickets(repoRoot, errors),
  ];
  const currentTicketFiles = new Set(
    scopeUnits.flatMap((unit) => unit.tickets.map((ticket) => ticket.file))
  );
  for (const ticket of allTickets) {
    if (currentTicketFiles.has(ticket.ticketFile) && ticket.targetError !== null) {
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
  const sources = collectFiles(repoRoot, (file) => isSddSourceFile(file));
  for (const absolute of sources) {
    const file = relative(repoRoot, absolute).split(sep).join('/');
    const before = readFileSync(absolute, 'utf8');
    const legacyIds = parseTasksHeader(before);
    const allDirectTickets = (ticketsByTarget.get(file) ?? []).filter((ticket) =>
      resolverClaimsFile(repoRoot, file, ticket)
    );
    const directTickets = allDirectTickets.filter((ticket) =>
      currentTicketFiles.has(ticket.ticketFile)
    );
    const referencedScopeTickets = legacyIds
      .flatMap((id) => ticketsById.get(id) ?? [])
      .filter((ticket) => currentTicketFiles.has(ticket.ticketFile));
    if (directTickets.length === 0 && referencedScopeTickets.length === 0) continue;

    const evidence = new Map<string, OwnedTicket>();
    const addEvidence = (ticket: OwnedTicket): void => {
      evidence.set(`${ticket.ticketFile}\0${ticket.specFile}`, ticket);
    };
    for (const ticket of [...allDirectTickets, ...referencedScopeTickets]) addEvidence(ticket);
    for (const legacyId of legacyIds) {
      const matches = ticketsById.get(legacyId) ?? [];
      const ticketFiles = [...new Set(matches.map((ticket) => ticket.ticketFile))];
      if (ticketFiles.length === 0) {
        errors.push(
          `${file}: legacy @tasks relation ${legacyId} не разрешается в мигрируемом scope`
        );
        continue;
      }
      if (ticketFiles.length > 1) {
        errors.push(
          `${file}: legacy @tasks relation ${legacyId} неоднозначен (${ticketFiles.join(', ')})`
        );
        continue;
      }
      const targetErrors = matches
        .map((ticket) => ticket.targetError)
        .filter((error): error is string => error !== null);
      if (targetErrors.length > 0) {
        errors.push(
          `${file}: ticket ${legacyId} не даёт проверяемый target (${targetErrors.join('; ')})`
        );
        continue;
      }
      const claiming = matches.filter((ticket) => resolverClaimsFile(repoRoot, file, ticket));
      if (claiming.length === 0) {
        errors.push(`${file}: ticket ${legacyId} не объявляет файл exact Target/Deleted File`);
        continue;
      }
      for (const ticket of claiming) addEvidence(ticket);
    }
    for (const ticket of evidence.values()) {
      if (ticket.targetError) {
        errors.push(
          `${file}: ticket ${ticket.taskId} не даёт проверяемый target (${ticket.targetError})`
        );
      }
    }

    const ownerSpecs = [...new Set([...evidence.values()].map((ticket) => ticket.specFile))].sort(
      compareText
    );
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
    const header = parseSourceHeader(before);
    if (header.bodyTagIndexes.length > 0) {
      errors.push(
        `${file}: ownership tag вне canonical leading header (строки ${header.bodyTagIndexes.map((index) => index + 1).join(', ')})`
      );
      continue;
    }
    if (header.ambiguousHeaderIndexes.length > 0) {
      errors.push(
        `${file}: ownership header содержит неоднозначные comment lines (строки ${header.ambiguousHeaderIndexes.map((index) => index + 1).join(', ')})`
      );
      continue;
    }
    if (
      header.fileIndexes.length !== 1 ||
      header.consumerIndexes.length !== 1 ||
      header.fileValue.trim() === '' ||
      header.consumerValue.trim() === ''
    ) {
      errors.push(
        `${file}: canonical header требует ровно один непустой @file и один непустой @consumers`
      );
      continue;
    }
    if (new Set(header.prefixes).size !== 1) {
      errors.push(`${file}: canonical header смешивает comment prefixes // и #`);
      continue;
    }
    if (header.taskIndexes.length > 1 || header.specIndexes.length > 1) {
      errors.push(`${file}: дублированный @tasks/@spec header неоднозначен`);
      continue;
    }
    const tasksBlock = header.blocks.find((block) => block.tag === 'tasks');
    const specBlock = header.blocks.find((block) => block.tag === 'spec');
    if ((tasksBlock?.lines.length ?? 1) > 1 || (specBlock?.lines.length ?? 1) > 1) {
      errors.push(`${file}: @tasks/@spec continuation нельзя безопасно перенести`);
      continue;
    }
    if (header.specIndexes.length === 1 && header.specValue !== specId) {
      errors.push(
        `${file}: существующий @spec ${header.specValue || '(empty)'} конфликтует с ${specId}`
      );
      continue;
    }
    const after = renderSourceHeader(before, header, specId);
    if (after !== before) {
      sourceRewrites.push({
        file,
        before,
        after,
        report: `header  ${file} — @spec ${specId}; legacy @tasks удалён`,
      });
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
