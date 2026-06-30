// @file: Integration tests for SddLogCommand#run — append-only, timestamps, round numbering, placeholder rejection.
// @consumers: gennady.ts
// @tasks: N/A

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type LogModule = typeof import('../sdd-log.cmd.ts');

let mod: LogModule;
let origExit: typeof process.exit;
let origArgv: string[];
let dir: string;
let ticket: string;

const CLOCK = new Date('2026-06-21T10:00:00.000Z');

const BASE = [
  '# t',
  '<!--SECTION:META-->',
  '- **Task-ID:** cli-foo',
  '<!--/SECTION:META-->',
  '',
  '<!--SECTION:EXECUTION_LOG-->',
  '## 7. Execution Log',
  '<!--/SECTION:EXECUTION_LOG-->',
].join('\n');

function argv(...rest: string[]): string[] {
  return ['node', 'gennady', 'sdd-log', ...rest];
}

describe('SddLogCommand', () => {
  before(async () => {
    origExit = process.exit;
    origArgv = process.argv;
    process.exit = ((_code?: number) => undefined) as typeof process.exit;
    process.argv = ['node', 'gennady', 'sdd-log'];
    dir = mkdtempSync(join(tmpdir(), 'sdd-log-'));
    ticket = join(dir, 'ticket.md');
    mod = await import('../sdd-log.cmd.ts');
  });

  beforeEach(() => {
    writeFileSync(ticket, BASE, 'utf-8');
  });

  after(() => {
    process.exit = origExit;
    process.argv = origArgv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('opens a round, numbered and dated, before the close marker', async () => {
    const outcome = await mod.run(argv(ticket, 'round', 'initial'), CLOCK);
    assert.strictEqual(outcome.ok, true);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /### Round 1 — 2026-06-21, initial/);
    // inserted before the close marker
    assert.ok(body.indexOf('### Round 1') < body.indexOf('<!--/SECTION:EXECUTION_LOG-->'));
  });

  it('auto-increments the round number', async () => {
    await mod.run(argv(ticket, 'round', 'initial'), CLOCK);
    await mod.run(argv(ticket, 'round', 'fix: F-001'), CLOCK);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /### Round 1 — /);
    assert.match(body, /### Round 2 — 2026-06-21, fix: F-001/);
  });

  it('appends a timestamped event line and preserves = in content', async () => {
    const outcome = await mod.run(argv(ticket, 'line', 'ver `npm run check` → pass exit=0'), CLOCK);
    assert.strictEqual(outcome.ok, true);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /- \[x\] `2026-06-21T10:00:00\.000Z` ver `npm run check` → pass exit=0/);
  });

  it('appends the round-close block', async () => {
    const outcome = await mod.run(argv(ticket, 'close'), CLOCK);
    assert.strictEqual(outcome.ok, true);
    assert.match(
      readFileSync(ticket, 'utf-8'),
      /#### Round close\n- \[x\] `2026-06-21T10:00:00\.000Z` DONE/
    );
  });

  it('is append-only — prior sections are untouched', async () => {
    await mod.run(argv(ticket, 'line', 'DONE'), CLOCK);
    const body = readFileSync(ticket, 'utf-8');
    assert.match(body, /<!--SECTION:META-->\n- \*\*Task-ID:\*\* cli-foo\n<!--\/SECTION:META-->/);
    assert.match(body, /## 7\. Execution Log/);
  });

  it('rejects content with an unreplaced placeholder (exit 2)', async () => {
    const outcome = await mod.run(argv(ticket, 'line', 'ver `<cmd>` → pass'), CLOCK);
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) {
      assert.strictEqual(outcome.exitCode, 2);
      assert.match(outcome.code, /PLACEHOLDER/);
    }
    // nothing written
    assert.doesNotMatch(readFileSync(ticket, 'utf-8'), /cmd/);
  });

  it('exits 2 when there is no EXECUTION_LOG section', async () => {
    const noLog = join(dir, 'nolog.md');
    writeFileSync(noLog, '# t\n<!--SECTION:META-->\nx\n<!--/SECTION:META-->\n', 'utf-8');
    const outcome = await mod.run(argv(noLog, 'line', 'DONE'), CLOCK);
    assert.strictEqual(outcome.ok, false);
    if (!outcome.ok) assert.strictEqual(outcome.exitCode, 2);
  });

  it('exits 4 on unknown mode or missing content', async () => {
    const bad = await mod.run(argv(ticket, 'frobnicate'), CLOCK);
    assert.strictEqual(bad.ok, false);
    if (!bad.ok) assert.strictEqual(bad.exitCode, 4);
    const noContent = await mod.run(argv(ticket, 'line'), CLOCK);
    assert.strictEqual(noContent.ok, false);
    if (!noContent.ok) assert.strictEqual(noContent.exitCode, 4);
  });
});
