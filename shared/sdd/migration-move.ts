// @file: v1→v2 structural move for one scope — relocate tickets to their co-located destinations
//   (from the approved migration layer's Ticket Maps), scaffold the `*.3-tasks.md` indexes from
//   ticket Meta, and remove the emptied `tasks/<scope>/` (which mechanically flips the scope to v2).
// @consumers: sdd-migrate.cmd
// @tasks: N/A

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename, sep, relative, posix } from 'node:path';
import { extractSection } from './section.ts';
import { parseMeta } from './tracker.ts';
import { scanMigrationUnits, unitFilePath, type SpecUnit } from './migration-plan.ts';

/** @purpose One planned relocation: v1 ticket path → co-located v2 path (both repo-relative). */
export type MoveAction = {
  /** @purpose Repo-relative v1 ticket path. */
  from: string;
  /** @purpose Repo-relative co-located v2 destination path. */
  to: string;
  /** @purpose The ticket's new `<ACR>-<slug>` Task-ID. */
  newId: string;
};

/** @purpose One migrated ticket's index facts, read from its Meta after the ID replacement. */
type IndexTicket = { newId: string; title: string; status: string; deps: string[] };

/** @purpose Per-module index input — the unit, its destination dir, and its tickets. */
type UnitTickets = { unit: SpecUnit; tickets: IndexTicket[] };

/** @purpose Outcome of planning a scope move — actions, or the problems that block it. */
export type ScopeMovePlan =
  | { ok: true; moves: MoveAction[]; units: UnitTickets[] }
  | { ok: false; errors: string[] };

/** @purpose Extract ID tokens from a Meta Dependencies value (`<ACR>-<slug>` / `TSK-NN`, parentheticals ignored). */
function depIds(metaBody: string): string[] {
  const m = /\*\*Dependencies:\*\*\s*([^\n]+)/.exec(metaBody);
  if (!m || !m[1] || /^\s*(none|—|-)\s*$/i.test(m[1])) return [];
  const outsideParens = m[1].replace(/\([^)]*\)/g, ' ');
  return [...outsideParens.matchAll(/\b([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+)\b/g)].map(
    (x) => x[1] as string
  );
}

/** @purpose Ticket title from the `# Task: <id> — <title>` header, or the header remainder. */
function ticketTitle(content: string): string {
  const m = /^#\s+Task:\s*([^\n]+)/m.exec(content);
  if (!m || !m[1]) return '—';
  const rest = m[1].trim();
  const dash = rest.split('—');
  return (dash.length > 1 ? dash.slice(1).join('—') : rest).trim() || '—';
}

/**
 * @purpose Build the scope's move plan from the migration layer — every ticket needs an approved
 * Ticket Map row; anything less blocks the whole scope.
 * @invariant Read-only. Errors accumulate (all problems reported, not just the first).
 * @param repoRoot Absolute repo root.
 * @param scope Scope name.
 * @returns Actions + per-unit index inputs, or the blocking problems.
 */
