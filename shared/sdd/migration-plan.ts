// @file: v1→v2 migration plan layer — scan the repo into per-spec units, scaffold one
//   `migration/**/*.migration.md` file per spec (generated inventory + agent-filled maps + step
//   checklist), and verify the layer deterministically (inventory drift, map coverage, slug
//   collisions). The plan is the on-disk source of truth the execution steps consume.
// @consumers: sdd-migrate.cmd
// @tasks: N/A

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep, basename, dirname } from 'node:path';
import { extractSection } from './section.ts';
import { parseMeta } from './tracker.ts';
import { REQUIRED_SECTIONS, MODULE_REQUIRED_V2, FOLD_REQUIRED_V2, type Finding } from './check.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

/** @purpose One v1 ticket attached to a unit — identity + the facts the plan needs. */
export type UnitTicket = {
  /** @purpose Ticket path relative to the repo root. */
  file: string;
  /** @purpose Task-ID from Meta (e.g. `TSK-31`), or null when unparseable. */
  taskId: string | null;
  /** @purpose Status token from Meta (e.g. `[x] DONE`), or null. */
  status: string | null;
  /** @purpose First line of Meta `Purpose:` — the slug source, or null. */
  purpose: string | null;
};

/** @purpose One migration unit = one spec file + its tickets + the derived target skeleton. */
export type SpecUnit = {
  /** @purpose Spec path relative to the repo root. */
  specFile: string;
  /** @purpose Scope name — first path segment under `specs/`. */
  scope: string;
  /** @purpose Module dir name for a module spec (depth ≥ specs/<scope>/<module>/…), null for a scope spec. */
  module: string | null;
  /** @purpose scope-type token from the SCOPE_TYPE section, or null when absent. */
  scopeType: string | null;
  /** @purpose Spec line count. */
  lines: number;
  /** @purpose Count of ```mermaid blocks in the spec. */
  mermaidCount: number;
  /** @purpose SECTION anchor names present, in document order. */
  anchors: string[];
  /** @purpose Level-2 headings in document order (fenced blocks excluded). */
  headings: string[];
  /** @purpose Tickets attached to this unit (Meta Module → dir path → scope fallback), path-sorted. */
  tickets: UnitTicket[];
  /** @purpose Required target SECTION names this spec must produce after migration. */
  targetSections: string[];
  /** @purpose Target sections whose detail must fold under `<details>` after migration. */
  foldSections: string[];
};

/** @purpose Full scan result — units plus tickets no unit claimed (never silently dropped). */
export type MigrationScan = {
  /** @purpose One migration unit per scanned spec. */
  units: SpecUnit[];
  /** @purpose Tickets whose scope has no spec dir — must be resolved by the operator. */
  orphanTickets: UnitTicket[];
};

/** @purpose Unit lifecycle status — written in the unit file, gates what verify demands. */
export const UNIT_STATUSES = ['PLANNED', 'MAPPED', 'APPROVED', 'DONE'] as const;

/** @purpose One token from UNIT_STATUSES — a unit's lifecycle state. */
export type UnitStatus = (typeof UNIT_STATUSES)[number];

/** @purpose Closed vocabulary for Section Map actions — anything else is a verify error. */
export const SECTION_ACTIONS = ['keep', 'rename', 'merge', 'split', 'create', 'drop'] as const;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage']);

// ─── Scan ─────────────────────────────────────────────────────────────────────

/** @purpose Recursively collect files matching a predicate, skipping system dirs and symlinks. */
function walkFiles(dir: string, match: (name: string) => boolean, acc: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name) || e.isSymbolicLink()) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, match, acc);
    else if (e.isFile() && match(e.name)) acc.push(full);
  }
}

/** @purpose Level-2 headings in document order, ignoring lines inside ``` fences. */
function level2Headings(content: string): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const line of content.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^##\s/.test(line)) out.push(line.trim());
  }
  return out;
}

/** @purpose SECTION anchor names present in a document, in order, deduplicated. */
function anchorNames(content: string): string[] {
  const seen = new Set<string>();
  for (const m of content.matchAll(/<!--SECTION:([A-Z][A-Z0-9_]*)-->/g)) {
    if (m[1]) seen.add(m[1]);
  }
  return [...seen];
}

