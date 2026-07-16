// @file: Unit tests for the migration plan layer — scan / scaffold / verify on a tmp v1 fixture.
// @consumers: migration-plan
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  scanMigrationUnits,
  scaffoldUnitFile,
  scaffoldPlanReadme,
  unitFilePath,
  verifyUnitFile,
  verifyMigrationPlan,
} from '../migration-plan.ts';

let root: string;

const SCOPE_SPEC = [
  '# demo: Library Specification',
  '<!--SECTION:SCOPE_TYPE-->',
  '## scope-type',
  'library',
  '<!--/SECTION:SCOPE_TYPE-->',
  '## 1. Vision & Primary Goal',
  'Текст.',
  '## 2. Decision Log',
  'Решения.',
].join('\n');

const MODULE_SPEC = [
  '# core module',
  '## 1. Module Vision',
  'Текст.',
  '```mermaid',
  'flowchart LR',
  '  A --> B',
  '```',
].join('\n');

const TICKET = [
  '# Task: TSK-7 — Демо',
  '## 1. Meta',
  '- **Task-ID:** TSK-7 | **Status:** [x] DONE | **Scope:** demo | **Module:** core',
  '- **Purpose:** сделать демо-фичу.',
].join('\n');

function writeFixture(): void {
  mkdirSync(join(root, 'specs', 'demo', 'core'), { recursive: true });
  mkdirSync(join(root, 'tasks', 'demo', 'core'), { recursive: true });
  writeFileSync(join(root, 'specs', 'demo', 'demo.spec.md'), SCOPE_SPEC, 'utf-8');
  writeFileSync(join(root, 'specs', 'demo', 'core', 'core.spec.md'), MODULE_SPEC, 'utf-8');
  writeFileSync(join(root, 'tasks', 'demo', 'core', 'core.task-7.md'), TICKET, 'utf-8');
}

