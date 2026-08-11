// @file: Unit tests for migration-move — plan blocking, ticket relocation, index scaffolding, tasks/<scope> cleanup.
// @consumers: migration-move
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planScopeMove, executeScopeMove, rewriteMovedLinks } from '../migration-move.ts';
import { scanMigrationUnits, scaffoldUnitFile, unitFilePath } from '../migration-plan.ts';

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

  it('rewriteMovedLinks: относительная ссылка пересчитывается на новый путь, внешние URL и якоря без пути не трогаются', () => {
    const byOldPath = new Map([['tasks/demo/core/core.task-1.md', 'specs/demo/core/core.task.demo-alpha.md']]);
    const r = rewriteMovedLinks(
      'см. [тикет](core.task-1.md) и [сайт](https://example.com) и [якорь](#section)',
      'tasks/demo/core/core.task-2.md',
      'tasks/demo/core/core.task-2.md',
      byOldPath
    );
    assert.strictEqual(r.count, 1);
    assert.match(r.text, /\[тикет\]\(\.\.\/\.\.\/\.\.\/specs\/demo\/core\/core\.task\.demo-alpha\.md\)/);
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
