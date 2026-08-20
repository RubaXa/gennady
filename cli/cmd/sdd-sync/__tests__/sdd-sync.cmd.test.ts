// @file: Integration tests for SddSyncCommand#run — status propagation, verify, walk-up discovery, exit codes.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type SyncModule = typeof import('../sdd-sync.cmd.ts');

let mod: SyncModule;
let origExit: typeof process.exit;
let origArgv: string[];
let dir: string;

const TICKET = [
  '# t',
  '<!--SECTION:META-->',
  '- **Task-ID:** cli-foo',
  '- **Status:** [x] DONE',
  '<!--/SECTION:META-->',
].join('\n');

const MODULE_INDEX = [
  '# m — Tasks',
  '## 1. Tracker Index',
  '| Task-ID | Title | Dependencies | Status | Reopens |',
  '|---------|-------|--------------|--------|---------|',
  '| cli-foo | Foo | — | [ ] TODO | — |',
  '| cli-bar | Bar | cli-foo | [ ] TODO | — |',
].join('\n');

const SCOPE_INDEX = [
  '## Tracker',
  '| Task-ID | Title | Module | Dependencies | Status | Reopens |',
  '|---------|-------|--------|--------------|--------|---------|',
  '| cli-foo | Foo | core | — | [ ] TODO | — |',
].join('\n');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-sync', ...rest];
}

