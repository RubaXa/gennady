// @file: Unit tests for migration-move — plan blocking, ticket relocation, index scaffolding, tasks/<scope> cleanup.
// @consumers: migration-move
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  planScopeMove,
  executeScopeMove,
  rewriteMovedLinks,
  renameCriticRoundHeadings,
} from '../migration-move.ts';
import { scanMigrationUnits, scaffoldUnitFile, unitFilePath } from '../migration-plan.ts';
import { planMigrationFileHeaders } from '../migration-file-headers.ts';

let root: string;

const SCOPE_SPEC = [
  '# demo',
  '<!--SECTION:SCOPE_TYPE-->',
  '## scope-type',
  'library',
  '<!--/SECTION:SCOPE_TYPE-->',
  '## 1. Vision',
  'x',
].join('\n');

const MODULE_SPEC = '# core\n## 1. Module Vision\nx';

// Тикеты уже после ids-replace: Meta несёт новые ID.
const TICKET_A = [
  '# Task: demo-alpha — Первая фича',
  '## 1. Meta',
  '- **Task-ID:** demo-alpha | **Status:** [x] DONE | **Scope:** demo | **Module:** core | **Dependencies:** None',
  '- **Purpose:** первая.',
  '',
  'Продолжение: [core.task-2.md](core.task-2.md).',
].join('\n');

const TICKET_B = [
  '# Task: demo-beta — Вторая фича',
  '## 1. Meta',
  '- **Task-ID:** demo-beta | **Status:** [ ] TODO | **Scope:** demo | **Module:** core | **Dependencies:** demo-alpha (даёт базу)',
  '- **Purpose:** вторая.',
].join('\n');