/** @purpose scope-type token from the SCOPE_TYPE section, or null. */
function scopeTypeOf(content: string): string | null {
  const sec = extractSection(content, 'SCOPE_TYPE');
  if (sec.status !== 'ok') return null;
  const m = /\b(product|library|infrastructure|interface)\b/.exec(sec.content);
  return m?.[1] ?? null;
}

/** @purpose Parse one v1 ticket into a UnitTicket + its Meta Scope/Module claims. */
function readTicket(
  repoRoot: string,
  file: string
): { ticket: UnitTicket; scope: string | null; module: string | null } {
  let content = '';
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    // unreadable ticket still appears in the plan (with null facts) — never silently dropped
  }
  const metaSec = extractSection(content, 'META');
  const metaBody =
    metaSec.status === 'ok'
      ? metaSec.content
      : (/##[^\n]*\bMeta\b[^\n]*\n([\s\S]*?)(?=\n## |$)/.exec(content)?.[1] ?? '');
  const meta = parseMeta(metaBody);
  const purpose = /\*\*Purpose:\*\*\s*([^\n]+)/.exec(metaBody)?.[1]?.trim() ?? null;
  const scope = /\*\*Scope:\*\*\s*`?([\w./-]+)`?/.exec(metaBody)?.[1] ?? null;
  const module = /\*\*Module:\*\*\s*`?([\w./-]+)`?/.exec(metaBody)?.[1] ?? null;
  return {
    ticket: {
      file: relative(repoRoot, file),
      taskId: meta.taskId,
      status: meta.status,
      purpose,
    },
    scope,
    module,
  };
}

/**
 * @purpose Scan a v1 repo into migration units — one per spec under `specs/`, each claiming its
 * tickets from `tasks/`.
 * @invariant Deterministic: units and tickets are path-sorted; a rescan of an unchanged repo
 *   yields a byte-identical result.
 * @invariant Every ticket lands somewhere — a ticket whose scope has no spec at all goes to
 *   `orphanTickets`, never dropped.
 * @param repoRoot Absolute repo root (holds `specs/` and `tasks/`).
 * @returns Units + orphan tickets.
 */