export function planScopeMove(repoRoot: string, scope: string): ScopeMovePlan {
  const errors: string[] = [];
  const scan = scanMigrationUnits(repoRoot);
  const scopeUnits = scan.units.filter((u) => u.scope === scope);
  if (scopeUnits.length === 0)
    return { ok: false, errors: [`scope «${scope}» не найден среди юнитов миграции`] };

  const moves: MoveAction[] = [];
  const units: UnitTickets[] = [];
  for (const unit of scopeUnits) {
    const planPath = unitFilePath(unit);
    const abs = join(repoRoot, planPath);
    if (!existsSync(abs)) {
      if (unit.tickets.length > 0)
        errors.push(
          `нет файла плана ${planPath} — сгенерируй слой: sdd-migrate plan --all --write`
        );
      units.push({ unit, tickets: [] });
      continue;
    }
    const sec = extractSection(readFileSync(abs, 'utf-8'), 'TICKET_MAP');
    const rowByFile = new Map<string, { newId: string; dest: string }>();
    if (sec.status === 'ok') {
      for (const line of sec.content.split('\n')) {
        if (!line.trimStart().startsWith('|')) continue;
        const cells = line
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.replace(/`/g, '').trim());
        const file = cells[0] ?? '';
        if (file.startsWith('tasks' + sep) || file.startsWith('tasks/')) {
          rowByFile.set(file, { newId: cells[2] ?? '?', dest: cells[3] ?? '?' });
        }
      }
    }

    const indexTickets: IndexTicket[] = [];
    for (const t of unit.tickets) {
      const row = rowByFile.get(t.file);
      if (!row || row.newId === '?' || row.dest === '?') {
        errors.push(`тикет ${t.file}: Ticket Map не заполнен (новый ID/назначение) в ${planPath}`);
        continue;
      }
      const srcAbs = join(repoRoot, t.file);
      if (!existsSync(srcAbs)) {
        errors.push(
          `тикет ${t.file} отсутствует на диске (план разошёлся — sdd-migrate plan --verify)`
        );
        continue;
      }
      moves.push({ from: t.file, to: row.dest, newId: row.newId });

      const content = readFileSync(srcAbs, 'utf-8');
      const metaSec = extractSection(content, 'META');
      const metaBody = metaSec.status === 'ok' ? metaSec.content : content;
      const meta = parseMeta(metaBody);
      indexTickets.push({
        newId: row.newId,
        title: ticketTitle(content),
        status: meta.status ?? '[ ] TODO',
        deps: depIds(metaBody),
      });
    }
    units.push({ unit, tickets: indexTickets });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, moves, units };
}

/**
 * @purpose Render `<module>.3-tasks.md` per MODULE_TASKS_INDEX_STRUCTURE from ticket Meta.
 * @param moduleName Module name (heading + Decision Log title).
 * @param tickets Migrated tickets belonging to this module.
 * @returns Full index markdown.
 */
export function renderModuleIndex(moduleName: string, tickets: IndexTicket[]): string {
  const ids = new Set(tickets.map((t) => t.newId));
  const lines: string[] = [
    `# ${moduleName} — Tasks`,
    '',
    '## Tracker Index',
    '| Task-ID | Title | Dependencies | Status | Reopens |',
    '|---------|-------|--------------|--------|---------|',
  ];
  for (const t of tickets)
    lines.push(
      `| ${t.newId} | ${t.title} | ${t.deps.length > 0 ? t.deps.join(', ') : '—'} | ${t.status} | — |`
    );
  lines.push('', '## Slug Registry');
  lines.push(
    '<!-- один ID на строку; уникальность держится этим списком — одинаковый ID в двух ветках сталкивается здесь при merge. Только добавление. -->'
  );
  for (const t of tickets) lines.push(`- ${t.newId}`);
  lines.push('', '## Intra-Module DAG', '```mermaid', 'graph TD');
  let edges = 0;
  for (const t of tickets)
    for (const d of t.deps)
      if (ids.has(d)) {
        lines.push(
          `  ${t.newId.replace(/[^A-Za-z0-9]/g, '_')}[${t.newId}] --> ${d.replace(/[^A-Za-z0-9]/g, '_')}[${d}]`
        );
        edges++;
      }
  if (edges === 0) lines.push('  %% зависимостей внутри модуля нет');
  lines.push(
    '```',
    '<!-- ребро A → B = «A зависит от B». Кросс-модульные рёбра живут уровнем выше. -->'
  );
  lines.push(
    '',
    '## Decision Log (module-task level)',
    '<!-- решения декомпозиции/планирования; локальные решения исполнения — в Decision Log самих тикетов. -->'
  );
  lines.push(
    '',
    '## Conventions',
    'Проектные конвенции объявлены в `specs/3-tasks.md` и наследуются — здесь не повторяются.',
    ''
  );
  return lines.join('\n');
}

/**
 * @purpose Render `<scope>.3-tasks.md` per SCOPE_TASKS_INDEX_STRUCTURE — tracker + inter-module
 * DAG mechanical, Cascade Table left to the agent.
 * @param scope Scope name.
 * @param units Every module unit in the scope with its migrated tickets.
 * @returns Full index markdown.
 */
export function renderScopeIndex(scope: string, units: UnitTickets[]): string {
  const ownerOf = new Map<string, string>();
  for (const u of units) for (const t of u.tickets) ownerOf.set(t.newId, u.unit.module ?? scope);

  const lines: string[] = [
    `# Tasks: ${scope}`,
    '',
    '## Scope Spec',
    `- [Scope spec](./${scope}.spec.md)`,
    '',
    '## Cascade Table',
    '<!-- ЗАПОЛНЯЕТ АГЕНТ: действующие правила scope из Scope Graph (транзитивное замыкание depends-on). -->',
    '',
    '## Inter-Module DAG',
    '```mermaid',
    'graph TD',
  ];
  const edgeSeen = new Set<string>();
  for (const u of units) {
    const from = u.unit.module ?? scope;
    for (const t of u.tickets)
      for (const d of t.deps) {
        const to = ownerOf.get(d);
        if (to && to !== from) {
          const key = `${from}-->${to}`;
          if (!edgeSeen.has(key)) {
            edgeSeen.add(key);
            lines.push(
              `  ${from.replace(/[^A-Za-z0-9]/g, '_')}[${from}] --> ${to.replace(/[^A-Za-z0-9]/g, '_')}[${to}]`
            );
          }
        }
      }
  }
  if (edgeSeen.size === 0) lines.push('  %% кросс-модульных зависимостей нет');
  lines.push(
    '```',
    '',
    '## Tracker',
    '| Task-ID | Title | Module | Dependencies | Status | Reopens |',
    '|---------|-------|--------|--------------|--------|---------|'
  );
  for (const u of units)
    for (const t of u.tickets)
      lines.push(
        `| ${t.newId} | ${t.title} | ${u.unit.module ?? '—'} | ${t.deps.length > 0 ? t.deps.join(', ') : '—'} | ${t.status} | — |`
      );
  lines.push(
    '',
    '## Decision Log (scope task level)',
    '<!-- D-NNN scope-уровневых решений декомпозиции/планирования. -->',
    ''
  );
  return lines.join('\n');
}

/** @purpose Zones scanned for markdown links that may point at a moved ticket. */
const LINK_ZONES = ['specs', 'tasks'];

/** @purpose Split a raw link target into its path and optional `#fragment`. */
function splitLinkTarget(target: string): { path: string; fragment: string } {
  const i = target.indexOf('#');
  return i >= 0
    ? { path: target.slice(0, i), fragment: target.slice(i) }
    : { path: target, fragment: '' };
}

/**
 * @purpose Repoint markdown links in a file's text off a moved ticket's old path, onto its new one.
 * @invariant Skips empty targets, external URLs, and links whose resolved path is not in `byOldPath`.
 * @param text Full file content.
 * @param oldRefRelPath Path the file's existing links resolve against (where the author stood).
 * @param newRefRelPath Path to emit new links against — the file's destination, or itself if unmoved.
 * @param byOldPath Old repo-relative ticket path → new repo-relative ticket path.
 * @returns Rewritten text + count of links changed.
 */
export function rewriteMovedLinks(
  text: string,
  oldRefRelPath: string,
  newRefRelPath: string,
  byOldPath: Map<string, string>
): { text: string; count: number } {
  if (byOldPath.size === 0) return { text, count: 0 };
  const oldRefDir = posix.dirname(oldRefRelPath);
  const newRefDir = posix.dirname(newRefRelPath);
  let count = 0;
  const rewritten = text.replace(
    /\]\(([^)\s]+)([^)]*)\)/g,
    (whole: string, rawTarget: string, rest: string) => {
      if (rawTarget === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(rawTarget)) return whole;
      const { path, fragment } = splitLinkTarget(rawTarget);
      if (path === '') return whole;
      const resolved = posix.normalize(posix.join(oldRefDir, path));
      const newPath = byOldPath.get(resolved);
      if (!newPath) return whole;
      count++;
      let rel = posix.relative(newRefDir, newPath);
      if (!rel.startsWith('.')) rel = './' + rel;
      return `](${rel}${fragment}${rest})`;
    }
  );
  return { text: rewritten, count };
}