function ticketWithTarget(content: string, target: string): string {
  return [
    content,
    '',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    '| P1 | implementation | — | [ ] TODO |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '- **Target Files:**',
    `  - \`${target}\``,
    '- **Deleted Files:**',
    '  - —',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '### Round 1 — 2026-09-21, initial',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

function v2TicketWithTarget(taskId: string, specRef: string, target: string): string {
  return [
    `# Task: ${taskId} — Existing V2 work`,
    '<!--SECTION:META-->',
    `- **Task-ID:** ${taskId} | **Status:** [ ] TODO | **Scope:** already | **Module:** — | **Dependencies:** None`,
    '- **Purpose:** existing V2 relation.',
    '- **Spec References:**',
    `  - [owner](${specRef})`,
    '<!--/SECTION:META-->',
    '<!--SECTION:PHASES_OVERVIEW-->',
    '| ID | Kind | Deps | Status |',
    '|---|---|---|---|',
    '| P1 | impl | — | [ ] TODO |',
    '<!--/SECTION:PHASES_OVERVIEW-->',
    '<!--SECTION:PHASE_P1-->',
    '- **Target Files:**',
    `  - \`${target}\``,
    '- **Deleted Files:**',
    '  - —',
    '<!--/SECTION:PHASE_P1-->',
    '<!--SECTION:EXECUTION_LOG-->',
    '### Round 1 — 2026-09-21, initial',
    '<!--/SECTION:EXECUTION_LOG-->',
  ].join('\n');
}

function fillPlanLayer(): void {
  const scan = scanMigrationUnits(root);
  for (const unit of scan.units) {
    let content = scaffoldUnitFile(unit)
      .replace(
        '| `tasks/demo/core/core.task-1.md` | demo-alpha | ? | ? |',
        '| `tasks/demo/core/core.task-1.md` | demo-alpha | demo-alpha | `specs/demo/core/core.task.demo-alpha.md` |'
      )
      .replace(
        '| `tasks/demo/core/core.task-2.md` | demo-beta | ? | ? |',
        '| `tasks/demo/core/core.task-2.md` | demo-beta | demo-beta | `specs/demo/core/core.task.demo-beta.md` |'
      );
    const p = join(root, unitFilePath(unit));
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content, 'utf-8');
  }
}

function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function commitAll(message: string): void {
  git('add', '-A');
  git('-c', 'commit.gpgSign=false', 'commit', '-q', '-m', message);
}

function initHistory(): void {
  git('init', '-q');
  git('config', 'user.email', 'migration-test@example.com');
  git('config', 'user.name', 'migration-test');
}

describe('migration-move', () => {
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'sdd-migration-move-'));
  });
  beforeEach(() => {
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, 'specs', 'demo', 'core'), { recursive: true });
    mkdirSync(join(root, 'tasks', 'demo', 'core'), { recursive: true });
    writeFileSync(join(root, 'specs', 'demo', 'demo.spec.md'), SCOPE_SPEC, 'utf-8');
    writeFileSync(join(root, 'specs', 'demo', 'core', 'core.spec.md'), MODULE_SPEC, 'utf-8');
    // v1-имена файлов сохраняют старые номера; Meta уже с новыми ID (ids-режим отработал раньше move)
    writeFileSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md'), TICKET_A, 'utf-8');
    writeFileSync(join(root, 'tasks', 'demo', 'core', 'core.task-2.md'), TICKET_B, 'utf-8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'README.md'),
      '# demo — Tasks\n\n- [core.task-1.md](core/core.task-1.md)\n- [core.task-2.md](core/core.task-2.md)\n',
      'utf-8'
    );
  });
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('без слоя миграции план заблокирован с внятными причинами', () => {
    const p = planScopeMove(root, 'demo');
    assert.ok(!p.ok);
    if (!p.ok) assert.match(p.errors.join('\n'), /нет файла плана/);
  });

  it('с незаполненным Ticket Map (?) — заблокирован', () => {
    const scan = scanMigrationUnits(root);
    for (const unit of scan.units) {
      const p = join(root, unitFilePath(unit));
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, scaffoldUnitFile(unit), 'utf-8');
    }
    const p = planScopeMove(root, 'demo');
    assert.ok(!p.ok);
    if (!p.ok) assert.match(p.errors.join('\n'), /Ticket Map не заполнен/);
  });

  it('dry-run показывает mv/index, ничего не пишет', () => {
    fillPlanLayer();
    const r = executeScopeMove(root, 'demo', false);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) {
      assert.match(
        r.report.join('\n'),
        /would mv\s+tasks\/demo\/core\/core\.task-1\.md → specs\/demo\/core\/core\.task\.demo-alpha\.md/
      );
      assert.match(r.report.join('\n'), /would index specs\/demo\/core\/core\.3-tasks\.md/);
    }
    assert.ok(existsSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md')));
    assert.ok(!existsSync(join(root, 'specs', 'demo', 'core', 'core.3-tasks.md')));
  });

  it('--write: переезд, индексы из Meta, пустой tasks/<scope> удалён (fallback rename вне git)', () => {
    fillPlanLayer();
    const r = executeScopeMove(root, 'demo', true);
    assert.ok(r.ok, JSON.stringify(r));

    assert.ok(existsSync(join(root, 'specs', 'demo', 'core', 'core.task.demo-alpha.md')));
    assert.ok(existsSync(join(root, 'specs', 'demo', 'core', 'core.task.demo-beta.md')));
    assert.ok(!existsSync(join(root, 'tasks', 'demo')));
    // last scope migrated → the now-empty tasks/ root itself must be removed (flips FLOW_VERSION to v2)
    assert.ok(!existsSync(join(root, 'tasks')));

    const moduleIndex = readFileSync(
      join(root, 'specs', 'demo', 'core', 'core.3-tasks.md'),
      'utf-8'
    );
    assert.match(moduleIndex, /\| demo-alpha \| Первая фича \| — \| \[x\] DONE \| — \|/);
    assert.match(moduleIndex, /\| demo-beta \| Вторая фича \| demo-alpha \| \[ \] TODO \| — \|/);
    assert.match(moduleIndex, /demo_beta\[demo-beta\] --> demo_alpha\[demo-alpha\]/);
    assert.match(moduleIndex, /## Slug Registry/);

    const scopeIndex = readFileSync(join(root, 'specs', 'demo', 'demo.3-tasks.md'), 'utf-8');
    assert.match(scopeIndex, /\| demo-alpha \| Первая фича \| core \|/);
    assert.match(scopeIndex, /## Cascade Table/);
  });

  it('FO-6: dry-run показывает stable Spec ID и canonical source header, не меняя байты', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const before = [
      '// @file: demo behavior',
      '// @consumers: DemoCommand',
      '// @tasks: demo-alpha',
      'export const demo = true;',
      '',
    ].join('\n');
    writeFileSync(source, before, 'utf8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', false);
    assert.ok(result.ok, JSON.stringify(result));
    if (result.ok) {
      assert.match(result.report.join('\n'), /would spec-id specs\/demo\/demo\.spec\.md — DEMO/);
      assert.match(
        result.report.join('\n'),
        /would header\s+shared\/demo\.ts — @spec DEMO-CORE; legacy @tasks удалён/
      );
    }
    assert.strictEqual(readFileSync(source, 'utf8'), before);
    assert.doesNotMatch(
      readFileSync(join(root, 'specs', 'demo', 'core', 'core.spec.md'), 'utf8'),
      /SPEC_ID/
    );
  });

  it('FO-6: write материализует ID/header, untouched V1 сохраняет байты, второй apply strict no-op', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const untouched = join(root, 'shared', 'legacy.ts');
    writeFileSync(
      source,
      '// @file: demo behavior\n// @tasks: demo-alpha\n// @consumers: DemoCommand\nexport const demo = true;\n',
      'utf8'
    );
    const untouchedBytes =
      '// @file: untouched V1\n// @consumers: LegacyCommand\n// @tasks: OTHER-1\nexport const old = true;\n';
    writeFileSync(untouched, untouchedBytes, 'utf8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    fillPlanLayer();

    const first = executeScopeMove(root, 'demo', true);
    assert.ok(first.ok, JSON.stringify(first));
    const migrated = readFileSync(source, 'utf8');
    assert.match(
      migrated,
      /^\/\/ @file: demo behavior\n\/\/ @spec: DEMO-CORE\n\/\/ @consumers: DemoCommand\n/
    );
    assert.doesNotMatch(migrated, /@tasks:/);
    assert.match(
      readFileSync(join(root, 'specs', 'demo', 'core', 'core.spec.md'), 'utf8'),
      /^# core\n<!--SECTION:SPEC_ID-->\nDEMO-CORE\n<!--\/SECTION:SPEC_ID-->/
    );
    assert.strictEqual(readFileSync(untouched, 'utf8'), untouchedBytes);

    const snapshot = new Map(
      [source, untouched, join(root, 'specs', 'demo', 'core', 'core.spec.md')].map((file) => [
        file,
        readFileSync(file, 'utf8'),
      ])
    );
    const second = executeScopeMove(root, 'demo', true);
    assert.ok(second.ok, JSON.stringify(second));
    if (second.ok)
      assert.deepStrictEqual(second.report, ['  no-op scope demo — уже мигрирован в v2']);
    for (const [file, bytes] of snapshot) assert.strictEqual(readFileSync(file, 'utf8'), bytes);
  });

  it('FO-6: unrecoverable legacy relation блокирует весь scope до любых writes', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const sourceBytes =
      '// @file: demo behavior\n// @tasks: demo-alpha, UNKNOWN-9\n// @consumers: DemoCommand\n';
    writeFileSync(source, sourceBytes, 'utf8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(!result.ok, JSON.stringify(result));
    if (!result.ok) {
      assert.match(result.errors.join('\n'), /UNKNOWN-9/);
      assert.match(result.errors.join('\n'), /legacy @tasks relation/);
    }
    assert.strictEqual(readFileSync(source, 'utf8'), sourceBytes);
    assert.ok(existsSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md')));
    assert.doesNotMatch(
      readFileSync(join(root, 'specs', 'demo', 'core', 'core.spec.md'), 'utf8'),
      /SPEC_ID/
    );
  });

  it('FO-6: repo-wide duplicate explicit Spec ID блокирует весь scope', () => {
    const duplicate = '<!--SECTION:SPEC_ID-->\nDUPLICATE\n<!--/SECTION:SPEC_ID-->\n';
    writeFileSync(
      join(root, 'specs', 'demo', 'demo.spec.md'),
      SCOPE_SPEC.replace('# demo\n', `# demo\n${duplicate}`),
      'utf8'
    );
    writeFileSync(
      join(root, 'specs', 'demo', 'core', 'core.spec.md'),
      MODULE_SPEC.replace('# core\n', `# core\n${duplicate}`),
      'utf8'
    );
    fillPlanLayer();
    const result = executeScopeMove(root, 'demo', true);
    assert.ok(!result.ok);
    if (!result.ok) assert.match(result.errors.join('\n'), /Spec ID DUPLICATE неоднозначен/);
    assert.ok(existsSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md')));
  });

  it('FO-6: exact target без @tasks мигрируется, existing valid Spec ID остаётся authority', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    writeFileSync(
      source,
      '// @file: exact target\n// @consumers: DemoCommand\nexport const demo = true;\n',
      'utf8'
    );
    writeFileSync(
      join(root, 'specs', 'demo', 'core', 'core.spec.md'),
      '# core\n<!--SECTION:SPEC_ID-->\nSTABLE-OWNER\n<!--/SECTION:SPEC_ID-->\n## 1. Module Vision\nx',
      'utf8'
    );
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(result.ok, JSON.stringify(result));
    assert.match(readFileSync(source, 'utf8'), /\/\/ @spec: STABLE-OWNER/);
    assert.strictEqual(
      readFileSync(join(root, 'specs', 'demo', 'core', 'core.spec.md'), 'utf8').match(
        /STABLE-OWNER/g
      )?.length,
      1
    );
  });

  it('FO-6: exact target двух owning specs блокируется как ambiguous без partial writes', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    mkdirSync(join(root, 'specs', 'demo', 'other'), { recursive: true });
    mkdirSync(join(root, 'tasks', 'demo', 'other'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const sourceBytes = '// @file: shared target\n// @consumers: DemoCommand\n';
    writeFileSync(source, sourceBytes, 'utf8');
    writeFileSync(join(root, 'specs', 'demo', 'other', 'other.spec.md'), '# other\n', 'utf8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    writeFileSync(
      join(root, 'tasks', 'demo', 'other', 'other.task-3.md'),
      ticketWithTarget(
        TICKET_B.replace(/demo-beta/g, 'demo-gamma').replace(
          '**Module:** core',
          '**Module:** other'
        ),
        'shared/demo.ts'
      ),
      'utf8'
    );
    fillPlanLayer();
    const otherPlan = join(root, 'migration', 'demo', 'other', 'other.spec.migration.md');
    writeFileSync(
      otherPlan,
      readFileSync(otherPlan, 'utf8').replace(
        '| `tasks/demo/other/other.task-3.md` | demo-gamma | ? | ? |',
        '| `tasks/demo/other/other.task-3.md` | demo-gamma | demo-gamma | `specs/demo/other/other.task.demo-gamma.md` |'
      ),
      'utf8'
    );

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(!result.ok);
    if (!result.ok) assert.match(result.errors.join('\n'), /semantic owner неоднозначен/);
    assert.strictEqual(readFileSync(source, 'utf8'), sourceBytes);
    assert.ok(existsSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md')));
  });

  it('FO-6: derived Spec ID collision с repo-wide explicit ID блокирует preflight', () => {
    mkdirSync(join(root, 'specs', 'other'), { recursive: true });
    writeFileSync(
      join(root, 'specs', 'other', 'other.spec.md'),
      '# other\n<!--SECTION:SPEC_ID-->\nDEMO-CORE\n<!--/SECTION:SPEC_ID-->\n',
      'utf8'
    );
    fillPlanLayer();
    const result = executeScopeMove(root, 'demo', true);
    assert.ok(!result.ok);
    if (!result.ok)
      assert.match(result.errors.join('\n'), /proposal Spec ID DEMO-CORE сталкивается/);
    assert.ok(existsSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md')));
  });

  it('FO-6: malformed SPEC_ID в untouched V1-соседе не блокирует текущий scope', () => {
    mkdirSync(join(root, 'specs', 'other'), { recursive: true });
    writeFileSync(
      join(root, 'specs', 'other', 'other.spec.md'),
      '# other\n<!--SECTION:SPEC_ID-->\nnot canonical\n<!--/SECTION:SPEC_ID-->\n',
      'utf8'
    );
    fillPlanLayer();
    const result = executeScopeMove(root, 'demo', true);
    assert.ok(result.ok, JSON.stringify(result));
    assert.match(
      readFileSync(join(root, 'specs', 'other', 'other.spec.md'), 'utf8'),
      /not canonical/
    );
  });

  it('FO-6 P1: @tasks-shaped prose в теле не является legacy header evidence и сохраняется', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const sourceBytes = [
      '// @file: demo behavior',
      '// @consumers: DemoCommand',
      'export const demo = true;',
      '// @tasks: demo-alpha',
      '',
    ].join('\n');
    writeFileSync(source, sourceBytes, 'utf8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(result.ok, JSON.stringify(result));
    const migrated = readFileSync(source, 'utf8');
    assert.match(migrated, /^\/\/ @file: demo behavior\n\/\/ @spec: DEMO-CORE\n\/\/ @consumers:/);
    assert.match(migrated, /export const demo = true;\n\/\/ @tasks: demo-alpha/);
  });

  it('FO-6 P2: blank + declaration JSDoc после header не считается ambiguous continuation', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    writeFileSync(
      source,
      [
        '/* Copyright Demo */',
        '// @file: demo behavior',
        '// @tasks: demo-alpha',
        '// @consumers: DemoCommand',
        '',
        '/** declaration docs */',
        'export const demo = true;',
        '',
      ].join('\n'),
      'utf8'
    );
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(
      readFileSync(source, 'utf8'),
      [
        '/* Copyright Demo */',
        '// @file: demo behavior',
        '// @spec: DEMO-CORE',
        '// @consumers: DemoCommand',
        '',
        '/** declaration docs */',
        'export const demo = true;',
        '',
      ].join('\n')
    );
  });

  it('FO-6 P3: deleted DONE ticket из bounded Git history сохраняет relation, но не становится owner', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    mkdirSync(join(root, 'tasks', 'archive'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const historicalTicket = join(root, 'tasks', 'archive', 'archive.task-169.md');
    writeFileSync(
      source,
      '// @file: demo behavior\n// @tasks: TSK-169\n// @consumers: DemoCommand\nexport const demo = true;\n',
      'utf8'
    );
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    writeFileSync(
      historicalTicket,
      ticketWithTarget(
        TICKET_A.replace(/demo-alpha/g, 'TSK-169').replace('**Scope:** demo', '**Scope:** archive'),
        'shared/demo.ts'
      ),
      'utf8'
    );
    initHistory();
    commitAll('historical ticket exists');
    rmSync(historicalTicket);
    commitAll('delete completed historical ticket');
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(result.ok, JSON.stringify(result));
    const migrated = readFileSync(source, 'utf8');
    assert.match(migrated, /\/\/ @spec: DEMO-CORE/);
    assert.doesNotMatch(migrated, /@tasks:/);
  });

  it('FO-6 P3: duplicate historical/current Task-ID выбирается exact target, не глобально', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    mkdirSync(join(root, 'tasks', 'other'), { recursive: true });
    mkdirSync(join(root, 'specs', 'other'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const originalTicket = join(root, 'tasks', 'demo', 'core', 'core.task-169.md');
    const successorTicket = join(root, 'tasks', 'demo', 'core', 'core.task-171.md');
    rmSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md'));
    writeFileSync(
      source,
      '// @file: collision-scoped behavior\n// @tasks: TSK-169\n// @consumers: DemoCommand\n',
      'utf8'
    );
    writeFileSync(
      originalTicket,
      ticketWithTarget(TICKET_B.replace(/demo-beta/g, 'TSK-169'), 'shared/demo.ts'),
      'utf8'
    );
    initHistory();
    commitAll('legacy TSK-169 belongs to demo target');
    renameSync(originalTicket, successorTicket);
    writeFileSync(
      successorTicket,
      readFileSync(successorTicket, 'utf8').replace(/TSK-169/g, 'TSK-171'),
      'utf8'
    );
    writeFileSync(join(root, 'specs', 'other', 'other.spec.md'), '# other\n', 'utf8');
    writeFileSync(
      join(root, 'tasks', 'other', 'other.task-169.md'),
      ticketWithTarget(
        TICKET_B.replace(/demo-beta/g, 'TSK-169')
          .replace('**Scope:** demo', '**Scope:** other')
          .replace('**Module:** core', '**Module:** —'),
        'shared/other.ts'
      ),
      'utf8'
    );
    commitAll('rename demo work to TSK-171 and reuse TSK-169 elsewhere');
    fillPlanLayer();
    const demoPlan = join(root, 'migration', 'demo', 'core', 'core.spec.migration.md');
    writeFileSync(
      demoPlan,
      readFileSync(demoPlan, 'utf8').replace(
        '| `tasks/demo/core/core.task-171.md` | TSK-171 | ? | ? |',
        '| `tasks/demo/core/core.task-171.md` | TSK-171 | TSK-171 | `specs/demo/core/core.task.TSK-171.md` |'
      ),
      'utf8'
    );

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(result.ok, JSON.stringify(result));
    assert.match(readFileSync(source, 'utf8'), /\/\/ @spec: DEMO-CORE/);
  });

  it('FO-6 P3: missing frozen Git object блокирует preflight до writes', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const sourceBytes =
      '// @file: missing history\n// @tasks: DELETED-1\n// @consumers: DemoCommand\n';
    writeFileSync(source, sourceBytes, 'utf8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    initHistory();
    commitAll('frozen input');
    fillPlanLayer();
    const units = scanMigrationUnits(root).units.filter((unit) => unit.scope === 'demo');

    const result = planMigrationFileHeaders(root, units, 'missing-frozen-object');
    assert.ok(!result.ok, JSON.stringify(result));
    if (!result.ok) assert.match(result.errors.join('\n'), /Git history.*недоступна/);
    assert.strictEqual(readFileSync(source, 'utf8'), sourceBytes);
    assert.doesNotMatch(
      readFileSync(join(root, 'specs', 'demo', 'core', 'core.spec.md'), 'utf8'),
      /SPEC_ID/
    );
  });

  it('FO-6 P3: shallow history блокирует deleted-ticket evidence до writes', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const sourceBytes =
      '// @file: shallow history\n// @tasks: DELETED-1\n// @consumers: DemoCommand\n';
    writeFileSync(source, sourceBytes, 'utf8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    initHistory();
    commitAll('shallow frozen input');
    const gitDir = git('rev-parse', '--git-dir').trim();
    writeFileSync(join(root, gitDir, 'shallow'), `${git('rev-parse', 'HEAD').trim()}\n`, 'utf8');
    fillPlanLayer();
    const units = scanMigrationUnits(root).units.filter((unit) => unit.scope === 'demo');

    const result = planMigrationFileHeaders(root, units);
    assert.ok(!result.ok, JSON.stringify(result));
    if (!result.ok) assert.match(result.errors.join('\n'), /Git history.*shallow/);
    assert.strictEqual(readFileSync(source, 'utf8'), sourceBytes);
  });

  it('FO-6: пустое обязательное значение source header блокирует V2 flip', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const sourceBytes = '// @file:\n// @tasks: demo-alpha\n// @consumers: DemoCommand\n';
    writeFileSync(source, sourceBytes, 'utf8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(!result.ok);
    if (!result.ok) assert.match(result.errors.join('\n'), /canonical header.*@file/);
    assert.strictEqual(readFileSync(source, 'utf8'), sourceBytes);
    assert.ok(existsSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md')));
  });

  it('FO-6: exact target из другого scope участвует read-only и блокирует ложного owner', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    mkdirSync(join(root, 'specs', 'other'), { recursive: true });
    mkdirSync(join(root, 'tasks', 'other'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const sourceBytes = '// @file: cross-scope target\n// @consumers: DemoCommand\n';
    writeFileSync(source, sourceBytes, 'utf8');
    writeFileSync(join(root, 'specs', 'other', 'other.spec.md'), '# other\n', 'utf8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    writeFileSync(
      join(root, 'tasks', 'other', 'other.task-1.md'),
      ticketWithTarget(
        TICKET_B.replace(/demo-beta/g, 'other-alpha')
          .replace('**Scope:** demo', '**Scope:** other')
          .replace('**Module:** core', '**Module:** —'),
        'shared/demo.ts'
      ),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(!result.ok);
    if (!result.ok) assert.match(result.errors.join('\n'), /semantic owner неоднозначен/);
    assert.strictEqual(readFileSync(source, 'utf8'), sourceBytes);
    assert.ok(existsSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md')));
  });

  it('FO-6: co-located V2 ticket предыдущего scope участвует в ambiguity proof', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    mkdirSync(join(root, 'specs', 'already'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const sourceBytes = '// @file: shared migration target\n// @consumers: DemoCommand\n';
    writeFileSync(source, sourceBytes, 'utf8');
    writeFileSync(
      join(root, 'specs', 'already', 'already.spec.md'),
      '# already\n<!--SECTION:SPEC_ID-->\nALREADY\n<!--/SECTION:SPEC_ID-->\n',
      'utf8'
    );
    writeFileSync(
      join(root, 'specs', 'already', 'already.3-tasks.md'),
      '# Tasks: already\n',
      'utf8'
    );
    writeFileSync(
      join(root, 'specs', 'already', 'second.spec.md'),
      '# second\n<!--SECTION:SPEC_ID-->\nALREADY-SECOND\n<!--/SECTION:SPEC_ID-->\n',
      'utf8'
    );
    writeFileSync(
      join(root, 'specs', 'already', 'already.task.already-alpha.md'),
      v2TicketWithTarget('already-alpha', './already.spec.md', 'shared/demo.ts').replace(
        '  - [owner](./already.spec.md)',
        '  - [owner](./already.spec.md)\n  - [secondary](./second.spec.md)'
      ),
      'utf8'
    );
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(!result.ok, JSON.stringify(result));
    if (!result.ok) {
      assert.match(result.errors.join('\n'), /semantic owner неоднозначен/);
      assert.match(result.errors.join('\n'), /specs\/already\/already\.spec\.md/);
      assert.match(result.errors.join('\n'), /specs\/already\/second\.spec\.md/);
    }
    assert.strictEqual(readFileSync(source, 'utf8'), sourceBytes);
    assert.ok(existsSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md')));
  });

  it('FO-6: unresolved Spec Reference в V2 evidence блокирует mapping даже при valid owner', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    mkdirSync(join(root, 'specs', 'already'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const sourceBytes = '// @file: shared migration target\n// @consumers: DemoCommand\n';
    writeFileSync(source, sourceBytes, 'utf8');
    writeFileSync(
      join(root, 'specs', 'demo', 'core', 'core.spec.md'),
      '# core\n<!--SECTION:SPEC_ID-->\nDEMO-CORE\n<!--/SECTION:SPEC_ID-->\n',
      'utf8'
    );
    writeFileSync(join(root, 'specs', 'already', 'already.3-tasks.md'), '# Tasks: already\n');
    writeFileSync(
      join(root, 'specs', 'already', 'already.task.already-alpha.md'),
      v2TicketWithTarget('already-alpha', '../demo/core/core.spec.md', 'shared/demo.ts').replace(
        '  - [owner](../demo/core/core.spec.md)',
        '  - [owner](../demo/core/core.spec.md)\n  - [broken](./missing.spec.md)'
      ),
      'utf8'
    );
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(!result.ok, JSON.stringify(result));
    if (!result.ok) assert.match(result.errors.join('\n'), /Spec References.*missing\.spec\.md/);
    assert.strictEqual(readFileSync(source, 'utf8'), sourceBytes);
    assert.ok(existsSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md')));
    assert.strictEqual(
      readFileSync(join(root, 'specs', 'demo', 'core', 'core.spec.md'), 'utf8'),
      '# core\n<!--SECTION:SPEC_ID-->\nDEMO-CORE\n<!--/SECTION:SPEC_ID-->\n'
    );
  });

  it('FO-6: malformed co-located V2 ticket блокирует incomplete corpus до writes', () => {
    mkdirSync(join(root, 'specs', 'already'), { recursive: true });
    writeFileSync(
      join(root, 'specs', 'already', 'already.3-tasks.md'),
      '# Tasks: already\n',
      'utf8'
    );
    writeFileSync(
      join(root, 'specs', 'already', 'already.task.broken.md'),
      [
        '# Task: already-broken',
        '<!--SECTION:META-->',
        '- **Task-ID:** already-broken | **Status:** [ ] TODO',
        '<!--/SECTION:META-->',
        '<!--SECTION:EXECUTION_LOG-->',
        '### Round 1 — 2026-09-21, initial',
        '<!--/SECTION:EXECUTION_LOG-->',
      ].join('\n'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(!result.ok);
    if (!result.ok) {
      assert.match(result.errors.join('\n'), /already\.task\.broken\.md/);
      assert.match(result.errors.join('\n'), /overview-missing/);
    }
    assert.ok(existsSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md')));
    assert.doesNotMatch(
      readFileSync(join(root, 'specs', 'demo', 'core', 'core.spec.md'), 'utf8'),
      /SPEC_ID/
    );
  });

  it('FO-6: malformed co-located-looking ticket в untouched V1 scope grandfathered byte-exact', () => {
    mkdirSync(join(root, 'specs', 'legacy'), { recursive: true });
    mkdirSync(join(root, 'tasks', 'legacy'), { recursive: true });
    const legacyTicket = join(root, 'specs', 'legacy', 'legacy.task.broken.md');
    const legacyBytes = '# not a canonical V2 ticket\n<!--SECTION:META-->\n';
    writeFileSync(legacyTicket, legacyBytes, 'utf8');
    writeFileSync(
      join(root, 'tasks', 'legacy', 'legacy.task-1.md'),
      TICKET_B.replace(/demo-beta/g, 'legacy-alpha').replace(
        '**Scope:** demo',
        '**Scope:** legacy'
      ),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(readFileSync(legacyTicket, 'utf8'), legacyBytes);
    assert.ok(existsSync(join(root, 'tasks', 'legacy', 'legacy.task-1.md')));
  });

  it('FO-6: unresolved Spec Reference в canonical-looking ticket untouched V1 grandfathered', () => {
    mkdirSync(join(root, 'specs', 'legacy'), { recursive: true });
    mkdirSync(join(root, 'tasks', 'legacy'), { recursive: true });
    writeFileSync(
      join(root, 'specs', 'legacy', 'legacy.spec.md'),
      '# legacy\n<!--SECTION:SPEC_ID-->\nLEGACY\n<!--/SECTION:SPEC_ID-->\n',
      'utf8'
    );
    const legacyTicket = join(root, 'specs', 'legacy', 'legacy.task.legacy-alpha.md');
    const legacyBytes = v2TicketWithTarget(
      'legacy-alpha',
      './legacy.spec.md',
      'shared/legacy.ts'
    ).replace(
      '  - [owner](./legacy.spec.md)',
      '  - [owner](./legacy.spec.md)\n  - [broken](./missing.spec.md)'
    );
    writeFileSync(legacyTicket, legacyBytes, 'utf8');
    writeFileSync(
      join(root, 'tasks', 'legacy', 'legacy.task-1.md'),
      TICKET_B.replace(/demo-beta/g, 'legacy-alpha').replace(
        '**Scope:** demo',
        '**Scope:** legacy'
      ),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(readFileSync(legacyTicket, 'utf8'), legacyBytes);
    assert.ok(existsSync(join(root, 'tasks', 'legacy', 'legacy.task-1.md')));
  });

  it('FO-6: rejected target текущего scope блокирует preflight даже без selected source', () => {
    const ticket = join(root, 'tasks', 'demo', 'core', 'core.task-1.md');
    const ticketBytes = ticketWithTarget(TICKET_A, '../escape.ts');
    const spec = join(root, 'specs', 'demo', 'core', 'core.spec.md');
    const specBytes = readFileSync(spec, 'utf8');
    writeFileSync(ticket, ticketBytes, 'utf8');
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(!result.ok, JSON.stringify(result));
    if (!result.ok) assert.match(result.errors.join('\n'), /ownership evidence.*escape\.ts/);
    assert.strictEqual(readFileSync(ticket, 'utf8'), ticketBytes);
    assert.strictEqual(readFileSync(spec, 'utf8'), specBytes);
  });

  it('FO-6: Python shebang + # header мигрируется без замены comment prefix', () => {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    const source = join(root, 'scripts', 'demo.py');
    writeFileSync(
      source,
      '#!/usr/bin/env python3\n# @file: demo worker\n# @tasks: demo-alpha\n# @consumers: DemoCommand\nprint("ok")\n',
      'utf8'
    );
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'scripts/demo.py'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(result.ok, JSON.stringify(result));
    assert.match(
      readFileSync(source, 'utf8'),
      /^#!\/usr\/bin\/env python3\n# @file: demo worker\n# @spec: DEMO-CORE\n# @consumers: DemoCommand\n/
    );
    assert.doesNotMatch(readFileSync(source, 'utf8'), /\/\/ @spec|@tasks:/);
  });

  it('FO-6: многострочные // @file/@consumers переносятся как byte-exact blocks', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const before = [
      '// Copyright Demo',
      '// @consumers: DemoCommand,',
      '//   ReviewCommand',
      '// @tasks: demo-alpha',
      '// @file: demo behavior',
      '//   with an exact continuation',
      'export const demo = true;',
      '',
    ].join('\n');
    writeFileSync(source, before, 'utf8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(
      readFileSync(source, 'utf8'),
      [
        '// Copyright Demo',
        '// @file: demo behavior',
        '//   with an exact continuation',
        '// @spec: DEMO-CORE',
        '// @consumers: DemoCommand,',
        '//   ReviewCommand',
        'export const demo = true;',
        '',
      ].join('\n')
    );
  });

  it('FO-6: многострочные # blocks после shebang сохраняют prefix и continuation bytes', () => {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    const source = join(root, 'scripts', 'demo.py');
    writeFileSync(
      source,
      [
        '#!/usr/bin/env python3',
        '# @file: demo worker',
        '#   exact continuation',
        '# @tasks: demo-alpha',
        '# @consumers: DemoCommand,',
        '#\t  BatchCommand',
        'print("ok")',
        '',
      ].join('\n'),
      'utf8'
    );
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'scripts/demo.py'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(result.ok, JSON.stringify(result));
    assert.strictEqual(
      readFileSync(source, 'utf8'),
      [
        '#!/usr/bin/env python3',
        '# @file: demo worker',
        '#   exact continuation',
        '# @spec: DEMO-CORE',
        '# @consumers: DemoCommand,',
        '#\t  BatchCommand',
        'print("ok")',
        '',
      ].join('\n')
    );
  });

  it('FO-6: неоднозначный comment между ownership blocks блокирует writes byte-exact', () => {
    mkdirSync(join(root, 'shared'), { recursive: true });
    const source = join(root, 'shared', 'demo.ts');
    const sourceBytes = [
      '// @file: demo behavior',
      '// not an attributable continuation',
      '// @tasks: demo-alpha',
      '// @consumers: DemoCommand',
      'export const demo = true;',
      '',
    ].join('\n');
    writeFileSync(source, sourceBytes, 'utf8');
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      ticketWithTarget(TICKET_A, 'shared/demo.ts'),
      'utf8'
    );
    fillPlanLayer();

    const result = executeScopeMove(root, 'demo', true);
    assert.ok(!result.ok, JSON.stringify(result));
    if (!result.ok) assert.match(result.errors.join('\n'), /неоднозначные comment lines.*2/);
    assert.strictEqual(readFileSync(source, 'utf8'), sourceBytes);
    assert.ok(existsSync(join(root, 'tasks', 'demo', 'core', 'core.task-1.md')));
    assert.doesNotMatch(
      readFileSync(join(root, 'specs', 'demo', 'core', 'core.spec.md'), 'utf8'),
      /SPEC_ID/
    );
  });

  // B2-02: a v1 ticket's legacy `## Critic Rounds` section is normalized at the exact moment it is
  // actively moved — never as a separate blanket corpus rewrite.
  it("--write: a moved ticket's legacy `## Critic Rounds` Round headings are renamed to `Critic Round`", () => {
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      [
        TICKET_A,
        '',
        '<!--SECTION:EXECUTION_LOG-->',
        '### Round 1 — 2026-05-31, initial',
        '#### Round close',
        '<!--/SECTION:EXECUTION_LOG-->',
        '',
        '## Critic Rounds',
        '### Round 2 — 2026-05-30',
      ].join('\n'),
      'utf-8'
    );
    fillPlanLayer();
    const r = executeScopeMove(root, 'demo', true);
    assert.ok(r.ok, JSON.stringify(r));

    const moved = readFileSync(
      join(root, 'specs', 'demo', 'core', 'core.task.demo-alpha.md'),
      'utf-8'
    );
    assert.match(moved, /### Round 1 — 2026-05-31, initial/);
    assert.match(moved, /### Critic Round 2 — 2026-05-30/);
  });

  it('rewriteMovedLinks: относительная ссылка пересчитывается на новый путь, внешние URL и якоря без пути не трогаются', () => {
    const byOldPath = new Map([
      ['tasks/demo/core/core.task-1.md', 'specs/demo/core/core.task.demo-alpha.md'],
    ]);
    const r = rewriteMovedLinks(
      'см. [тикет](core.task-1.md) и [сайт](https://example.com) и [якорь](#section)',
      'tasks/demo/core/core.task-2.md',
      'tasks/demo/core/core.task-2.md',
      byOldPath
    );
    assert.strictEqual(r.count, 1);
    assert.match(
      r.text,
      /\[тикет\]\(\.\.\/\.\.\/\.\.\/specs\/demo\/core\/core\.task\.demo-alpha\.md\)/
    );
    assert.match(r.text, /\[сайт\]\(https:\/\/example\.com\)/);
    assert.match(r.text, /\[якорь\]\(#section\)/);
  });

  it('--write: ссылка внутри переехавшего тикета и в README пересчитаны на новые пути', () => {
    fillPlanLayer();
    const dry = executeScopeMove(root, 'demo', false);
    assert.ok(dry.ok, JSON.stringify(dry));
    if (dry.ok) {
      assert.match(dry.report.join('\n'), /would link\s+tasks\/demo\/core\/core\.task-1\.md/);
      assert.match(dry.report.join('\n'), /would link\s+tasks\/demo\/README\.md/);
    }

    const r = executeScopeMove(root, 'demo', true);
    assert.ok(r.ok, JSON.stringify(r));

    const movedA = readFileSync(
      join(root, 'specs', 'demo', 'core', 'core.task.demo-alpha.md'),
      'utf-8'
    );
    assert.match(movedA, /\[core\.task-2\.md\]\(\.\/core\.task\.demo-beta\.md\)/);
  });

  it('другой scope ещё в tasks/ — корневой tasks/ не удаляется', () => {
    fillPlanLayer();
    mkdirSync(join(root, 'tasks', 'other'), { recursive: true });
    writeFileSync(
      join(root, 'tasks', 'other', 'other.task-1.md'),
      '# Task: TSK-50\n## 1. Meta\n- **Task-ID:** TSK-50 | **Status:** [ ] TODO | **Scope:** other\n- **Purpose:** другое.',
      'utf-8'
    );
    const r = executeScopeMove(root, 'demo', true);
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(!existsSync(join(root, 'tasks', 'demo')));
    assert.ok(
      existsSync(join(root, 'tasks')),
      'tasks/ root must stay — другой scope не мигрирован'
    );
    assert.ok(existsSync(join(root, 'tasks', 'other')));
  });

  it('тикет с назначением флэт (specs/<scope>/) — без отдельного модульного индекса, только scope-индекс', () => {
    const scan = scanMigrationUnits(root);
    for (const unit of scan.units) {
      let content = scaffoldUnitFile(unit);
      if (unit.module === 'core') {
        content = content
          .replace(
            '| `tasks/demo/core/core.task-1.md` | demo-alpha | ? | ? |',
            // flat destination — scope root, not a module subdir (legal per AX_HIERARCHICAL_SPECS)
            '| `tasks/demo/core/core.task-1.md` | demo-alpha | demo-alpha | `specs/demo/demo.task.demo-alpha.md` |'
          )
          .replace(
            '| `tasks/demo/core/core.task-2.md` | demo-beta | ? | ? |',
            '| `tasks/demo/core/core.task-2.md` | demo-beta | demo-beta | `specs/demo/core/core.task.demo-beta.md` |'
          );
      }
      const p = join(root, unitFilePath(unit));
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, content, 'utf-8');
    }
    const r = executeScopeMove(root, 'demo', true);
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(existsSync(join(root, 'specs', 'demo', 'demo.task.demo-alpha.md')));
    assert.ok(existsSync(join(root, 'specs', 'demo', 'core', 'core.task.demo-beta.md')));
    // module index still exists (demo-beta lives there) but demo-alpha (flat) does not get its own
    // row — it may still appear as a cross-module Dependencies reference on demo-beta's row.
    const moduleIndex = readFileSync(
      join(root, 'specs', 'demo', 'core', 'core.3-tasks.md'),
      'utf-8'
    );
    assert.doesNotMatch(moduleIndex, /^\| demo-alpha \|/m);
    const scopeIndex = readFileSync(join(root, 'specs', 'demo', 'demo.3-tasks.md'), 'utf-8');
    assert.match(scopeIndex, /\| demo-alpha \| Первая фича \| — \|/);
  });

  it('move пересчитывает ссылки под новое место: rule `..`-путь сохраняет цель, spec-ref → co-located', () => {
    // rule ref: `../../../ai/…` от tasks/demo/core (глуб.3) → repo-root ai/; после move в specs/demo/core
    // (та же глуб.3) должен остаться `../../../ai/…` (резолвится в тот же файл, `..` в v2 легален).
    // spec ref: repo-root-relative `specs/demo/core/core.spec.md` → co-located `./core.spec.md`.
    writeFileSync(
      join(root, 'tasks', 'demo', 'core', 'core.task-1.md'),
      TICKET_A +
        '\n\n- **Rules:** [r](../../../ai/directives/infra/x.xml)\n- **Spec:** [s](specs/demo/core/core.spec.md)\n',
      'utf-8'
    );
    fillPlanLayer();
    const res = executeScopeMove(root, 'demo', true);
    assert.ok(res.ok, JSON.stringify(res));
    const moved = readFileSync(
      join(root, 'specs', 'demo', 'core', 'core.task.demo-alpha.md'),
      'utf-8'
    );
    assert.match(moved, /\]\(\.\.\/\.\.\/\.\.\/ai\/directives\/infra\/x\.xml\)/);
    assert.match(moved, /\]\(\.\/core\.spec\.md\)/);
  });

  it('чужие тикеты вне плана блокируют удаление tasks/<scope>', () => {
    fillPlanLayer();
    writeFileSync(
      join(root, 'tasks', 'demo', 'stray.task-99.md'),
      '# Task: TSK-99\n## 1. Meta\n- **Task-ID:** TSK-99 | **Status:** [ ] TODO | **Scope:** demo\n- **Purpose:** блудный.',
      'utf-8'
    );
    // stray-тикет попал в scan → он прикрепится к scope-юниту и заблокирует план (нет строки в Ticket Map)
    const p = planScopeMove(root, 'demo');
    assert.ok(!p.ok);
  });
});

// B2-02: rename a legacy `## Critic Rounds` section's own `### Round N` headings so they can never
// again be confused with EXECUTION_LOG's own Rounds by any whole-file-scanning reader.
describe('renameCriticRoundHeadings', () => {
  it('renames every `### Round N` heading inside `## Critic Rounds`, leaving EXECUTION_LOG untouched', () => {
    const before = [
      '<!--SECTION:EXECUTION_LOG-->',
      '### Round 1 — 2026-06-20, initial',
      '<!--/SECTION:EXECUTION_LOG-->',
      '',
      '## Critic Rounds',
      '### Round 2 — 2026-05-30',
      'some notes',
      '### Round 3 — 2026-05-31',
    ].join('\n');
    const after = renameCriticRoundHeadings(before);
    assert.match(after, /### Round 1 — 2026-06-20, initial/);
    assert.match(after, /### Critic Round 2 — 2026-05-30/);
    assert.match(after, /### Critic Round 3 — 2026-05-31/);
    assert.doesNotMatch(after, /## Critic Rounds\n### Round/);
  });

  it('stops renaming at the next same-or-higher-level heading after Critic Rounds', () => {
    const before = [
      '## Critic Rounds',
      '### Round 1 — 2026-05-30',
      '## Decision Log',
      '### Round 9 — unrelated heading, not a real Round',
    ].join('\n');
    const after = renameCriticRoundHeadings(before);
    assert.match(after, /### Critic Round 1 — 2026-05-30/);
    assert.match(after, /### Round 9 — unrelated heading, not a real Round/);
  });

  it('is a no-op when there is no `## Critic Rounds` section', () => {
    const before = [
      '<!--SECTION:EXECUTION_LOG-->',
      '### Round 1 — 2026-06-20, initial',
      '<!--/SECTION:EXECUTION_LOG-->',
    ].join('\n');
    assert.strictEqual(renameCriticRoundHeadings(before), before);
  });

  it('is idempotent — already-renamed content comes back byte-identical', () => {
    const once = renameCriticRoundHeadings(
      ['## Critic Rounds', '### Round 1 — 2026-05-30'].join('\n')
    );
    assert.strictEqual(renameCriticRoundHeadings(once), once);
  });
});