describe('SddSyncCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-sync'];
    dir = mkdtempSync(join(tmpdir(), 'sdd-sync-'));
    mod = await import('../sdd-sync.cmd.ts');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('propagates Status into explicitly given trackers and verifies', async () => {
    const t = join(dir, 'ticket.md');
    const mi = join(dir, 'module.3-tasks.md');
    const si = join(dir, 'scope.3-tasks.md');
    writeFileSync(t, TICKET, 'utf-8');
    writeFileSync(mi, MODULE_INDEX, 'utf-8');
    writeFileSync(si, SCOPE_INDEX, 'utf-8');

    const outcome = await mod.run(argv(t, mi, si));
    assert.strictEqual(outcome.ok, true);
    if (outcome.ok) {
      assert.match(outcome.text, /cli-foo → \[x\] DONE/);
      assert.match(outcome.text, /updated:.*module\.3-tasks\.md/);
      assert.match(outcome.text, /updated:.*scope\.3-tasks\.md/);
    }
    assert.match(readFileSync(mi, 'utf-8'), /\| cli-foo \| Foo \| — \| \[x\] DONE \| — \|/);
    assert.match(readFileSync(si, 'utf-8'), /\| cli-foo \| Foo \| core \| — \| \[x\] DONE \| — \|/);
    // sibling row untouched
    assert.match(readFileSync(mi, 'utf-8'), /\| cli-bar \| Bar \| cli-foo \| \[ \] TODO \| — \|/);
  });

  it('reports in-sync on a second run (idempotent)', async () => {
    const t = join(dir, 't2.md');
    const mi = join(dir, 'm2.3-tasks.md');
    writeFileSync(t, TICKET, 'utf-8');
    writeFileSync(mi, MODULE_INDEX, 'utf-8');
    await mod.run(argv(t, mi));
    const second = await mod.run(argv(t, mi));
    assert.strictEqual(second.ok, true);
    if (second.ok) assert.match(second.text, /in-sync:.*m2\.3-tasks\.md/);
  });

  it('reports no-row when an index lacks the task', async () => {
    const t = join(dir, 't3.md');
    const mi = join(dir, 'm3.3-tasks.md');
    writeFileSync(t, TICKET, 'utf-8');
    writeFileSync(mi, MODULE_INDEX.replace(/cli-foo/g, 'cli-other'), 'utf-8');
    const outcome = await mod.run(argv(t, mi));
    assert.strictEqual(outcome.ok, true);
    if (outcome.ok) assert.match(outcome.text, /no-row:.*m3\.3-tasks\.md/);
  });

  it('auto-discovers *.3-tasks.md from the ticket dir upward', async () => {
    const scopeDir = join(dir, 'scopeX');
    const moduleDir = join(scopeDir, 'moduleX');
    mkdirSync(moduleDir, { recursive: true });
    const t = join(moduleDir, 'ticket.md');
    const mi = join(moduleDir, 'moduleX.3-tasks.md');
    const si = join(scopeDir, 'scopeX.3-tasks.md');
    writeFileSync(t, TICKET, 'utf-8');
    writeFileSync(mi, MODULE_INDEX, 'utf-8');
    writeFileSync(si, SCOPE_INDEX, 'utf-8');

    const outcome = await mod.run(argv(t)); // no explicit indexes → walk up
    assert.strictEqual(outcome.ok, true);
    assert.match(readFileSync(mi, 'utf-8'), /\[x\] DONE/);
    assert.match(readFileSync(si, 'utf-8'), /\[x\] DONE/);
  });

  it('recomputes the project-index Progress (Tasks/Done) rollup after a Status sync', async () => {
    // Isolated tmp root (not the shared `dir`) — a bare `3-tasks.md` sitting directly in `dir` would
    // otherwise be picked up by every other test's walk-up discovery from a ticket placed in `dir`.
    const root = mkdtempSync(join(tmpdir(), 'sdd-sync-progress-'));
    try {
      const scopeDir = join(root, 'scopeP');
      mkdirSync(scopeDir, { recursive: true });
      const t = join(scopeDir, 'ticket.md');
      const mi = join(scopeDir, 'scopeP.3-tasks.md');
      const projectIndex = join(root, '3-tasks.md');

      writeFileSync(t, TICKET, 'utf-8');
      writeFileSync(
        mi,
        [
          '## Tracker',
          '| Task-ID | Title | Dependencies | Status | Reopens |',
          '|---------|-------|--------------|--------|---------|',
          '| cli-foo | Foo | — | [ ] TODO | — |',
        ].join('\n'),
        'utf-8'
      );
      writeFileSync(
        projectIndex,
        [
          '## Scope Tracker',
          '| Scope | Type | Index | Tasks | Done |',
          '|---|---|---|---|---|',
          '| scopeP | product | [3-tasks](./scopeP/scopeP.3-tasks.md) | 1 | 0/1 |',
        ].join('\n'),
        'utf-8'
      );

      const outcome = await mod.run(argv(t));
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) assert.match(outcome.text, /progress:.*3-tasks\.md/);
      assert.match(
        readFileSync(projectIndex, 'utf-8'),
        /\| scopeP \| product \| \[3-tasks\]\(\.\/scopeP\/scopeP\.3-tasks\.md\) \| 1 \| 1\/1 \|/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('leaves the Progress rollup untouched when the count already matches (idempotent)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sdd-sync-progress-'));
    try {
      const scopeDir = join(root, 'scopeQ');
      mkdirSync(scopeDir, { recursive: true });
      const t = join(scopeDir, 'ticket.md');
      const mi = join(scopeDir, 'scopeQ.3-tasks.md');
      const projectIndex = join(root, '3-tasks.md');

      writeFileSync(t, TICKET, 'utf-8');
      writeFileSync(
        mi,
        [
          '## Tracker',
          '| Task-ID | Title | Dependencies | Status | Reopens |',
          '|---------|-------|--------------|--------|---------|',
          '| cli-foo | Foo | — | [x] DONE | — |',
        ].join('\n'),
        'utf-8'
      );
      writeFileSync(
        projectIndex,
        [
          '## Scope Tracker',
          '| Scope | Type | Index | Tasks | Done |',
          '|---|---|---|---|---|',
          '| scopeQ | product | [3-tasks](./scopeQ/scopeQ.3-tasks.md) | 1 | 1/1 |',
        ].join('\n'),
        'utf-8'
      );

      const outcome = await mod.run(argv(t));
      assert.strictEqual(outcome.ok, true);
      if (outcome.ok) assert.doesNotMatch(outcome.text, /progress:/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 4 with no ticket, 1 on missing file, 2 on unparseable Meta', async () => {
    const bad = await mod.run(argv());
    assert.strictEqual(bad.ok === false && bad.exitCode, 4);

    const missing = await mod.run(argv(join(dir, 'nope.md')));
    assert.strictEqual(missing.ok === false && missing.exitCode, 1);

    const noMeta = join(dir, 'nometa.md');
    writeFileSync(
      noMeta,
      '# t\n<!--SECTION:META-->\n- nothing useful\n<!--/SECTION:META-->\n',
      'utf-8'
    );
    const meta = await mod.run(argv(noMeta));
    assert.strictEqual(meta.ok === false && meta.exitCode, 2);
  });

  it('unreadable, non-Task-ID-shaped path → tool-teaches hint points at `sdd-task`', async () => {
    const missing = await mod.run(argv(join(dir, 'nope.md')));
    assert.strictEqual(missing.ok, false);
    if (missing.ok) return;
    assert.match(missing.message, /run `sdd-task` with no arguments for the execution map/);
  });

  describe('bare Task-ID resolution (AX_TASK_RESOLUTION)', () => {
    // "cli-foo" (the shared TICKET fixture) is lowercase-ACR, not v2-Task-ID-shaped, and lacks
    // EXECUTION_LOG (isTicket requires both markers) — these tests build a grammar-conforming,
    // full ticket in an isolated, chdir'd directory instead.
    const idTicket = (id: string): string =>
      [TICKET, '<!--SECTION:EXECUTION_LOG-->', '<!--/SECTION:EXECUTION_LOG-->']
        .join('\n')
        .replace('cli-foo', id);

    it('resolves to its ticket — output is prefixed with the `[sdd-sync] <id> → <path>` banner', async () => {
      const idDir = mkdtempSync(join(tmpdir(), 'sdd-sync-id-'));
      writeFileSync(join(idDir, 'ticket.md'), idTicket('TSK-foo'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(idDir);
      try {
        const outcome = await mod.run(argv('TSK-foo'));
        assert.strictEqual(outcome.ok, true);
        if (!outcome.ok) return;
        assert.match(outcome.text, /^\[sdd-sync\] TSK-foo → ticket\.md\n/);
        assert.match(outcome.text, /TSK-foo → \[x\] DONE/);
      } finally {
        process.chdir(origCwd);
        rmSync(idDir, { recursive: true, force: true });
      }
    });

    it('an unknown but Task-ID-shaped argument → exit 2 listing known Task-IDs', async () => {
      const idDir = mkdtempSync(join(tmpdir(), 'sdd-sync-id-'));
      writeFileSync(join(idDir, 'ticket.md'), idTicket('TSK-foo'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(idDir);
      try {
        const outcome = await mod.run(argv('NOPE-ghost'));
        assert.strictEqual(outcome.ok, false);
        if (outcome.ok) return;
        assert.strictEqual(outcome.exitCode, 2);
        assert.match(outcome.message, /ERR_CLI_SDD_SYNC_UNKNOWN_ID: NOPE-ghost/);
        assert.match(outcome.message, /known Task-IDs:.*TSK-foo/);
      } finally {
        process.chdir(origCwd);
        rmSync(idDir, { recursive: true, force: true });
      }
    });

    it('a Task-ID matching two tickets → exit 2 listing both candidate paths', async () => {
      const dupDir = mkdtempSync(join(tmpdir(), 'sdd-sync-dup-'));
      writeFileSync(join(dupDir, 'a.md'), idTicket('TSK-dup'), 'utf-8');
      writeFileSync(join(dupDir, 'b.md'), idTicket('TSK-dup'), 'utf-8');
      const origCwd = process.cwd();
      process.chdir(dupDir);
      try {
        const outcome = await mod.run(argv('TSK-dup'));
        assert.strictEqual(outcome.ok, false);
        if (outcome.ok) return;
        assert.strictEqual(outcome.exitCode, 2);
        assert.match(outcome.message, /ERR_CLI_SDD_SYNC_AMBIGUOUS_ID: TSK-dup matches 2 tickets/);
        assert.match(outcome.message, /a\.md/);
        assert.match(outcome.message, /b\.md/);
      } finally {
        process.chdir(origCwd);
        rmSync(dupDir, { recursive: true, force: true });
      }
    });

    it('an existing ticket path still works exactly as before (no resolution banner)', async () => {
      const t = join(dir, 'no-banner.md');
      writeFileSync(t, TICKET, 'utf-8');
      const outcome = await mod.run(argv(t));
      assert.strictEqual(outcome.ok, true);
      if (!outcome.ok) return;
      // The `[sdd-sync] <id> → <status>` header is always first; a path-arg carries no extra
      // `[sdd-sync] <id> → <path>` resolution banner line ahead of it.
      assert.match(outcome.text, /^\[sdd-sync\] cli-foo → \[x\] DONE\n/);
    });
  });
});