/** @purpose Recursively collect `.md` files under the given zone dirs, path-sorted. */
function collectMdFiles(repoRoot: string, zones: string[]): string[] {
  const acc: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.md')) acc.push(full);
    }
  };
  for (const z of zones) walk(join(repoRoot, z));
  return acc.sort();
}

/** @purpose Move one file, preferring `git mv` (keeps history), falling back to fs rename outside a repo. */
function moveFile(repoRoot: string, from: string, to: string): void {
  mkdirSync(dirname(join(repoRoot, to)), { recursive: true });
  try {
    execFileSync('git', ['mv', from, to], { cwd: repoRoot, stdio: 'pipe' });
  } catch {
    renameSync(join(repoRoot, from), join(repoRoot, to));
  }
}

/** @purpose True when a directory tree carries no v1 ticket files anymore. */
function noTicketsLeft(dir: string): boolean {
  const acc: string[] = [];
  const walk = (d: string): void => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.task-[0-9]+\.md$/.test(e.name)) acc.push(full);
    }
  };
  walk(dir);
  return acc.length === 0;
}

/**
 * @purpose Execute (or dry-run) the structural move for one scope: relocate tickets per the plan,
 * scaffold the module/scope `*.3-tasks.md` indexes, and remove the emptied `tasks/<scope>/`.
 * @invariant Nothing is written unless `write` — the dry-run report shows every action verbatim.
 * @invariant `tasks/<scope>/` is removed only when zero `*.task-*.md` remain under it.
 * @param repoRoot Absolute repo root.
 * @param scope Scope name.
 * @param write False = dry-run.
 * @returns Report lines, or the blocking problems.
 */
