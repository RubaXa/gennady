// @file: Integration tests for SddMigrateCommand#run — anchors dry-run / write / idempotent / --all / exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type MigrateModule = typeof import('../sdd-migrate.cmd.ts');

let mod: MigrateModule;
let origExit: typeof process.exit;
let origArgv: string[];
let dir: string;
let ticket: string;

const V1 = [
  '# Task: TSK-1 — Demo',
  '## 1. Meta',
  '- **Task-ID:** TSK-1',
  '- **Status:** [x] DONE',
  '## 7. Execution Log',
  '- [x] DONE',
].join('\n');

// A real v1 ticket that never had an `## Execution Log` header at all — the anchors-scaffold case.
const V1_NO_EXEC_LOG = [
  '# Task: TSK-2 — No Log',
  '## 1. Meta',
  '- **Task-ID:** TSK-2',
  '- **Status:** [x] DONE',
].join('\n');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-migrate', ...rest];
}

describe('SddMigrateCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-migrate'];
    dir = mkdtempSync(join(tmpdir(), 'sdd-migrate-'));
    ticket = join(dir, 'demo.task-1.md');
    mod = await import('../sdd-migrate.cmd.ts');
  });

  beforeEach(() => {
    writeFileSync(ticket, V1, 'utf-8');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('dry-run reports sections without touching the file', async () => {
    const o = await mod.run(argv('anchors', ticket));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /DRY-RUN/);
      assert.match(o.text, /would .* META, EXECUTION_LOG/);
    }
    assert.doesNotMatch(readFileSync(ticket, 'utf-8'), /SECTION:META/);
  });

  it('--write injects the anchors into the file', async () => {
    const o = await mod.run(argv('anchors', ticket, '--write'));
    assert.strictEqual(o.ok, true);
    if (o.ok) assert.match(o.text, /WRITE/);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /<!--SECTION:META-->/);
    assert.match(body, /<!--\/SECTION:EXECUTION_LOG-->/);
  });

  it('is idempotent — a second --write skips the already-anchored ticket', async () => {
    await mod.run(argv('anchors', ticket, '--write'));
    const o = await mod.run(argv('anchors', ticket, '--write'));
    assert.strictEqual(o.ok, true);
    if (o.ok) assert.match(o.text, /skip .* already anchored/);
  });

  it('--all walks tasks/**/*.task-*.md', async () => {
    const root = join(dir, 'proj');
    mkdirSync(join(root, 'tasks', 'scopeA'), { recursive: true });
    writeFileSync(join(root, 'tasks', 'scopeA', 'a.task-1.md'), V1, 'utf-8');
    const o = await mod.run(argv('anchors', '--all', root));
    assert.strictEqual(o.ok, true);
    if (o.ok) {
      assert.match(o.text, /1 ticket\(s\)/);
      assert.match(o.text, /a\.task-1\.md/);
    }
  });

  it('exits 4 on an unknown mode', async () => {
    const o = await mod.run(argv('frobnicate', ticket));
    assert.strictEqual(o.ok, false);
    if (!o.ok) assert.strictEqual(o.exitCode, 4);
  });

  it('--write scaffolds a missing Execution Log for a v1 ticket that never had one', async () => {
    const noLogTicket = join(dir, 'noexeclog.task-2.md');
    writeFileSync(noLogTicket, V1_NO_EXEC_LOG, 'utf-8');

    const o = await mod.run(argv('anchors', noLogTicket, '--write'));
    assert.strictEqual(o.ok, true);
    if (o.ok) assert.match(o.text, /EXECUTION_LOG \(scaffolded/);

    const body = readFileSync(noLogTicket, 'utf-8');
    assert.match(body, /<!--SECTION:META-->/);
    assert.match(body, /<!--SECTION:EXECUTION_LOG-->/);
    assert.match(body, /## Execution Log/);
    assert.match(body, /migrated from v1 — no rounds\/phases recorded in v1 format/);
  });

  it('scaffolded Execution Log is idempotent — a second --write does not duplicate it', async () => {
    const noLogTicket = join(dir, 'noexeclog2.task-2.md');
    writeFileSync(noLogTicket, V1_NO_EXEC_LOG, 'utf-8');

    await mod.run(argv('anchors', noLogTicket, '--write'));
    const firstBody = readFileSync(noLogTicket, 'utf-8');

    const o = await mod.run(argv('anchors', noLogTicket, '--write'));
    assert.strictEqual(o.ok, true);
    if (o.ok) assert.match(o.text, /skip .* already anchored/);

    const secondBody = readFileSync(noLogTicket, 'utf-8');
    assert.strictEqual(secondBody, firstBody);
    const occurrences = secondBody.split('<!--SECTION:EXECUTION_LOG-->').length - 1;
    assert.strictEqual(occurrences, 1);
  });

  it('a ticket that already has an Execution Log header is not touched by the scaffold', async () => {
    // `ticket` fixture (V1) already carries a real Execution Log header.
    const o = await mod.run(argv('anchors', ticket, '--write'));
    assert.strictEqual(o.ok, true);
    if (o.ok) assert.doesNotMatch(o.text, /scaffolded/);

    const body = readFileSync(ticket, 'utf-8');
    assert.doesNotMatch(body, /migrated from v1 — no rounds\/phases recorded/);
  });

  describe('plan mode', () => {
    let root: string;

    const SPEC = [
      '# demo',
      '<!--SECTION:SCOPE_TYPE-->',
      '## scope-type',
      'library',
      '<!--/SECTION:SCOPE_TYPE-->',
      '## 1. Vision & Primary Goal',
      'Текст.',
    ].join('\n');

    const PLAN_TICKET = [
      '# Task: TSK-3 — Демо',
      '## 1. Meta',
      '- **Task-ID:** TSK-3 | **Status:** [ ] TODO | **Scope:** demo',
      '- **Purpose:** демо.',
    ].join('\n');

    beforeEach(() => {
      root = join(dir, 'plan-proj');
      rmSync(root, { recursive: true, force: true });
      mkdirSync(join(root, 'specs', 'demo'), { recursive: true });
      mkdirSync(join(root, 'tasks', 'demo'), { recursive: true });
      writeFileSync(join(root, 'specs', 'demo', 'demo.spec.md'), SPEC, 'utf-8');
      writeFileSync(join(root, 'tasks', 'demo', 'demo.task-3.md'), PLAN_TICKET, 'utf-8');
    });

    it('dry-run reports units without writing the layer', async () => {
      const o = await mod.run(argv('plan', root));
      assert.strictEqual(o.ok, true);
      if (o.ok) {
        assert.match(o.text, /DRY-RUN/);
        assert.match(o.text, /would migration\/demo\/demo\.spec\.migration\.md/);
      }
      assert.strictEqual(existsSync(join(root, 'migration')), false);
    });

    it('--write scaffolds the layer + README; --verify then passes on PLANNED units', async () => {
      const w = await mod.run(argv('plan', root, '--write'));
      assert.strictEqual(w.ok, true);
      assert.ok(existsSync(join(root, 'migration', 'demo', 'demo.spec.migration.md')));
      assert.ok(existsSync(join(root, 'migration', 'README.md')));
      const v = await mod.run(argv('plan', root, '--verify'));
      assert.strictEqual(v.ok, true, JSON.stringify(v));
    });

    it('--verify fails with exit 1 when the layer is missing', async () => {
      const v = await mod.run(argv('plan', root, '--verify'));
      assert.strictEqual(v.ok, false);
      if (!v.ok) {
        assert.strictEqual(v.exitCode, 1);
        assert.match(v.message, /MIG_UNIT_FILE_MISSING/);
      }
    });
  });

  describe('ids mode', () => {
    let root: string;

    beforeEach(() => {
      root = join(dir, 'ids-proj');
      rmSync(root, { recursive: true, force: true });
      mkdirSync(join(root, 'specs'), { recursive: true });
      writeFileSync(join(root, 'specs', 'a.md'), 'см. TSK-5 и TSK-50', 'utf-8');
      writeFileSync(join(root, 'map.tsv'), 'TSK-5\tdemo-feature\n', 'utf-8');
    });

    it('dry-run по карте считает вхождения, файл не тронут', async () => {
      const o = await mod.run(argv('ids', root, '--map', join(root, 'map.tsv')));
      assert.strictEqual(o.ok, true);
      if (o.ok) assert.match(o.text, /DRY-RUN .* 1 ID .* 1 вхождений/);
      assert.match(readFileSync(join(root, 'specs', 'a.md'), 'utf-8'), /TSK-5 и TSK-50/);
    });

    it('--write заменяет и проходит гейт «ноль старых ID»; TSK-50 не тронут', async () => {
      const o = await mod.run(argv('ids', root, '--map', join(root, 'map.tsv'), '--write'));
      assert.strictEqual(o.ok, true, JSON.stringify(o));
      const body = readFileSync(join(root, 'specs', 'a.md'), 'utf-8');
      assert.match(body, /demo-feature и TSK-50/);
    });

    it('невалидная карта → exit 1 с перечислением проблем', async () => {
      writeFileSync(join(root, 'map.tsv'), 'TSK-5\tdemo-feature\nTSK-5\tother\n', 'utf-8');
      const o = await mod.run(argv('ids', root, '--map', join(root, 'map.tsv')));
      assert.strictEqual(o.ok, false);
      if (!o.ok) assert.strictEqual(o.exitCode, 1);
    });

    it('без --map и --from-plan → exit 4', async () => {
      const o = await mod.run(argv('ids', root));
      assert.strictEqual(o.ok, false);
      if (!o.ok) assert.strictEqual(o.exitCode, 4);
    });
  });
});