export function scanMigrationUnits(repoRoot: string): MigrationScan {
  const specsRoot = join(repoRoot, 'specs');
  const specFiles: string[] = [];
  walkFiles(specsRoot, (n) => n.endsWith('.spec.md') || n.endsWith('.1-spec.md'), specFiles);
  specFiles.sort();

  const units: SpecUnit[] = [];
  for (const abs of specFiles) {
    const rel = relative(repoRoot, abs);
    const parts = rel.split(sep);
    // rel = specs/<scope>/... — scope specs sit at depth 3, module specs at depth ≥ 4
    const scope = parts[1];
    if (!scope || parts.length < 3) continue;
    const module = parts.length >= 4 ? (parts[parts.length - 2] ?? null) : null;
    const content = readFileSync(abs, 'utf-8');
    const isModule = module !== null;
    const scopeType = scopeTypeOf(content);
    const targetSections = isModule
      ? ['MODULE_VISION', 'OVERVIEW', ...MODULE_REQUIRED_V2.filter((s) => s !== 'MODULE_VISION')]
      : ['OVERVIEW', ...(scopeType ? (REQUIRED_SECTIONS[scopeType] ?? []) : [])];
    units.push({
      specFile: rel,
      scope,
      module,
      scopeType,
      lines: content.split('\n').length,
      mermaidCount: (content.match(/^\s*```mermaid/gm) ?? []).length,
      anchors: anchorNames(content),
      headings: level2Headings(content),
      tickets: [],
      targetSections: [...new Set(targetSections)],
      foldSections: isModule ? [...FOLD_REQUIRED_V2] : [],
    });
  }

  // #region START_TICKET_ATTACH — the tasks/<scope>/ path is the physical truth; Meta only refines
  // the module pick (v1 Meta Scope/Module are loose — they may name a module or a spec-less sub-part).
  const ticketFiles: string[] = [];
  walkFiles(join(repoRoot, 'tasks'), (n) => /\.task-[0-9]+\.md$/.test(n), ticketFiles);
  ticketFiles.sort();

  const orphanTickets: UnitTicket[] = [];
  for (const abs of ticketFiles) {
    const rel = relative(repoRoot, abs);
    const scope = rel.split(sep)[1] ?? '';
    const { ticket, scope: metaScope, module: metaModule } = readTicket(repoRoot, abs);
    const dirModule = rel.split(sep).length >= 4 ? rel.split(sep)[2] : null;

    const inScope = units.filter((u) => u.scope === scope);
    const byMetaModule = metaModule ? inScope.find((u) => u.module === metaModule) : undefined;
    const byDirModule = dirModule ? inScope.find((u) => u.module === dirModule) : undefined;
    // Meta Scope sometimes names a module of the physical scope — try it as a module before falling back.
    const byMetaScope = metaScope ? inScope.find((u) => u.module === metaScope) : undefined;
    const scopeUnit = inScope.find((u) => u.module === null);
    const target = byMetaModule ?? byDirModule ?? byMetaScope ?? scopeUnit;
    if (target) target.tickets.push(ticket);
    else orphanTickets.push(ticket);
  }
  // #endregion END_TICKET_ATTACH

  return { units, orphanTickets };
}

// ─── Scaffold ─────────────────────────────────────────────────────────────────

/**
 * @purpose Path of a unit's migration file, mirroring the spec's path under `migration/`.
 * @param unit The scanned unit.
 * @returns Repo-relative path of the unit's `*.migration.md`.
 */
export function unitFilePath(unit: SpecUnit): string {
  const specRelDir = dirname(unit.specFile).split(sep).slice(1).join(sep); // drop leading "specs"
  const base = basename(unit.specFile).replace(/\.md$/, '.migration.md');
  return join('migration', specRelDir, base);
}

/** @purpose Render the generated INVENTORY block body — the byte-comparable fact sheet. */
function renderInventory(unit: SpecUnit): string {
  const lines: string[] = [
    '## Inventory',
    '',
    '<!-- Сгенерировано `sdd-migrate plan`. Не редактировать руками — `plan --verify` сверяет этот блок с реальностью и падает при расхождении. -->',
    '',
    `- spec: \`${unit.specFile}\` · строк: ${unit.lines} · scope-type: ${unit.scopeType ? `\`${unit.scopeType}\`` : '—'} · mermaid-блоков: ${unit.mermaidCount} · якорей: ${unit.anchors.length}`,
    `- обязательные целевые секции: ${unit.targetSections.map((s) => `\`${s}\``).join(', ')}`,
  ];
  if (unit.foldSections.length > 0)
    lines.push(
      `- секции, чья детализация сворачивается в \`<details>\`: ${unit.foldSections.map((s) => `\`${s}\``).join(', ')}`
    );
  lines.push('- заголовки (level 2):');
  for (const h of unit.headings) lines.push(`  - \`${h}\``);
  if (unit.headings.length === 0) lines.push('  - (нет)');
  lines.push('- тикеты:');
  for (const t of unit.tickets)
    lines.push(
      `  - \`${t.file}\` · ${t.taskId ? `\`${t.taskId}\`` : '—'} · ${t.status ?? '—'} · ${t.purpose ?? '—'}`
    );
  if (unit.tickets.length === 0) lines.push('  - (нет)');
  return lines.join('\n');
}

/** @purpose Render the agent-filled Section Map scaffold — one row per source heading + one `create` row per target section. */
function renderSectionMap(unit: SpecUnit): string {
  const lines: string[] = [
    '## Section Map',
    '',
    '<!-- Заполняет агент, изучив исходник спеки. Каждый заголовок из Inventory — ровно одна строка.',
    `     Действия: ${SECTION_ACTIONS.join(' | ')}. Каждая обязательная целевая секция должна появиться в колонке «Цель».`,
    '     Полный целевой порядок секций — в format-файле структуры (ai/directives/sdd-v2/formats/*-spec-structure.xml). -->',
    '',
    '| Источник | Действие | Цель (SECTION) | Комментарий |',
    '|---|---|---|---|',
  ];
  for (const h of unit.headings) lines.push(`| \`${h}\` | ? | ? | |`);
  for (const s of unit.targetSections)
    lines.push(`| — | create | ${s} | если не покрыта строками выше — создать |`);
  return lines.join('\n');
}