export function executeScopeMove(
  repoRoot: string,
  scope: string,
  write: boolean
): { ok: true; report: string[] } | { ok: false; errors: string[] } {
  const plan = planScopeMove(repoRoot, scope);
  if (!plan.ok) return plan;

  const verb = write ? '' : 'would ';
  const report: string[] = [];

  // #region START_LINK_REWRITE — relative markdown links to a moved ticket, fixed before the git mv
  // itself (so the rewritten content travels with the file); every .md file in specs/+tasks/ is a
  // candidate referrer, including the moved tickets' own bodies (resolved against their NEW path).
  const byOldPath = new Map(plan.moves.map((m) => [m.from, m.to]));
  if (byOldPath.size > 0) {
    for (const abs of collectMdFiles(repoRoot, LINK_ZONES)) {
      const rel = relative(repoRoot, abs);
      const newRelPath = byOldPath.get(rel) ?? rel;
      const { text, count } = rewriteMovedLinks(
        readFileSync(abs, 'utf-8'),
        rel,
        newRelPath,
        byOldPath
      );
      if (count > 0) {
        if (write) writeFileSync(abs, text, 'utf-8');
        report.push(`  ${verb}link  ${rel} — ${count} ссылк(и) на переезжающие тикеты`);
      }
    }
  }
  // #endregion END_LINK_REWRITE

  for (const m of plan.moves) {
    if (write) moveFile(repoRoot, m.from, m.to);
    report.push(`  ${verb}mv    ${m.from} → ${m.to}`);
  }

  for (const u of plan.units) {
    if (u.unit.module === null || u.tickets.length === 0) continue;
    const indexPath = join(
      dirname(u.unit.specFile),
      `${basename(dirname(u.unit.specFile))}.3-tasks.md`
    );
    if (write)
      writeFileSync(
        join(repoRoot, indexPath),
        renderModuleIndex(u.unit.module, u.tickets),
        'utf-8'
      );
    report.push(`  ${verb}index ${indexPath} — ${u.tickets.length} тикет(ов)`);
  }
  const scopeIndexPath = join('specs', scope, `${scope}.3-tasks.md`);
  if (write)
    writeFileSync(join(repoRoot, scopeIndexPath), renderScopeIndex(scope, plan.units), 'utf-8');
  report.push(`  ${verb}index ${scopeIndexPath} — сводный трекер scope`);

  const scopeTasksDir = join(repoRoot, 'tasks', scope);
  if (existsSync(scopeTasksDir)) {
    if (write) {
      if (noTicketsLeft(scopeTasksDir)) {
        rmSync(scopeTasksDir, { recursive: true, force: true });
        report.push(`  rm -r tasks/${scope}/ — пусто, scope переключён на v2`);
      } else {
        report.push(`  ⚠ tasks/${scope}/ НЕ удалён — там остались *.task-*.md вне плана`);
      }
    } else {
      report.push(`  would rm -r tasks/${scope}/ (если не останется тикетов)`);
    }
  }
  return { ok: true, report };
}