describe('migration-plan', () => {
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'sdd-migration-plan-'));
  });
  beforeEach(() => {
    rmSync(join(root, 'specs'), { recursive: true, force: true });
    rmSync(join(root, 'tasks'), { recursive: true, force: true });
    rmSync(join(root, 'migration'), { recursive: true, force: true });
    writeFixture();
  });
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('scan: две спеки → два юнита; тикет прикреплён к модулю по Meta', () => {
    const scan = scanMigrationUnits(root);
    assert.strictEqual(scan.units.length, 2);
    assert.strictEqual(scan.orphanTickets.length, 0);
    const core = scan.units.find((u) => u.module === 'core');
    assert.ok(core);
    assert.strictEqual(core.tickets.length, 1);
    assert.strictEqual(core.tickets[0]?.taskId, 'TSK-7');
    assert.strictEqual(core.mermaidCount, 1);
    const scope = scan.units.find((u) => u.module === null);
    assert.ok(scope);
    assert.strictEqual(scope.scopeType, 'library');
    assert.ok(scope.targetSections.includes('OVERVIEW'));
    assert.ok(scope.targetSections.includes('PUBLIC_API_SURFACE'));
    assert.ok(core.targetSections.includes('MODULE_CONTRACTS'));
  });

  it('scan детерминирован: два прохода — идентичный результат', () => {
    assert.deepStrictEqual(scanMigrationUnits(root), scanMigrationUnits(root));
  });

  it('unitFilePath зеркалит дерево specs/ под migration/', () => {
    const scan = scanMigrationUnits(root);
    const core = scan.units.find((u) => u.module === 'core');
    assert.ok(core);
    assert.strictEqual(
      unitFilePath(core),
      join('migration', 'demo', 'core', 'core.spec.migration.md')
    );
  });

  it('скаффолд PLANNED-юнита проходит verify без findings', () => {
    const scan = scanMigrationUnits(root);
    for (const unit of scan.units) {
      const content = scaffoldUnitFile(unit);
      assert.deepStrictEqual(verifyUnitFile(unitFilePath(unit), content, unit), []);
    }
  });

  it('MAPPED без заполнения карт → findings (цель ?, слаг ?, диаграмма ?)', () => {
    const scan = scanMigrationUnits(root);
    const core = scan.units.find((u) => u.module === 'core');
    assert.ok(core);
    const content = scaffoldUnitFile(core).replace('**Status:** PLANNED', '**Status:** MAPPED');
    const codes = verifyUnitFile('u.md', content, core).map((f) => f.code);
    assert.ok(codes.includes('MIG_TARGET_UNSET'), `нет MIG_TARGET_UNSET: ${codes.join(',')}`);
    assert.ok(codes.includes('MIG_BAD_SLUG'), `нет MIG_BAD_SLUG: ${codes.join(',')}`);
    assert.ok(
      codes.includes('MIG_DIAGRAM_PLAN_EMPTY'),
      `нет MIG_DIAGRAM_PLAN_EMPTY: ${codes.join(',')}`
    );
  });

  it('корректно заполненный MAPPED-юнит проходит verify', () => {
    const scan = scanMigrationUnits(root);
    const core = scan.units.find((u) => u.module === 'core');
    assert.ok(core);
    let content = scaffoldUnitFile(core)
      .replace('**Status:** PLANNED', '**Status:** MAPPED')
      .replace(
        '| `## 1. Module Vision` | ? | ? | |',
        '| `## 1. Module Vision` | rename | MODULE_VISION | |'
      )
      .replace(
        '| `tasks/demo/core/core.task-7.md` | TSK-7 | ? | ? |',
        '| `tasks/demo/core/core.task-7.md` | TSK-7 | core-demo-feature | `specs/demo/core/core.task.core-demo-feature.md` |'
      )
      .replace(
        '- Overview-диаграмма: ?',
        '- Overview-диаграмма: существующий flowchart из Module Vision.'
      );
    const findings = verifyUnitFile('u.md', content, core);
    assert.deepStrictEqual(findings, [], JSON.stringify(findings, null, 2));
  });

  it('дрейф инвентаря: спека изменилась после генерации → MIG_INVENTORY_DRIFT', () => {
    const scan = scanMigrationUnits(root);
    const core = scan.units.find((u) => u.module === 'core');
    assert.ok(core);
    const content = scaffoldUnitFile(core);
    writeFileSync(
      join(root, 'specs', 'demo', 'core', 'core.spec.md'),
      MODULE_SPEC + '\n## 2. New\nx',
      'utf-8'
    );
    const fresh = scanMigrationUnits(root).units.find((u) => u.module === 'core');
    assert.ok(fresh);
    const codes = verifyUnitFile('u.md', content, fresh).map((f) => f.code);
    assert.ok(codes.includes('MIG_INVENTORY_DRIFT'), codes.join(','));
    assert.ok(codes.includes('MIG_SECTION_UNMAPPED'), codes.join(','));
  });

  it('verifyMigrationPlan: слой не сгенерирован → MIG_UNIT_FILE_MISSING на каждый юнит', () => {
    const codes = verifyMigrationPlan(root).map((f) => f.code);
    assert.strictEqual(codes.filter((c) => c === 'MIG_UNIT_FILE_MISSING').length, 2);
  });

  it('verifyMigrationPlan: полный слой чист; коллизия слагов между юнитами ловится', () => {
    const scan = scanMigrationUnits(root);
    for (const unit of scan.units) {
      const p = join(root, unitFilePath(unit));
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, scaffoldUnitFile(unit), 'utf-8');
    }
    writeFileSync(join(root, 'migration', 'README.md'), scaffoldPlanReadme(scan), 'utf-8');
    assert.deepStrictEqual(verifyMigrationPlan(root), []);

    // второй тикет в scope-юните с тем же новым ID → коллизия
    writeFileSync(
      join(root, 'tasks', 'demo', 'demo.task-8.md'),
      [
        '# Task: TSK-8 — Ещё',
        '## 1. Meta',
        '- **Task-ID:** TSK-8 | **Status:** [ ] TODO | **Scope:** demo',
        '- **Purpose:** ещё фича.',
      ].join('\n'),
      'utf-8'
    );
    const scan2 = scanMigrationUnits(root);
    for (const unit of scan2.units) {
      const filled = scaffoldUnitFile(unit).replace(
        /\| (TSK-[0-9]+) \| \? \| \? \|/g,
        '| $1 | demo-same-slug | ? |'
      );
      writeFileSync(join(root, unitFilePath(unit)), filled, 'utf-8');
    }
    const codes = verifyMigrationPlan(root).map((f) => f.code);
    assert.ok(codes.includes('MIG_SLUG_COLLISION'), codes.join(','));
  });

  it('тикет scope без спеки → orphan + MIG_TICKET_ORPHAN', () => {
    mkdirSync(join(root, 'tasks', 'ghost'), { recursive: true });
    writeFileSync(
      join(root, 'tasks', 'ghost', 'ghost.task-9.md'),
      [
        '# Task: TSK-9',
        '## 1. Meta',
        '- **Task-ID:** TSK-9 | **Status:** [ ] TODO | **Scope:** ghost',
        '- **Purpose:** x.',
      ].join('\n'),
      'utf-8'
    );
    const scan = scanMigrationUnits(root);
    assert.strictEqual(scan.orphanTickets.length, 1);
    const codes = verifyMigrationPlan(root).map((f) => f.code);
    assert.ok(codes.includes('MIG_TICKET_ORPHAN'), codes.join(','));
  });
});