/** @purpose Render the agent-filled Ticket Map scaffold — new ID + destination per ticket. */
function renderTicketMap(unit: SpecUnit): string {
  const specBase = basename(unit.specFile).replace(/\.(1-spec|spec)\.md$/, '');
  const destDir = dirname(unit.specFile);
  const lines: string[] = [
    '## Ticket Map',
    '',
    '<!-- Новый ID: `<ACR>-<slug>` — kebab-case, слаг из Meta.Purpose, уникален в рамках всего репо.',
    `     Назначение вычисляется из ID: \`${destDir}/${specBase}.task.<новый-ID>.md\`. -->`,
    '',
    '| Файл | Task-ID | Новый ID | Назначение |',
    '|---|---|---|---|',
  ];
  for (const t of unit.tickets) lines.push(`| \`${t.file}\` | ${t.taskId ?? '—'} | ? | ? |`);
  if (unit.tickets.length === 0) lines.push('| (нет тикетов) | — | — | — |');
  return lines.join('\n');
}

/** @purpose Render the agent-filled Diagram Plan scaffold. */
function renderDiagramPlan(unit: SpecUnit): string {
  return [
    '## Diagram Plan',
    '',
    '<!-- Заполняет агент: какая диаграмма встанет в Overview (обязательная) и откуда её содержание',
    '     (существующий mermaid-блок / новая — из какого текста строится). Дополнительные диаграммы',
    '     (последовательности, потоки данных) — по решению агента, если они улучшают чтение. -->',
    '',
    `- существующих mermaid-блоков: ${unit.mermaidCount}`,
    '- Overview-диаграмма: ?',
  ].join('\n');
}

/** @purpose Render the per-unit step checklist — the parallel worker's self-sufficient job card. */
function renderSteps(unit: SpecUnit): string {
  const scopeGate = `npx tsx cli/gennady.ts sdd-check --all specs/${unit.scope}`;
  return [
    '## Steps',
    '',
    '<!-- Работа этого юнита. Механические шаги всего репо (anchors / ids / move) живут в migration/README.md',
    '     и выполняются централизованно — здесь только то, что делается в рамках этой спеки. -->',
    '',
    '- [ ] S1 ✍️ Изучить исходник, заполнить Section Map / Ticket Map / Diagram Plan → **Status:** MAPPED',
    '- [ ] S2 ✅ `npx tsx cli/gennady.ts sdd-migrate plan --verify` — карты полны, расхождений с реальностью нет',
    '- [ ] S3 🛑 Подтверждение оператора → **Status:** APPROVED',
    '- [ ] S4 ✍️ Реструктуризация спеки по Section Map: целевой порядок секций из format-файла, заголовки без номеров, тяжёлые секции — в `<details>`, Overview с диаграммой по Diagram Plan',
    '- [ ] S5 ✍️ Текст — плоский технический русский (без калек и метафор; код/ID/токены — English)',
    `- [ ] S6 ✅ \`${scopeGate}\` — строгий v2-гейт (структура, фолды, разбор mermaid, язык) → **Status:** DONE`,
    '',
  ].join('\n');
}

/**
 * @purpose Render a full unit migration file — generated inventory + agent-filled map scaffolds +
 * step checklist, regions wrapped in SECTION anchors.
 * @param unit The scanned unit.
 * @returns Markdown text of the unit's `*.migration.md`.
 */
export function scaffoldUnitFile(unit: SpecUnit): string {
  return [
    `# План миграции: ${unit.specFile}`,
    '',
    `- **Status:** PLANNED <!-- ${UNIT_STATUSES.join(' → ')} -->`,
    `- **Scope:** ${unit.scope}${unit.module ? ` | **Module:** ${unit.module}` : ''}`,
    '',
    '<!--SECTION:INVENTORY-->',
    renderInventory(unit),
    '<!--/SECTION:INVENTORY-->',
    '',
    '<!--SECTION:SECTION_MAP-->',
    renderSectionMap(unit),
    '<!--/SECTION:SECTION_MAP-->',
    '',
    '<!--SECTION:TICKET_MAP-->',
    renderTicketMap(unit),
    '<!--/SECTION:TICKET_MAP-->',
    '',
    '<!--SECTION:DIAGRAM_PLAN-->',
    renderDiagramPlan(unit),
    '<!--/SECTION:DIAGRAM_PLAN-->',
    '',
    '<!--SECTION:STEPS-->',
    renderSteps(unit),
    '<!--/SECTION:STEPS-->',
    '',
  ].join('\n');
}

