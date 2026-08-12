// @file: Unit tests for id-replace — TSV map validation, word-boundary replacement, leftover gate.
// @consumers: id-replace
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseIdMap, replaceIds, findRemainingOldIds, idMapFromPlan } from '../id-replace.ts';
import { scanMigrationUnits, scaffoldUnitFile, unitFilePath } from '../migration-plan.ts';

let root: string;

describe('id-replace', () => {
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'sdd-id-replace-'));
  });
  beforeEach(() => {
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, 'specs'), { recursive: true });
    mkdirSync(join(root, 'cli'), { recursive: true });
  });
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('parseIdMap', () => {
    it('валидная карта парсится; комментарии и пустые строки игнорируются', () => {
      const r = parseIdMap('# карта\nTSK-1\tcat-vcs-url\n\nTSK-2\tlint-targets\n');
      assert.ok(r.ok);
      if (r.ok) assert.strictEqual(r.map.length, 2);
    });

    it('дубли old/new, old===new, цепочки — отклоняются с перечислением всех проблем', () => {
      const r = parseIdMap(
        [
          'TSK-1\tsame-id',
          'TSK-1\tother-id',
          'TSK-2\tsame-id',
          'TSK-3\tTSK-3',
          'TSK-4\tTSK-5',
          'TSK-5\tfinal-id',
        ].join('\n')
      );
      assert.ok(!r.ok);
      if (!r.ok) {
        const text = r.errors.join('\n');
        assert.match(text, /повторно/);
        assert.match(text, /совпадают/);
        assert.match(text, /цепочка/);
      }
    });

    it('малформированная строка (нет TAB) — ошибка', () => {
      const r = parseIdMap('TSK-1 cat-vcs-url');
      assert.ok(!r.ok);
    });
  });

  describe('replaceIds', () => {
    it('заменяет только точные ID по словогранице; UTF-8 и TSK-310 не тронуты', () => {
      const f = join(root, 'specs', 'a.md');
      writeFileSync(f, 'TSK-31 ok, TSK-310 нет, UTF-8 нет, xTSK-31 нет, (TSK-31) да', 'utf-8');
      const report = replaceIds(root, [{ old: 'TSK-31', next: 'cat-vcs-url' }], true);
      assert.strictEqual(report.length, 1);
      assert.strictEqual(report[0]?.count, 2);
      const body = readFileSync(f, 'utf-8');
      assert.match(body, /cat-vcs-url ok/);
      assert.match(body, /\(cat-vcs-url\)/);
      assert.match(body, /TSK-310 нет/);
      assert.match(body, /UTF-8 нет/);
      assert.match(body, /xTSK-31 нет/);
    });

    it('dry-run считает, но не пишет', () => {
      const f = join(root, 'cli', 'a.ts');
      writeFileSync(f, '// TSK-7', 'utf-8');
      const report = replaceIds(root, [{ old: 'TSK-7', next: 'demo-x' }], false);
      assert.strictEqual(report[0]?.count, 1);
      assert.match(readFileSync(f, 'utf-8'), /TSK-7/);
    });

    it('findRemainingOldIds: после полной замены пусто; при остатке называет файл и ID', () => {
      const f = join(root, 'specs', 'b.md');
      writeFileSync(f, 'TSK-9 и ещё TSK-9', 'utf-8');
      const map = [{ old: 'TSK-9', next: 'demo-y' }];
      replaceIds(root, map, true);
      assert.deepStrictEqual(findRemainingOldIds(root, map), []);
      writeFileSync(f, 'вернулся TSK-9', 'utf-8');
      const left = findRemainingOldIds(root, map);
      assert.strictEqual(left.length, 1);
      assert.strictEqual(left[0]?.id, 'TSK-9');
    });
  });

  describe('idMapFromPlan', () => {
    it('собирает карту из заполненных Ticket Map юнитов, пропуская ?', () => {
      mkdirSync(join(root, 'specs', 'demo'), { recursive: true });
      mkdirSync(join(root, 'tasks', 'demo'), { recursive: true });
      writeFileSync(
        join(root, 'specs', 'demo', 'demo.spec.md'),
        '# demo\n<!--SECTION:SCOPE_TYPE-->\n## scope-type\nlibrary\n<!--/SECTION:SCOPE_TYPE-->\n## 1. Vision\nx',
        'utf-8'
      );
      writeFileSync(
        join(root, 'tasks', 'demo', 'demo.task-3.md'),
        '# Task: TSK-3\n## 1. Meta\n- **Task-ID:** TSK-3 | **Status:** [ ] TODO | **Scope:** demo\n- **Purpose:** демо.',
        'utf-8'
      );
      const scan = scanMigrationUnits(root);
      const unit = scan.units[0];
      assert.ok(unit);
      const filled = scaffoldUnitFile(unit).replace(
        '| `tasks/demo/demo.task-3.md` | TSK-3 | ? | ? |',
        '| `tasks/demo/demo.task-3.md` | TSK-3 | demo-feature | `specs/demo/demo.task.demo-feature.md` |'
      );
      const p = join(root, unitFilePath(unit));
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, filled, 'utf-8');
      const result = idMapFromPlan(root);
      assert.ok(result.ok, JSON.stringify(result));
      if (result.ok) assert.strictEqual(result.tsv, 'TSK-3\tdemo-feature\n');
    });

    it('строка с невалидным (не «?») old/new — сообщение об ошибке, не молчаливый skip', () => {
      mkdirSync(join(root, 'specs', 'demo'), { recursive: true });
      mkdirSync(join(root, 'tasks', 'demo'), { recursive: true });
      writeFileSync(
        join(root, 'specs', 'demo', 'demo.spec.md'),
        '# demo\n<!--SECTION:SCOPE_TYPE-->\n## scope-type\nlibrary\n<!--/SECTION:SCOPE_TYPE-->\n## 1. Vision\nx',
        'utf-8'
      );
      writeFileSync(
        join(root, 'tasks', 'demo', 'demo.task-3.md'),
        '# Task: TSK-3\n## 1. Meta\n- Task-ID: TSK-3\n- Status: [ ] TODO\n- Scope: demo\n- Purpose: демо.',
        'utf-8'
      );
      const scan = scanMigrationUnits(root);
      const unit = scan.units[0];
      assert.ok(unit);
      // the ticket's Task-ID was NOT readable by parseMeta (simulated by keeping the placeholder
      // `—` old-ID column while filling the new-ID/dest — an invalid, non-`?` row) — must be
      // reported, never silently dropped.
      const filled = scaffoldUnitFile(unit).replace(
        '| `tasks/demo/demo.task-3.md` | TSK-3 | ? | ? |',
        '| `tasks/demo/demo.task-3.md` | — | demo-feature | `specs/demo/demo.task.demo-feature.md` |'
      );
      const p = join(root, unitFilePath(unit));
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, filled, 'utf-8');
      const result = idMapFromPlan(root);
      assert.ok(!result.ok, JSON.stringify(result));
      if (!result.ok) assert.match(result.errors.join('\n'), /невалидна/);
    });
  });
});
