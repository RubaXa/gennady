// @file: Integration tests for SddMigrateCommand#run — anchors dry-run / write / idempotent / --all / exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
});