/**
 * @purpose Render `migration/README.md` — the global tracker: repo-wide mechanical steps in order,
 * then the generated unit table.
 * @param scan Full scan result.
 * @returns Markdown text.
 */
export function scaffoldPlanReadme(scan: MigrationScan): string {
  const lines: string[] = [
    '# Миграция v1 → v2 — план',
    '',
    'Слой сгенерирован `sdd-migrate plan`. Один файл плана — на одну спеку (её секции + её задачи).',
    'Статусы юнитов живут в самих unit-файлах; `sdd-migrate plan --verify` проверяет весь слой.',
    '',
    '## Порядок исполнения',
    '',
    '- [ ] G1 🤖 `sdd-migrate anchors --all . --write` — якоря во все v1-тикеты (идемпотентно)',
    '- [ ] G2 ✍️ Заполнить unit-файлы (Section Map / Ticket Map / Diagram Plan) — раздаётся параллельно, по одному юниту на агента',
    '- [ ] G3 ✅ `sdd-migrate plan --verify` — весь слой полон, слаги без коллизий, расхождений нет',
    '- [ ] G4 🛑 Подтверждение оператора по всему плану',
    '- [ ] G5 🤖 `sdd-migrate ids --map migration/ids.tsv --write` — карта собирается из всех Ticket Map; замена по словогранице',
    '- [ ] G6 🤖 `sdd-migrate move --scope <scope> --write` — по одному scope: переезд тикетов + индексы `*.3-tasks.md`; пустой `tasks/<scope>/` удаляется → строгие v2-проверки включаются на этом scope',
    '- [ ] G7 ✍️ Шаги S4–S6 каждого юнита — раздаётся параллельно (юниты не пересекаются по файлам)',
    '- [ ] G8 ✅ Финальный гейт: `sdd-state` → `FLOW_VERSION=v2` · `sdd-check --all .` чист · ноль старых Task-ID',
    '',
    '## Юниты',
    '',
    '| План | Спека | Тикетов |',
    '|---|---|---|',
  ];
  for (const u of scan.units)
    lines.push(`| \`${unitFilePath(u)}\` | \`${u.specFile}\` | ${u.tickets.length} |`);
  if (scan.orphanTickets.length > 0) {
    lines.push('', '## ⚠ Тикеты без юнита', '');
    lines.push('Их scope не имеет спеки — решить с оператором до старта:', '');
    for (const t of scan.orphanTickets) lines.push(`- \`${t.file}\` (${t.taskId ?? '—'})`);
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Verify ───────────────────────────────────────────────────────────────────

/**
 * @purpose Parse `- **Status:** TOKEN` from a unit file, or null.
 * @param content Full unit file markdown.
 * @returns The parsed status token, or null when absent/unrecognized.
 */
export function unitStatus(content: string): UnitStatus | null {
  const m = /\*\*Status:\*\*\s*([A-Z]+)/.exec(content);
  const token = m?.[1];
  return token && (UNIT_STATUSES as readonly string[]).includes(token)
    ? (token as UnitStatus)
    : null;
}

/** @purpose Split a markdown table row into trimmed content cells. */
function rowCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** @purpose Data rows of the first table inside a section body (header + separator skipped). */
function tableRows(sectionBody: string): string[][] {
  const rows: string[][] = [];
  let headerSeen = false;
  for (const line of sectionBody.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue;
    if (!headerSeen) {
      headerSeen = true;
      continue;
    }
    if (/^\|?\s*-+\s*\|/.test(line)) continue;
    rows.push(rowCells(line));
  }
  return rows;
}

/** @purpose Strip surrounding backticks from a cell value. */
function unquote(cell: string): string {
  return cell.replace(/^`|`$/g, '').trim();
}

/** @purpose New-ID grammar: `<acr>-<slug>` kebab-case, ≥ 2 words. */
const NEW_ID_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

/**
 * @purpose Verify one unit file against a fresh scan — inventory drift, map coverage, ID grammar.
 * `PLANNED` allows `?` placeholders; `MAPPED`+ requires complete maps.
 * @param file Unit file path (for findings).
 * @param content Unit file text.
 * @param fresh Freshly scanned unit for the same spec.
 * @returns Findings (error severity — the plan layer gates execution, drift must stop it).
 */
export function verifyUnitFile(file: string, content: string, fresh: SpecUnit): Finding[] {
  const findings: Finding[] = [];
  const err = (code: string, message: string): void => {
    findings.push({ severity: 'error', code, file, message });
  };

  const status = unitStatus(content);
  if (status === null) {
    err(
      'MIG_STATUS_INVALID',
      `Строка **Status:** отсутствует или несёт неизвестный токен — допустимо: ${UNIT_STATUSES.join(' / ')}.`
    );
    return findings;
  }
  const mapped = status !== 'PLANNED';

  // #region START_INVENTORY_DRIFT — the generated block must byte-match a rescan
  const inv = extractSection(content, 'INVENTORY');
  if (inv.status !== 'ok') {
    err('MIG_INVENTORY_MISSING', 'Секция INVENTORY отсутствует или разбалансирована.');
  } else if (inv.content.trim() !== renderInventory(fresh).trim()) {
    err(
      'MIG_INVENTORY_DRIFT',
      'Inventory разошёлся с реальностью (спека или тикеты изменились после генерации плана) — перегенерируй юнит: sdd-migrate plan --all --write.'
    );
  }
  // #endregion END_INVENTORY_DRIFT

  // #region START_SECTION_MAP — every source heading exactly once; targets covered; vocabulary closed
  const secMap = extractSection(content, 'SECTION_MAP');
  if (secMap.status !== 'ok') {
    err('MIG_SECTION_MAP_MISSING', 'Секция SECTION_MAP отсутствует или разбалансирована.');
  } else {
    const rows = tableRows(secMap.content);
    const sourceRows = rows.filter((r) => unquote(r[0] ?? '') !== '—');
    const seenSources = sourceRows.map((r) => unquote(r[0] ?? ''));
    for (const h of fresh.headings) {
      const n = seenSources.filter((s) => s === h).length;
      if (n === 0)
        err('MIG_SECTION_UNMAPPED', `Заголовок из Inventory без строки в Section Map: \`${h}\`.`);
      if (n > 1)
        err(
          'MIG_SECTION_DUPLICATED',
          `Заголовок отображён ${n} раз(а): \`${h}\` — нужна ровно одна строка.`
        );
    }
    for (const s of seenSources) {
      if (!fresh.headings.includes(s))
        err(
          'MIG_SECTION_UNKNOWN',
          `Строка Section Map ссылается на несуществующий заголовок: \`${s}\`.`
        );
    }
    for (const r of rows) {
      const action = (r[1] ?? '').trim();
      const okAction =
        (SECTION_ACTIONS as readonly string[]).includes(action) || (!mapped && action === '?');
      if (!okAction)
        err(
          'MIG_BAD_ACTION',
          `Недопустимое действие «${action}» — словарь: ${SECTION_ACTIONS.join(' | ')}${mapped ? '' : ' (или ? до заполнения)'}.`
        );
      if (mapped && (r[2] ?? '').trim() === '?')
        err(
          'MIG_TARGET_UNSET',
          `Цель не заполнена для строки «${unquote(r[0] ?? '')}» при Status ≥ MAPPED.`
        );
    }
    if (mapped) {
      const targets = rows.map((r) => (r[2] ?? '').trim());
      for (const t of fresh.targetSections) {
        if (!targets.includes(t))
          err(
            'MIG_TARGET_MISSING',
            `Обязательная целевая секция не производится ни одной строкой: \`${t}\`.`
          );
      }
    }
  }
  // #endregion END_SECTION_MAP

  // #region START_TICKET_MAP — every ticket covered; IDs and destinations well-formed when MAPPED
  const tickMap = extractSection(content, 'TICKET_MAP');
  if (tickMap.status !== 'ok') {
    err('MIG_TICKET_MAP_MISSING', 'Секция TICKET_MAP отсутствует или разбалансирована.');
  } else {
    const rows = tableRows(tickMap.content).filter((r) => unquote(r[0] ?? '') !== '(нет тикетов)');
    const seenFiles = rows.map((r) => unquote(r[0] ?? ''));
    for (const t of fresh.tickets) {
      if (!seenFiles.includes(t.file))
        err('MIG_TICKET_UNMAPPED', `Тикет из Inventory без строки в Ticket Map: \`${t.file}\`.`);
    }
    for (const r of rows) {
      const src = unquote(r[0] ?? '');
      if (!fresh.tickets.some((t) => t.file === src)) {
        err(
          'MIG_TICKET_UNKNOWN',
          `Строка Ticket Map ссылается на несуществующий тикет: \`${src}\`.`
        );
        continue;
      }
      const newId = unquote(r[2] ?? '');
      const dest = unquote(r[3] ?? '');
      if (mapped) {
        if (!NEW_ID_REGEX.test(newId)) {
          err(
            'MIG_BAD_SLUG',
            `Новый ID «${newId}» не соответствует грамматике \`<acr>-<slug>\` (kebab-case, ≥ 2 слова) — тикет \`${src}\`.`
          );
        } else {
          const specBase = basename(fresh.specFile).replace(/\.(1-spec|spec)\.md$/, '');
          const expected = join(dirname(fresh.specFile), `${specBase}.task.${newId}.md`);
          if (dest !== expected)
            err(
              'MIG_BAD_DESTINATION',
              `Назначение «${dest}» не совпадает с вычисленным «${expected}» — тикет \`${src}\`.`
            );
        }
      }
    }
  }
  // #endregion END_TICKET_MAP

  // #region START_DIAGRAM_PLAN — must be filled once MAPPED
  const diag = extractSection(content, 'DIAGRAM_PLAN');
  if (diag.status !== 'ok') {
    err('MIG_DIAGRAM_PLAN_MISSING', 'Секция DIAGRAM_PLAN отсутствует или разбалансирована.');
  } else if (mapped && /Overview-диаграмма:\s*\?/.test(diag.content)) {
    err(
      'MIG_DIAGRAM_PLAN_EMPTY',
      'Diagram Plan не заполнен (Overview-диаграмма: ?) при Status ≥ MAPPED.'
    );
  }
  // #endregion END_DIAGRAM_PLAN

  return findings;
}

/** @purpose One unit file read from the migration layer. */
export type PlanFile = {
  /** @purpose Repo-relative unit file path. */
  file: string;
  /** @purpose Full unit file markdown. */
  content: string;
};

/**
 * @purpose Verify the whole migration layer: every unit has its plan file, verifies against a
 * fresh scan, new IDs collide nowhere, orphans are surfaced.
 * @param repoRoot Absolute repo root.
 * @returns Findings across the layer (empty = the plan is sound and current).
 */
export function verifyMigrationPlan(repoRoot: string): Finding[] {
  const findings: Finding[] = [];
  const scan = scanMigrationUnits(repoRoot);

  const idOwners = new Map<string, string>();
  for (const unit of scan.units) {
    const planPath = unitFilePath(unit);
    const abs = join(repoRoot, planPath);
    if (!existsSync(abs)) {
      findings.push({
        severity: 'error',
        code: 'MIG_UNIT_FILE_MISSING',
        file: planPath,
        message: `Нет файла плана для спеки \`${unit.specFile}\` — сгенерируй: sdd-migrate plan --all --write.`,
      });
      continue;
    }
    const content = readFileSync(abs, 'utf-8');
    findings.push(...verifyUnitFile(planPath, content, unit));

    // cross-unit new-ID collisions (repo-wide uniqueness)
    const tickMap = extractSection(content, 'TICKET_MAP');
    if (tickMap.status === 'ok') {
      for (const r of tableRows(tickMap.content)) {
        const newId = unquote(r[2] ?? '');
        if (!NEW_ID_REGEX.test(newId)) continue;
        const owner = idOwners.get(newId);
        if (owner && owner !== planPath) {
          findings.push({
            severity: 'error',
            code: 'MIG_SLUG_COLLISION',
            file: planPath,
            message: `Новый ID «${newId}» уже занят в \`${owner}\` — слаг уникален в рамках репо.`,
          });
        } else {
          idOwners.set(newId, planPath);
        }
      }
    }
  }

  for (const t of scan.orphanTickets) {
    findings.push({
      severity: 'error',
      code: 'MIG_TICKET_ORPHAN',
      file: t.file,
      message: 'Тикет без юнита: его scope не имеет спеки — решить с оператором до миграции.',
    });
  }

  return findings;
}
